import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { apiError } from "@/lib/api";
import { useEventSocket } from "@/hooks/useEventSocket";
import { ThemeToggle } from "@/components/ThemeToggle";
import { QrScanner } from "@/components/QrScanner";
import { Badge, GENRE_STYLES, MOOD_STYLES } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Mic2, Loader2, Lock, Search, Check, PartyPopper, ListMusic, ArrowLeft, QrCode, Keyboard, Sparkles, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { sendTurnNotification } from "@/utils/notifications";
import EnableNotifications from "@/components/EnableNotifications";

export default function UserJoin() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [joinCode, setJoinCode] = useState(code || "");
  const [scanMode, setScanMode] = useState(false);
  const [event, setEvent] = useState(null);
  const [taken, setTaken] = useState([]);
  const [queueLen, setQueueLen] = useState(0);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(code ? "loading" : "code");

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [meta, setMeta] = useState({ genres: [], moods: [] });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [song, setSong] = useState({ song_title: "", song_artist: "", genre: "", mood: "", detected: false });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [emailStatus, setEmailStatus] = useState({ checking: false, valid: null, reason: "" });
  const [myTurn, setMyTurn] = useState(null);
  const searchTimer = useRef(null);

  const loadEvent = useCallback(async (c) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/public/events/by-code/${c.toUpperCase()}`);
      setEvent(data.event);
      setTaken(data.taken_songs);
      setQueueLen(data.queue_length);
      setStep("form");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
      setStep("code");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshEvent = useCallback(async () => {
    if (!event) return;
    try {
      const { data } = await api.get(`/public/events/by-code/${event.join_code}`);
      setEvent(data.event);
      setTaken(data.taken_songs);
      setQueueLen(data.queue_length);
    } catch {
      /* ignore transient refresh errors */
    }
  }, [event]);

  useEffect(() => { if (code) loadEvent(code); }, [code, loadEvent]);
  useEffect(() => { api.get("/meta").then(({ data }) => setMeta(data)); }, []);
  useEventSocket(event?.event_id, useCallback((msg) => {
    if (msg?.type === "queue_updated") {
      refreshEvent();
    } else if (msg?.type === "your_turn" && email && msg.email === email.trim().toLowerCase()) {

    setMyTurn(msg);

    toast.success("È il tuo turno! Preparati a cantare 🎤", {
        duration: 8000
    });

    sendTurnNotification();

}
  }, [refreshEvent, email]));

  const runSearch = (q) => {
    setQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await api.get(`/songs/search`, { params: { q } });
        setResults(data.results);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 400);
  };

  const checkEmail = async () => {
    const val = email.trim();
    if (!val) { setEmailStatus({ checking: false, valid: null, reason: "" }); return; }
    setEmailStatus({ checking: true, valid: null, reason: "" });
    try {
      const { data } = await api.post("/validate-email", { email: val });
      setEmailStatus({ checking: false, valid: data.valid, reason: data.reason || "" });
    } catch {
      setEmailStatus({ checking: false, valid: null, reason: "" });
    }
  };

  const isTaken = (title, artist) =>
    taken.some((t) => t.song_title.trim().toLowerCase() === title.trim().toLowerCase() &&
      t.song_artist.trim().toLowerCase() === artist.trim().toLowerCase());

  const pickResult = (r) => {
    setSong({
      song_title: r.song_title,
      song_artist: r.song_artist,
      genre: r.genre || "Altro",
      mood: r.mood || "Festa",
      detected: true,
    });
    setResults([]);
    setQuery("");
  };

  const submit = async () => {
    if (!email || !name || !song.song_title) {
      toast.error("Compila email, nome e brano");
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/public/events/${event.event_id}/entries`, {
        email, name,
        song_title: song.song_title,
        song_artist: song.song_artist,
        genre: song.detected ? song.genre : null,
        mood: song.detected ? song.mood : null,
      });
      setDone(true);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
      loadEvent(event.join_code);
    } finally {
      setSubmitting(false);
    }
  };

  const closed = event?.effective_closed;
  const currentTaken = song.song_title && isTaken(song.song_title, song.song_artist);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-30 bg-background/70 backdrop-blur-xl border-b border-border">
        <div className="max-w-lg mx-auto px-4 h-16 flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center neon-glow">
              <Mic2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-extrabold">{event ? event.name : "KaraRoom"}</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-8">
        <AnimatePresence>
          {myTurn && (
            <motion.div data-testid="your-turn-banner"
              initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
              className="mb-6 rounded-2xl border-2 border-primary bg-primary/10 neon-glow px-4 py-4 flex items-start gap-3">
              <Megaphone className="w-6 h-6 text-primary shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-display font-extrabold text-lg text-primary neon-text">Tocca a te!</p>
                <p className="text-sm text-foreground/90 mt-0.5">
                  L'host ti ha chiamato: la prossima canzone la canti tu
                  {myTurn.song_title ? <> — <span className="font-semibold">{myTurn.song_title}</span></> : null}. Vai al microfono! 🎤
                </p>
              </div>
              <button data-testid="dismiss-turn" onClick={() => setMyTurn(null)}
                className="text-muted-foreground hover:text-foreground text-xs font-semibold">Chiudi</button>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          data-testid="back-to-menu"
          onClick={() => {
            if (step === "form" && !done) { setEvent(null); setStep("code"); setScanMode(false); }
            else navigate("/");
          }}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          {step === "form" && !done ? "Cambia evento" : "Torna al menu"}
        </button>
        {step === "loading" || loading ? (
          <div className="flex justify-center py-24"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : done ? (
          <div data-testid="join-success" className="text-center py-16">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 neon-glow">
              <PartyPopper className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display font-extrabold text-2xl mb-2">Sei in coda!</h1>
            <p className="text-muted-foreground text-sm mb-8">
              <span className="font-semibold text-foreground">{song.song_title}</span> è stato aggiunto. Preparati a cantare 🎤
            </p>
            <Button data-testid="add-another" onClick={() => { setDone(false); setSong({ song_title: "", song_artist: "", genre: "", mood: "", detected: false }); setEmailStatus({ checking: false, valid: null, reason: "" }); loadEvent(event.join_code); }}
              variant="outline" className="font-semibold">Aggiungi un altro brano</Button>
          </div>
        ) : step === "code" ? (
          <div className="py-8">
            <p className="overline text-primary mb-3">Entra nell'evento</p>
            <h1 className="font-display font-extrabold text-3xl mb-6">
              {scanMode ? "Inquadra il QR code" : "Inserisci il codice"}
            </h1>
            {scanMode ? (
              <div className="space-y-4">
                <QrScanner onScan={(c) => { setScanMode(false); setJoinCode(c); loadEvent(c); }} />
                <Button data-testid="switch-to-manual" onClick={() => setScanMode(false)} variant="outline"
                  className="w-full font-semibold">
                  <Keyboard className="w-4 h-4 mr-2" /> Inserisci il codice a mano
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Button data-testid="switch-to-scan" onClick={() => setScanMode(true)}
                  className="w-full font-semibold neon-glow h-12">
                  <QrCode className="w-4 h-4 mr-2" /> Scansiona il QR code
                </Button>
                <div className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">oppure</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <Input data-testid="join-code-input" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ES. NEON01" className="text-center text-2xl font-display tracking-[0.3em] h-14" />
                <Button data-testid="join-code-submit" onClick={() => loadEvent(joinCode)} disabled={!joinCode}
                  className="w-full font-semibold" variant="outline">Entra con il codice</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {closed && (
              <div data-testid="user-closed-banner" className="rounded-xl border border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] px-4 py-3 text-sm font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4" /> Le prenotazioni sono chiuse. Aspetta che l'host le riapra.
              </div>
            )}
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <ListMusic className="w-3.5 h-3.5" /> {queueLen} brani in coda
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="u-name">Il tuo nome</Label>
                <Input data-testid="user-name-input" id="u-name" value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="Mario" className="mt-1.5" disabled={closed} />
              </div>
              <div>
                <Label htmlFor="u-email">Email</Label>
                <div className="relative mt-1.5">
                  <Input data-testid="user-email-input" id="u-email" type="email" value={email}
                    onChange={(e) => { setEmail(e.target.value); setEmailStatus({ checking: false, valid: null, reason: "" }); }}
                    onBlur={checkEmail}
                    placeholder="tu@email.com" disabled={closed}
                    className={emailStatus.valid === false ? "border-destructive focus-visible:ring-destructive" : ""} />
                  {emailStatus.checking && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-muted-foreground" />}
                  {emailStatus.valid === true && <Check className="w-4 h-4 absolute right-3 top-3 text-primary" />}
                </div>
                {emailStatus.valid === false && (
                  <p data-testid="email-invalid-error" className="text-xs text-destructive font-medium mt-1">{emailStatus.reason}</p>
                )}
              </div>
            </div>

            <div>
              <Label className="flex items-center gap-1"><Search className="w-3.5 h-3.5" /> Cerca un brano</Label>
              <div className="relative mt-1.5">
                <Input data-testid="song-search-input" value={query} onChange={(e) => runSearch(e.target.value)}
                  placeholder="Titolo o artista..." disabled={closed} />
                {searching && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-muted-foreground" />}
              </div>
              {results.length > 0 && (
                <div className="mt-2 border border-border rounded-xl divide-y divide-border max-h-64 overflow-y-auto">
                  {results.map((r, i) => {
                    const t = isTaken(r.song_title, r.song_artist);
                    return (
                      <button key={`${r.song_title}-${r.song_artist}-${i}`} data-testid={`search-result-${i}`} disabled={t} onClick={() => pickResult(r)}
                        className={`w-full text-left px-3 py-2.5 flex items-center gap-3 ${t ? "opacity-40 cursor-not-allowed" : "hover:bg-accent/5"}`}>
                        {r.artwork && <img src={r.artwork} alt="" className="w-9 h-9 rounded" />}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{r.song_title}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.song_artist}</div>
                        </div>
                        {t && <span className="text-xs text-destructive font-semibold">Già scelto</span>}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="s-title">Titolo</Label>
                <Input data-testid="song-title-input" id="s-title" value={song.song_title}
                  onChange={(e) => setSong({ ...song, song_title: e.target.value })} placeholder="Titolo brano" className="mt-1.5" disabled={closed} />
              </div>
              <div>
                <Label htmlFor="s-artist">Artista</Label>
                <Input data-testid="song-artist-input" id="s-artist" value={song.song_artist}
                  onChange={(e) => setSong({ ...song, song_artist: e.target.value, detected: false, genre: "", mood: "" })} placeholder="Artista" className="mt-1.5" disabled={closed} />
              </div>
            </div>

            <div data-testid="auto-tags" className="rounded-xl border border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="overline text-muted-foreground">Genere e mood automatici</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Genere e mood vengono scelti automaticamente dall'app in base al brano.
              </p>
            </div>

            {currentTaken && (
              <p data-testid="song-taken-error" className="text-sm text-destructive font-semibold flex items-center gap-1">
                <Lock className="w-4 h-4" /> Questo brano è già stato scelto. Scegline un altro.
              </p>
            )}
	<EnableNotifications />
            <Button data-testid="submit-song" onClick={submit} disabled={closed || submitting || currentTaken || !song.song_title || emailStatus.checking || emailStatus.valid === false}
              className="w-full font-semibold neon-glow h-12">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Mettimi in coda
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
