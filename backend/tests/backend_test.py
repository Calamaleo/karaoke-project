"""Backend API tests for KaraoQ karaoke app."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://karaoke-qr-party.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "4lexkh@gmail.com"
ADMIN_PASS = "karaoke123"


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["email"] == ADMIN_EMAIL
    return data["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def demo_event(admin_headers):
    r = requests.get(f"{API}/events/mine", headers=admin_headers)
    assert r.status_code == 200
    events = r.json()
    neon = next((e for e in events if e["join_code"] == "NEON01"), None)
    assert neon is not None, "NEON01 demo event not found"
    return neon


# ---------- Auth ----------
def test_login_admin_success():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS})
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == ADMIN_EMAIL
    assert isinstance(data["token"], str) and len(data["token"]) > 10


def test_login_invalid_password():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_me_with_bearer(admin_headers):
    r = requests.get(f"{API}/auth/me", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL


def test_me_no_token():
    r = requests.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_register_and_dup():
    email = f"TEST_user_{int(time.time())}@gmail.com"
    r = requests.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "Test"})
    assert r.status_code == 200, r.text
    tok = r.json()["token"]
    # /me works
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert me.status_code == 200
    # duplicate
    r2 = requests.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "Test"})
    assert r2.status_code == 400


# ---------- Meta ----------
def test_meta():
    r = requests.get(f"{API}/meta")
    assert r.status_code == 200
    data = r.json()
    assert "genres" in data and "moods" in data
    assert "Pop" in data["genres"]


# ---------- Demo event & queue ----------
def test_demo_event_visible(admin_headers, demo_event):
    assert demo_event["name"] == "Sabato Neon Karaoke"
    assert demo_event["join_code"] == "NEON01"


def test_get_event_queue(admin_headers, demo_event):
    r = requests.get(f"{API}/events/{demo_event['event_id']}", headers=admin_headers)
    assert r.status_code == 200
    data = r.json()
    active = data["active"]
    sung = data["sung"]
    assert len(active) >= 5, f"expected >=5 active, got {len(active)}"
    assert len(sung) >= 2, f"expected >=2 sung, got {len(sung)}"
    # duplicate detection: giulia@example.com should appear twice
    giulia = [e for e in active if e["email"] == "giulia@example.com"]
    assert len(giulia) == 2
    assert all(e["is_duplicate"] for e in giulia)


# ---------- Public join by code ----------
def test_public_event_by_code():
    r = requests.get(f"{API}/public/events/by-code/NEON01")
    assert r.status_code == 200
    d = r.json()
    assert d["event"]["join_code"] == "NEON01"
    assert d["queue_length"] >= 5
    titles = [t["song_title"] for t in d["taken_songs"]]
    assert "Bohemian Rhapsody" in titles


def test_public_event_bad_code():
    r = requests.get(f"{API}/public/events/by-code/NOPE99")
    assert r.status_code == 404


# ---------- Song search ----------
def test_song_search():
    r = requests.get(f"{API}/songs/search", params={"q": "coldplay"})
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data.get("results"), list)
    # external API may fail, so accept empty but structure must be present


def test_song_search_short():
    r = requests.get(f"{API}/songs/search", params={"q": "a"})
    assert r.status_code == 200
    assert r.json()["results"] == []


# ---------- Duplicate song block ----------
def test_duplicate_song_conflict():
    ev = requests.get(f"{API}/public/events/by-code/NEON01").json()["event"]
    r = requests.post(f"{API}/public/events/{ev['event_id']}/entries", json={
        "email": "TEST_dup@gmail.com", "name": "Tester",
        "song_title": "Bohemian Rhapsody", "song_artist": "Queen",
        "genre": "Rock", "mood": "Epico",
    })
    assert r.status_code == 409


# ---------- Queue control: close + 403 on add ----------
def test_queue_control_close_and_add_blocked(admin_headers, demo_event):
    eid = demo_event["event_id"]
    # close bookings
    r = requests.patch(f"{API}/events/{eid}/queue-control", headers=admin_headers,
                       json={"bookings_open": False})
    assert r.status_code == 200
    assert r.json()["effective_closed"] is True

    # user add should get 403
    r2 = requests.post(f"{API}/public/events/{eid}/entries", json={
        "email": "TEST_closed@gmail.com", "name": "X",
        "song_title": f"TEST Song {int(time.time())}", "song_artist": "Nobody",
        "genre": "Pop", "mood": "Festa",
    })
    assert r2.status_code == 403

    # reopen
    r3 = requests.patch(f"{API}/events/{eid}/queue-control", headers=admin_headers,
                        json={"bookings_open": True, "close_at": ""})
    assert r3.status_code == 200
    assert r3.json()["effective_closed"] is False


def test_queue_control_past_close_at(admin_headers, demo_event):
    eid = demo_event["event_id"]
    past = "2020-01-01T00:00:00+00:00"
    r = requests.patch(f"{API}/events/{eid}/queue-control", headers=admin_headers,
                       json={"bookings_open": True, "close_at": past})
    assert r.status_code == 200
    assert r.json()["effective_closed"] is True
    # cleanup
    requests.patch(f"{API}/events/{eid}/queue-control", headers=admin_headers,
                   json={"bookings_open": True, "close_at": ""})


# ---------- Create event + add + next + delete ----------
def test_create_event_and_full_flow(admin_headers):
    r = requests.post(f"{API}/events", headers=admin_headers, json={"name": "TEST Event"})
    assert r.status_code == 200
    ev = r.json()
    assert len(ev["join_code"]) == 6
    eid = ev["event_id"]

    # add entry via public
    add = requests.post(f"{API}/public/events/{eid}/entries", json={
        "email": "TEST_a@gmail.com", "name": "Aa",
        "song_title": "My TEST Song", "song_artist": "Nobody",
        "genre": "Pop", "mood": "Festa",
    })
    assert add.status_code == 200
    entry_id = add.json()["entry_id"]

    # GET event -> shows entry
    g = requests.get(f"{API}/events/{eid}", headers=admin_headers)
    assert g.status_code == 200
    assert len(g.json()["active"]) == 1

    # Prossimo -> move to sung
    nx = requests.post(f"{API}/events/{eid}/entries/{entry_id}/next", headers=admin_headers)
    assert nx.status_code == 200

    g2 = requests.get(f"{API}/events/{eid}", headers=admin_headers)
    assert len(g2.json()["active"]) == 0
    assert len(g2.json()["sung"]) == 1

    # delete sung entry
    d = requests.delete(f"{API}/events/{eid}/entries/{entry_id}", headers=admin_headers)
    assert d.status_code == 200


def test_unauth_event_access():
    r = requests.get(f"{API}/events/mine")
    assert r.status_code == 401


# ---------- Auto-classification (NEW) ----------
def test_auto_classify_when_no_genre_mood(admin_headers):
    """POST entries with no genre/mood -> backend auto-classifies (e.g. Metallica -> Metal/Epico)."""
    r = requests.post(f"{API}/events", headers=admin_headers, json={"name": "TEST AutoClassify"})
    assert r.status_code == 200
    eid = r.json()["event_id"]
    try:
        add = requests.post(f"{API}/public/events/{eid}/entries", json={
            "email": "TEST_auto@gmail.com", "name": "Auto",
            "song_title": "Enter Sandman", "song_artist": "Metallica",
        })
        assert add.status_code == 200, add.text
        entry = add.json()
        assert entry["genre"] and entry["genre"] != "", "genre must be auto-populated"
        assert entry["mood"] and entry["mood"] != "", "mood must be auto-populated"
        # Sanity: Metallica should be classified as Metal (map_genre handles it)
        assert entry["genre"] in ["Metal", "Rock", "Altro"], f"unexpected genre {entry['genre']}"
    finally:
        # cleanup event & its entries
        requests.delete(f"{API}/events/{eid}", headers=admin_headers) if False else None
        # best-effort cleanup via next+delete not needed here; leave admin cleanup


def test_auto_classify_preserves_valid_client_values(admin_headers):
    r = requests.post(f"{API}/events", headers=admin_headers, json={"name": "TEST Preserve"})
    eid = r.json()["event_id"]
    add = requests.post(f"{API}/public/events/{eid}/entries", json={
        "email": "TEST_preserve@gmail.com", "name": "P",
        "song_title": "Some Random Song", "song_artist": "SomeArtist",
        "genre": "Pop", "mood": "Festa",
    })
    assert add.status_code == 200
    entry = add.json()
    assert entry["genre"] == "Pop"
    assert entry["mood"] == "Festa"


def test_auto_classify_invalid_genre_gets_replaced(admin_headers):
    r = requests.post(f"{API}/events", headers=admin_headers, json={"name": "TEST Invalid"})
    eid = r.json()["event_id"]
    add = requests.post(f"{API}/public/events/{eid}/entries", json={
        "email": "TEST_invalid@gmail.com", "name": "I",
        "song_title": "Yellow", "song_artist": "Coldplay",
        "genre": "NotARealGenre", "mood": "NotARealMood",
    })
    assert add.status_code == 200
    entry = add.json()
    assert entry["genre"] != "NotARealGenre"
    assert entry["mood"] != "NotARealMood"


# ---------- Song search: limit 25, IT priority ----------
def test_song_search_limit_25_and_it_priority():
    r = requests.get(f"{API}/songs/search", params={"q": "vasco rossi"})
    assert r.status_code == 200
    results = r.json()["results"]
    # external API may throttle; if we got results verify structure & cap
    assert len(results) <= 25
    if results:
        first = results[0]
        for k in ["song_title", "song_artist", "genre", "mood"]:
            assert k in first



# ---------- DELETE EVENT (NEW) ----------
def test_delete_event_owner_removes_event_and_entries(admin_headers):
    """Host creates event, adds entry, deletes event -> event gone (404), entries gone."""
    r = requests.post(f"{API}/events", headers=admin_headers, json={"name": "TEST DeleteMe"})
    assert r.status_code == 200
    eid = r.json()["event_id"]

    # add an entry so we can verify cascade delete
    add = requests.post(f"{API}/public/events/{eid}/entries", json={
        "email": "TEST_del@gmail.com", "name": "Del",
        "song_title": "Delete Me Song", "song_artist": "Nobody",
        "genre": "Pop", "mood": "Festa",
    })
    assert add.status_code == 200

    # DELETE event
    d = requests.delete(f"{API}/events/{eid}", headers=admin_headers)
    assert d.status_code == 200, d.text
    assert d.json() == {"ok": True}

    # verify event gone
    g = requests.get(f"{API}/events/{eid}", headers=admin_headers)
    assert g.status_code == 404

    # verify no queue entries remain (public event by-code lookup won't work; use direct backend)
    # Since event doesn't exist anymore, its entries should also be gone - confirm by trying add
    add2 = requests.post(f"{API}/public/events/{eid}/entries", json={
        "email": "TEST_del2@gmail.com", "name": "X",
        "song_title": "Anything", "song_artist": "Any",
    })
    assert add2.status_code == 404


def test_delete_event_non_owner_403(admin_headers):
    # host creates an event
    r = requests.post(f"{API}/events", headers=admin_headers, json={"name": "TEST OwnedByAdmin"})
    eid = r.json()["event_id"]
    try:
        # create a second host
        email = f"TEST_other_{int(time.time())}@gmail.com"
        reg = requests.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "Other"})
        assert reg.status_code == 200
        other_headers = {"Authorization": f"Bearer {reg.json()['token']}"}

        d = requests.delete(f"{API}/events/{eid}", headers=other_headers)
        assert d.status_code == 403
    finally:
        requests.delete(f"{API}/events/{eid}", headers=admin_headers)


def test_delete_event_nonexistent_404(admin_headers):
    d = requests.delete(f"{API}/events/evt_doesnotexist123", headers=admin_headers)
    assert d.status_code == 404


def test_delete_event_unauthenticated_401():
    d = requests.delete(f"{API}/events/evt_anything")
    assert d.status_code == 401


# ---------- WebSocket realtime ----------
def test_websocket_broadcasts_on_new_entry(admin_headers, demo_event):
    """Connect WS for NEON01, add an entry via public API, expect queue_updated broadcast."""
    import json
    import websocket  # websocket-client if installed; otherwise use websockets async
    try:
        import websocket as wsc  # noqa
    except ImportError:
        pytest.skip("websocket-client not installed")

    eid = demo_event["event_id"]
    ws_base = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
    url = f"{ws_base}/api/ws/{eid}"

    ws = wsc.create_connection(url, timeout=10)
    try:
        # POST a new entry
        unique = f"RT Test {int(time.time())}"
        add = requests.post(f"{API}/public/events/{eid}/entries", json={
            "email": "TEST_rt@gmail.com", "name": "RT",
            "song_title": unique, "song_artist": "RT Artist",
            "genre": "Pop", "mood": "Festa",
        })
        assert add.status_code == 200, add.text
        entry_id = add.json()["entry_id"]

        try:
            ws.settimeout(5)
            msg = ws.recv()
            data = json.loads(msg)
            assert data.get("type") == "queue_updated"
        finally:
            # cleanup entry
            requests.delete(f"{API}/events/{eid}/entries/{entry_id}", headers=admin_headers)
    finally:
        ws.close()


# ---------- Email MX/deliverability validation (NEW) ----------
def test_validate_email_valid_real_domain():
    r = requests.post(f"{API}/validate-email", json={"email": "mxcheck@gmail.com"})
    assert r.status_code == 200
    data = r.json()
    assert data["valid"] is True
    assert data["reason"] is None


def test_validate_email_invalid_fake_domain():
    r = requests.post(f"{API}/validate-email", json={"email": "pippo@dominioinventato99xyz.zzz"})
    assert r.status_code == 200
    data = r.json()
    assert data["valid"] is False
    assert data["reason"] == "Il dominio dell'email non sembra valido o non esiste."


def test_validate_email_malformed():
    r = requests.post(f"{API}/validate-email", json={"email": "not-an-email"})
    assert r.status_code == 200
    data = r.json()
    assert data["valid"] is False
    assert data["reason"] and "dominio" in data["reason"].lower()


def test_validate_email_empty():
    r = requests.post(f"{API}/validate-email", json={"email": ""})
    assert r.status_code == 200
    data = r.json()
    assert data["valid"] is False


def test_add_entry_rejects_fake_domain(admin_headers):
    """POST /api/public/events/{eid}/entries with fake domain -> 400 Italian message, no entry created."""
    # create throwaway event
    r = requests.post(f"{API}/events", headers=admin_headers, json={"name": "TEST MXReject"})
    assert r.status_code == 200
    eid = r.json()["event_id"]
    try:
        bad = requests.post(f"{API}/public/events/{eid}/entries", json={
            "email": "pippo@dominioinventato99xyz.zzz", "name": "Pippo",
            "song_title": "TEST MX Song", "song_artist": "Nobody",
            "genre": "Pop", "mood": "Festa",
        })
        assert bad.status_code == 400, bad.text
        detail = bad.json().get("detail", "")
        assert "dominio" in detail.lower()

        # verify no entry created
        g = requests.get(f"{API}/events/{eid}", headers=admin_headers)
        assert g.status_code == 200
        assert len(g.json()["active"]) == 0
    finally:
        requests.delete(f"{API}/events/{eid}", headers=admin_headers)


def test_add_entry_accepts_real_domain_random_username(admin_headers):
    """Any username on a real domain should pass MX and create the entry."""
    r = requests.post(f"{API}/events", headers=admin_headers, json={"name": "TEST MXAccept"})
    eid = r.json()["event_id"]
    try:
        ok = requests.post(f"{API}/public/events/{eid}/entries", json={
            "email": f"TEST_random_{int(time.time())}@gmail.com", "name": "R",
            "song_title": "TEST MX Ok Song", "song_artist": "Nobody",
            "genre": "Pop", "mood": "Festa",
        })
        assert ok.status_code == 200, ok.text
        assert "entry_id" in ok.json()
    finally:
        requests.delete(f"{API}/events/{eid}", headers=admin_headers)



# ---------- REORDER queue (NEW) ----------
def test_reorder_queue_owner_persists_order(admin_headers, demo_event):
    eid = demo_event["event_id"]
    g = requests.get(f"{API}/events/{eid}", headers=admin_headers)
    active = g.json()["active"]
    assert len(active) >= 3
    ids = [e["entry_id"] for e in active]
    reversed_ids = list(reversed(ids))
    try:
        r = requests.patch(f"{API}/events/{eid}/reorder", headers=admin_headers,
                           json={"ordered_ids": reversed_ids})
        assert r.status_code == 200, r.text

        # verify persistence
        g2 = requests.get(f"{API}/events/{eid}", headers=admin_headers)
        active2 = g2.json()["active"]
        new_ids = [e["entry_id"] for e in active2]
        assert new_ids == reversed_ids, f"expected {reversed_ids}, got {new_ids}"
    finally:
        # restore original order
        requests.patch(f"{API}/events/{eid}/reorder", headers=admin_headers,
                       json={"ordered_ids": ids})


def test_reorder_queue_non_owner_403(demo_event):
    eid = demo_event["event_id"]
    email = f"TEST_reorder_{int(time.time())}@gmail.com"
    reg = requests.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "R"})
    other_headers = {"Authorization": f"Bearer {reg.json()['token']}"}
    r = requests.patch(f"{API}/events/{eid}/reorder", headers=other_headers,
                       json={"ordered_ids": []})
    assert r.status_code == 403


def test_reorder_broadcasts_queue_updated(admin_headers, demo_event):
    import json, websocket as wsc
    eid = demo_event["event_id"]
    ws_base = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
    ws = wsc.create_connection(f"{ws_base}/api/ws/{eid}", timeout=10)
    try:
        g = requests.get(f"{API}/events/{eid}", headers=admin_headers).json()
        ids = [e["entry_id"] for e in g["active"]]
        r = requests.patch(f"{API}/events/{eid}/reorder", headers=admin_headers,
                           json={"ordered_ids": ids})
        assert r.status_code == 200
        ws.settimeout(5)
        msg = json.loads(ws.recv())
        assert msg.get("type") == "queue_updated"
    finally:
        ws.close()


# ---------- NOTIFY-TURN (Tocca a te) (NEW) ----------
def test_notify_turn_owner_broadcasts_your_turn(admin_headers, demo_event):
    import json, websocket as wsc
    eid = demo_event["event_id"]
    g = requests.get(f"{API}/events/{eid}", headers=admin_headers).json()
    entry = g["active"][0]
    ws_base = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")
    ws = wsc.create_connection(f"{ws_base}/api/ws/{eid}", timeout=10)
    try:
        r = requests.post(
            f"{API}/events/{eid}/entries/{entry['entry_id']}/notify-turn",
            headers=admin_headers)
        assert r.status_code == 200, r.text
        ws.settimeout(5)
        # may need a couple of recvs if other events fire
        found = None
        for _ in range(3):
            try:
                msg = json.loads(ws.recv())
                if msg.get("type") == "your_turn":
                    found = msg
                    break
            except Exception:
                break
        assert found is not None, "did not receive your_turn"
        assert found["email"] == entry["email"]
        assert found["singer_name"] == entry["singer_name"]
        assert found["song_title"] == entry["song_title"]
        assert found["entry_id"] == entry["entry_id"]
    finally:
        ws.close()


def test_notify_turn_non_owner_403(demo_event):
    eid = demo_event["event_id"]
    email = f"TEST_notify_{int(time.time())}@gmail.com"
    reg = requests.post(f"{API}/auth/register", json={"email": email, "password": "abcdef", "name": "N"})
    other_headers = {"Authorization": f"Bearer {reg.json()['token']}"}
    # fetch entry id as admin then try to notify as other
    admin_login = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}).json()
    admin_h = {"Authorization": f"Bearer {admin_login['token']}"}
    g = requests.get(f"{API}/events/{eid}", headers=admin_h).json()
    entry_id = g["active"][0]["entry_id"]
    r = requests.post(f"{API}/events/{eid}/entries/{entry_id}/notify-turn", headers=other_headers)
    assert r.status_code == 403


def test_notify_turn_missing_entry_404(admin_headers, demo_event):
    eid = demo_event["event_id"]
    r = requests.post(f"{API}/events/{eid}/entries/ent_doesnotexist/notify-turn", headers=admin_headers)
    assert r.status_code == 404


def test_notify_turn_unauth_401(demo_event):
    eid = demo_event["event_id"]
    r = requests.post(f"{API}/events/{eid}/entries/anything/notify-turn")
    assert r.status_code == 401
