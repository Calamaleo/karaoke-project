from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, Request, Response, HTTPException, Depends, WebSocket, WebSocketDisconnect
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import logging
import asyncio
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict, Set
import uuid
import secrets
import bcrypt
import requests
from email_validator import validate_email, EmailNotValidError
from datetime import datetime, timezone, timedelta

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("karaoke")


# ---------- Realtime: per-event WebSocket broadcast ----------
class ConnectionManager:
    def __init__(self):
        self.rooms: Dict[str, Set[WebSocket]] = {}

    async def connect(self, event_id: str, ws: WebSocket):
        await ws.accept()
        self.rooms.setdefault(event_id, set()).add(ws)

    def disconnect(self, event_id: str, ws: WebSocket):
        room = self.rooms.get(event_id)
        if room:
            room.discard(ws)
            if not room:
                self.rooms.pop(event_id, None)

    async def broadcast(self, event_id: str, message: dict):
        room = list(self.rooms.get(event_id, set()))
        for ws in room:
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect(event_id, ws)


manager = ConnectionManager()


async def notify(event_id: str):
    await manager.broadcast(event_id, {"type": "queue_updated"})


EMAIL_INVALID_MSG = "Il dominio dell'email non sembra valido o non esiste."
_email_domain_cache: Dict[str, bool] = {}


def check_email_deliverable(email: str) -> bool:
    """Verify the email domain actually exists / can receive mail (MX check). No email sent.
    Results are cached per-domain to avoid repeated DNS lookups during an event."""
    domain = email.rsplit("@", 1)[-1].strip().lower() if "@" in email else ""
    if domain and domain in _email_domain_cache:
        return _email_domain_cache[domain]
    try:
        validate_email(email, check_deliverability=True)
        result = True
    except EmailNotValidError:
        result = False
    if domain:
        _email_domain_cache[domain] = result
    return result

SESSION_DAYS = 7
GENRE_OPTIONS = ["Pop", "Rock", "Hip-Hop", "R&B", "Latino", "Elettronica", "Classica", "Country", "Metal", "Indie", "Jazz", "Altro"]
MOOD_OPTIONS = ["Energico", "Romantico", "Triste", "Festa", "Chill", "Epico"]

# Map iTunes primaryGenreName -> our genre options
def map_genre(itunes_genre: str) -> str:
    g = (itunes_genre or "").lower()
    if "metal" in g:
        return "Metal"
    if "rock" in g:
        return "Rock"
    if "hip" in g or "rap" in g:
        return "Hip-Hop"
    if "r&b" in g or "soul" in g:
        return "R&B"
    if "latin" in g:
        return "Latino"
    if any(k in g for k in ["dance", "electro", "house", "techno", "edm"]):
        return "Elettronica"
    if "classical" in g:
        return "Classica"
    if "country" in g:
        return "Country"
    if "jazz" in g:
        return "Jazz"
    if any(k in g for k in ["alternative", "indie"]):
        return "Indie"
    if "pop" in g:
        return "Pop"
    return "Altro"

# Derive a mood from the genre + light title heuristics
def derive_mood(genre: str, title: str = "") -> str:
    t = (title or "").lower()
    if any(k in t for k in ["love", "amore", "heart", "cuore", "ti amo"]):
        return "Romantico"
    if any(k in t for k in ["cry", "sad", "tears", "lacrime", "solo", "alone", "addio"]):
        return "Triste"
    by_genre = {
        "Rock": "Energico", "Metal": "Epico", "Pop": "Festa", "Hip-Hop": "Energico",
        "R&B": "Romantico", "Latino": "Festa", "Elettronica": "Festa",
        "Classica": "Chill", "Country": "Chill", "Indie": "Chill", "Jazz": "Chill",
        "Altro": "Festa",
    }
    return by_genre.get(genre, "Festa")


def classify_song(title: str, artist: str) -> dict:
    """Query iTunes once to detect genre, then derive mood. Falls back to defaults."""
    try:
        term = f"{title} {artist}".strip()
        r = requests.get("https://itunes.apple.com/search", params={
            "term": term, "media": "music", "entity": "song", "limit": 1, "country": "IT",
        }, timeout=8)
        res = r.json().get("results", [])
        if not res:
            r = requests.get("https://itunes.apple.com/search", params={
                "term": term, "media": "music", "entity": "song", "limit": 1, "country": "US",
            }, timeout=8)
            res = r.json().get("results", [])
        if res:
            genre = map_genre(res[0].get("primaryGenreName", ""))
            return {"genre": genre, "mood": derive_mood(genre, title)}
    except Exception:
        pass
    return {"genre": "Altro", "mood": derive_mood("Altro", title)}


# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def set_session_cookie(response: Response, token: str):
    response.set_cookie(
        key="session_token", value=token, httponly=True, secure=True,
        samesite="none", max_age=SESSION_DAYS * 24 * 3600, path="/",
    )


async def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": token,
        "expires_at": iso(now_utc() + timedelta(days=SESSION_DAYS)),
        "created_at": iso(now_utc()),
    })
    return token


def public_user(u: dict) -> dict:
    return {"user_id": u["user_id"], "email": u["email"], "name": u["name"],
            "picture": u.get("picture"), "provider": u.get("provider", "password")}


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("session_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Non autenticato")
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Sessione non valida")
    expires_at = session["expires_at"]
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < now_utc():
        raise HTTPException(status_code=401, detail="Sessione scaduta")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Utente non trovato")
    return user


# ---------- Models ----------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: str = Field(min_length=1)

class NotificationToken(BaseModel):
    event_id: str
    email: EmailStr
    token: str

class LoginInput(BaseModel):
    email: EmailStr
    password: str


class SessionInput(BaseModel):
    session_id: str


class EventCreate(BaseModel):
    name: str = Field(min_length=1)


class QueueControlInput(BaseModel):
    bookings_open: Optional[bool] = None
    close_at: Optional[str] = None  # ISO string or empty to clear


class JoinInput(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1)


class EntryCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1)
    song_title: str = Field(min_length=1)
    song_artist: str = ""
    genre: Optional[str] = None
    mood: Optional[str] = None


class ReorderInput(BaseModel):
    ordered_ids: List[str]


# ---------- Event serialization ----------
def event_public(ev: dict) -> dict:
    close_at = ev.get("close_at")
    closed = not ev.get("bookings_open", True)
    if not closed and close_at:
        ca = datetime.fromisoformat(close_at)
        if ca.tzinfo is None:
            ca = ca.replace(tzinfo=timezone.utc)
        if ca < now_utc():
            closed = True
    return {
        "event_id": ev["event_id"],
        "name": ev["name"],
        "join_code": ev["join_code"],
        "bookings_open": ev.get("bookings_open", True),
        "close_at": close_at,
        "effective_closed": closed,
        "created_at": ev.get("created_at"),
    }


async def entries_for(event_id: str, status: Optional[str] = None) -> List[dict]:
    q = {"event_id": event_id}
    if status:
        q["status"] = status
    rows = await db.queue_entries.find(q, {"_id": 0}).to_list(1000)
    return rows


# ---------- Auth routes ----------
@api_router.post("/auth/register")
async def register(payload: RegisterInput, response: Response):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email già registrata")
    user_id = new_id("user")
    await db.users.insert_one({
        "user_id": user_id, "email": email, "name": payload.name,
        "password_hash": hash_password(payload.password), "role": "host",
        "provider": "password", "picture": None, "created_at": iso(now_utc()),
    })
    token = await create_session(user_id)
    set_session_cookie(response, token)
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {**public_user(user), "token": token}


@api_router.post("/auth/login")
async def login(payload: LoginInput, response: Response):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    token = await create_session(user["user_id"])
    set_session_cookie(response, token)
    return {**public_user(user), "token": token}


@api_router.post("/auth/session")
async def google_session(payload: SessionInput, response: Response):
    try:
        r = requests.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": payload.session_id}, timeout=10,
        )
    except Exception:
        raise HTTPException(status_code=502, detail="Auth provider non raggiungibile")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessione Google non valida")
    data = r.json()
    email = data["email"].lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": data.get("name", existing["name"]), "picture": data.get("picture")}})
    else:
        user_id = new_id("user")
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": data.get("name", email),
            "password_hash": None, "role": "host", "provider": "google",
            "picture": data.get("picture"), "created_at": iso(now_utc()),
        })
    # store provider session token as our session too
    await db.user_sessions.insert_one({
        "user_id": user_id, "session_token": data["session_token"],
        "expires_at": iso(now_utc() + timedelta(days=SESSION_DAYS)), "created_at": iso(now_utc()),
    })
    set_session_cookie(response, data["session_token"])
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {**public_user(user), "token": data["session_token"]}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ---------- Meta ----------
@api_router.get("/meta")
async def meta():
    return {"genres": GENRE_OPTIONS, "moods": MOOD_OPTIONS}


class EmailCheck(BaseModel):
    email: str


@api_router.post("/validate-email")
async def validate_email_endpoint(payload: EmailCheck):
    raw = (payload.email or "").strip()
    if not raw:
        return {"valid": False, "reason": "Inserisci un'email."}
    if await asyncio.to_thread(check_email_deliverable, raw):
        return {"valid": True, "reason": None}
    return {"valid": False, "reason": EMAIL_INVALID_MSG}


# ---------- Song search (iTunes library) ----------
@api_router.get("/songs/search")
async def song_search(q: str, country: str = "IT"):
    if not q or len(q.strip()) < 2:
        return {"results": []}
    def fetch(ctry):
        r = requests.get("https://itunes.apple.com/search", params={
            "term": q, "media": "music", "entity": "song", "limit": 25, "country": ctry,
        }, timeout=10)
        return r.json().get("results", [])
    try:
        items = fetch(country)
        if len(items) < 5:
            # widen to the US catalogue and merge (dedup by title+artist)
            seen = {(it.get("trackName"), it.get("artistName")) for it in items}
            for it in fetch("US"):
                key = (it.get("trackName"), it.get("artistName"))
                if key not in seen:
                    seen.add(key)
                    items.append(it)
        results = [{
            "song_title": it.get("trackName", ""),
            "song_artist": it.get("artistName", ""),
            "genre": map_genre(it.get("primaryGenreName", "")),
            "mood": derive_mood(map_genre(it.get("primaryGenreName", "")), it.get("trackName", "")),
            "artwork": it.get("artworkUrl60"),
        } for it in items if it.get("trackName")]
    except Exception:
        results = []
    return {"results": results}


# ---------- Event routes (host) ----------
@api_router.post("/events")
async def create_event(payload: EventCreate, user: dict = Depends(get_current_user)):
    event_id = new_id("evt")
    join_code = uuid.uuid4().hex[:6].upper()
    doc = {
        "event_id": event_id, "host_user_id": user["user_id"], "name": payload.name,
        "join_code": join_code, "bookings_open": True, "close_at": None,
        "created_at": iso(now_utc()),
    }
    await db.events.insert_one(doc)
    return event_public(doc)


@api_router.get("/events/mine")
async def my_events(user: dict = Depends(get_current_user)):
    rows = await db.events.find({"host_user_id": user["user_id"]}, {"_id": 0}).to_list(200)
    rows.sort(key=lambda e: e.get("created_at", ""), reverse=True)
    return [event_public(e) for e in rows]


async def _get_owned_event(event_id: str, user: dict) -> dict:
    ev = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    if ev["host_user_id"] != user["user_id"]:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    return ev


@api_router.get("/events/{event_id}")
async def get_event(event_id: str, user: dict = Depends(get_current_user)):
    ev = await _get_owned_event(event_id, user)
    active = await entries_for(event_id, "active")
    sung = await entries_for(event_id, "sung")
    active.sort(key=lambda e: (e.get("position", 10**9), e.get("created_at", "")))
    sung.sort(key=lambda e: e.get("sung_at", ""), reverse=True)
    counts = {}
    for e in active:
        counts[e["email"]] = counts.get(e["email"], 0) + 1
    for e in active:
        e["is_duplicate"] = counts[e["email"]] > 1
    return {"event": event_public(ev), "active": active, "sung": sung}


@api_router.patch("/events/{event_id}/queue-control")
async def queue_control(event_id: str, payload: QueueControlInput, user: dict = Depends(get_current_user)):
    ev = await _get_owned_event(event_id, user)
    update = {}
    if payload.bookings_open is not None:
        update["bookings_open"] = payload.bookings_open
    if payload.close_at is not None:
        update["close_at"] = payload.close_at if payload.close_at else None
    if update:
        await db.events.update_one({"event_id": event_id}, {"$set": update})
    ev = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    await notify(event_id)
    return event_public(ev)


@api_router.delete("/events/{event_id}")
async def delete_event(event_id: str, user: dict = Depends(get_current_user)):
    await _get_owned_event(event_id, user)
    await db.queue_entries.delete_many({"event_id": event_id})
    await db.events.delete_one({"event_id": event_id})
    await notify(event_id)
    return {"ok": True}


@api_router.post("/events/{event_id}/entries/{entry_id}/next")
async def mark_sung(event_id: str, entry_id: str, user: dict = Depends(get_current_user)):
    await _get_owned_event(event_id, user)
    res = await db.queue_entries.update_one(
        {"entry_id": entry_id, "event_id": event_id},
        {"$set": {"status": "sung", "sung_at": iso(now_utc())}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Brano non trovato")
    await notify(event_id)
    return {"ok": True}


@api_router.delete("/events/{event_id}/entries/{entry_id}")
async def delete_entry(event_id: str, entry_id: str, user: dict = Depends(get_current_user)):
    await _get_owned_event(event_id, user)
    await db.queue_entries.delete_one({"entry_id": entry_id, "event_id": event_id})
    await notify(event_id)
    return {"ok": True}


@api_router.patch("/events/{event_id}/reorder")
async def reorder_queue(event_id: str, payload: ReorderInput, user: dict = Depends(get_current_user)):
    await _get_owned_event(event_id, user)
    for i, eid in enumerate(payload.ordered_ids):
        await db.queue_entries.update_one(
            {"entry_id": eid, "event_id": event_id, "status": "active"},
            {"$set": {"position": i}},
        )
    await notify(event_id)
    return {"ok": True}


@api_router.post("/events/{event_id}/entries/{entry_id}/notify-turn")
async def notify_turn(event_id: str, entry_id: str, user: dict = Depends(get_current_user)):
    await _get_owned_event(event_id, user)
    ent = await db.queue_entries.find_one({"entry_id": entry_id, "event_id": event_id}, {"_id": 0})
    if not ent:
        raise HTTPException(status_code=404, detail="Brano non trovato")
    await manager.broadcast(event_id, {
        "type": "your_turn",
        "email": ent["email"],
        "singer_name": ent["singer_name"],
        "song_title": ent["song_title"],
        "song_artist": ent["song_artist"],
        "entry_id": entry_id,
    })
    return {"ok": True}
@api_router.post("/public/save-token")
async def save_notification_token(payload: NotificationToken):

    await db.notification_tokens.update_one(
        {
            "event_id": payload.event_id,
            "email": payload.email.lower()
        },
        {
            "$set": {
                "token": payload.token,
                "updated_at": iso(now_utc())
            }
        },
        upsert=True
    )

    return {
        "ok": True
    }

# ---------- Public routes (user) ----------
@api_router.get("/public/events/by-code/{join_code}")
async def public_event(join_code: str):
    ev = await db.events.find_one({"join_code": join_code.upper()}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    active = await entries_for(ev["event_id"], "active")
    taken = [{"song_title": e["song_title"], "song_artist": e["song_artist"]} for e in active]
    return {"event": event_public(ev), "taken_songs": taken, "queue_length": len(active)}


@api_router.post("/public/events/{event_id}/entries")
async def add_entry(event_id: str, payload: EntryCreate):
    ev = await db.events.find_one({"event_id": event_id}, {"_id": 0})
    if not ev:
        raise HTTPException(status_code=404, detail="Evento non trovato")
    if event_public(ev)["effective_closed"]:
        raise HTTPException(status_code=403, detail="Le prenotazioni sono chiuse")
    if not await asyncio.to_thread(check_email_deliverable, payload.email):
        raise HTTPException(status_code=400, detail=EMAIL_INVALID_MSG + " Controlla l'indirizzo.")
    active = await entries_for(event_id, "active")
    title_norm = payload.song_title.strip().lower()
    artist_norm = payload.song_artist.strip().lower()
    for e in active:
        if e["song_title"].strip().lower() == title_norm and e["song_artist"].strip().lower() == artist_norm:
            raise HTTPException(status_code=409, detail="Questo brano è già stato scelto da qualcun altro")
    # Auto-classify genre & mood on the app side. Trust valid client-provided
    # values (from a search pick); otherwise detect them from iTunes.
    if payload.genre in GENRE_OPTIONS and payload.mood in MOOD_OPTIONS:
        genre, mood = payload.genre, payload.mood
    else:
        detected = classify_song(payload.song_title, payload.song_artist)
        genre, mood = detected["genre"], detected["mood"]
    positions = [e.get("position", 0) for e in active if isinstance(e.get("position"), int)]
    next_pos = (max(positions) + 1) if positions else len(active)
    entry = {
        "entry_id": new_id("ent"), "event_id": event_id,
        "email": payload.email.lower(), "singer_name": payload.name,
        "song_title": payload.song_title.strip(), "song_artist": payload.song_artist.strip(),
        "genre": genre, "mood": mood, "status": "active", "position": next_pos,
        "created_at": iso(now_utc()), "sung_at": None,
    }
    await db.queue_entries.insert_one(entry)
    entry.pop("_id", None)
    await notify(event_id)
    return entry


# ---------- WebSocket (realtime queue updates) ----------
@app.websocket("/api/ws/{event_id}")
async def ws_event(websocket: WebSocket, event_id: str):
    print("WEBSOCKET REQUEST ARRIVATA:", event_id)

    await manager.connect(event_id, websocket)

    print("WEBSOCKET CONNESSO:", event_id)

    try:
        while True:
            data = await websocket.receive_text()

            print("WEBSOCKET RICEVUTO:", data)

            if data == "ping":
                await websocket.send_json({
                    "type": "pong"
                })

    except WebSocketDisconnect:
        print("WEBSOCKET DISCONNESSO:", event_id)
        manager.disconnect(event_id, websocket)

    except Exception as e:
        print("WEBSOCKET ERRORE:", e)
        manager.disconnect(event_id, websocket)

# ---------- Seed demo data ----------
async def seed():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id")
    await db.user_sessions.create_index("session_token")
    await db.events.create_index("join_code")
    await db.queue_entries.create_index("event_id")
    await db.notification_tokens.create_index(
    [
        ("event_id", 1),
        ("email", 1)
    ],
    unique=True
)

    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    admin = await db.users.find_one({"email": admin_email})
    if not admin:
        admin_id = new_id("user")
        await db.users.insert_one({
            "user_id": admin_id, "email": admin_email, "name": "DJ Alex",
            "password_hash": hash_password(admin_password), "role": "host",
            "provider": "password", "picture": None, "created_at": iso(now_utc()),
        })
    else:
        admin_id = admin["user_id"]
        if not verify_password(admin_password, admin.get("password_hash") or ""):
            await db.users.update_one({"user_id": admin_id}, {"$set": {"password_hash": hash_password(admin_password)}})

    # demo event
    existing_ev = await db.events.find_one({"host_user_id": admin_id})
    if not existing_ev:
        event_id = new_id("evt")
        await db.events.insert_one({
            "event_id": event_id, "host_user_id": admin_id, "name": "Sabato Neon Karaoke",
            "join_code": "NEON01", "bookings_open": True, "close_at": None,
            "created_at": iso(now_utc()),
        })
        demo_active = [
            ("giulia@example.com", "Giulia", "Bohemian Rhapsody", "Queen", "Rock", "Epico"),
            ("marco@example.com", "Marco", "Blinding Lights", "The Weeknd", "Pop", "Energico"),
            ("giulia@example.com", "Giulia", "Someone Like You", "Adele", "Pop", "Triste"),
            ("sara@example.com", "Sara", "Dance Monkey", "Tones and I", "Elettronica", "Festa"),
            ("luca@example.com", "Luca", "Sweet Child O' Mine", "Guns N' Roses", "Rock", "Energico"),
        ]
        base = now_utc()
        for i, (em, nm, st, ar, ge, mo) in enumerate(demo_active):
            await db.queue_entries.insert_one({
                "entry_id": new_id("ent"), "event_id": event_id, "email": em,
                "singer_name": nm, "song_title": st, "song_artist": ar, "genre": ge,
                "mood": mo, "status": "active", "created_at": iso(base + timedelta(minutes=i)),
                "sung_at": None,
            })
        demo_sung = [
            ("anna@example.com", "Anna", "Shallow", "Lady Gaga", "Pop", "Romantico"),
            ("dario@example.com", "Dario", "Thunderstruck", "AC/DC", "Rock", "Epico"),
        ]
        for i, (em, nm, st, ar, ge, mo) in enumerate(demo_sung):
            await db.queue_entries.insert_one({
                "entry_id": new_id("ent"), "event_id": event_id, "email": em,
                "singer_name": nm, "song_title": st, "song_artist": ar, "genre": ge,
                "mood": mo, "status": "sung", "created_at": iso(base - timedelta(minutes=10 - i)),
                "sung_at": iso(base - timedelta(minutes=5 - i)),
            })

    # write test credentials
    try:
        creds = Path("/app/memory/test_credentials.md")
        creds.write_text(
            "# Test Credentials\n\n"
            "## Host (admin)\n"
            f"- Email: {admin_email}\n"
            f"- Password: {admin_password}\n"
            "- Role: host\n\n"
            "## Demo Event\n"
            "- Name: Sabato Neon Karaoke\n"
            "- Join code: NEON01\n"
            "- User join URL: /join/NEON01\n\n"
            "## Auth endpoints\n"
            "- POST /api/auth/register, POST /api/auth/login, POST /api/auth/session (Google), GET /api/auth/me, POST /api/auth/logout\n"
        )
    except Exception as e:
        logger.warning(f"could not write creds: {e}")


@app.on_event("startup")
async def on_startup():
    await seed()


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[os.environ.get("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
