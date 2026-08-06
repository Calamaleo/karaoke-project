import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { QRCodeCanvas } from "qrcode.react";
import api, { apiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useEventSocket } from "@/hooks/useEventSocket";
import { ThemeToggle } from "@/components/ThemeToggle";
import { QueueTable } from "@/components/QueueTable";
import { ActiveQueue } from "@/components/ActiveQueue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Mic2, LogOut, Plus, Copy, Lock, Unlock, Clock, Loader2, Music2, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const BANNER_INITIAL = { height: 0, opacity: 0 };
const BANNER_ANIMATE = { height: "auto", opacity: 1 };

export default function HostDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [closeAt, setCloseAt] = useState("");
  const [sortBy, setSortBy] = useState("time");

  const loadEvents = useCallback(async () => {
    const { data } = await api.get("/events/mine");
    setEvents(data);
    if (data.length && !activeId) setActiveId(data[0].event_id);
    setLoading(false);
  }, [activeId]);

  const loadDetail = useCallback(async (id) => {
    if (!id) return;
    try {
      const { data } = await api.get(`/events/${id}`);
      setDetail(data);
      setCloseAt(data.event.close_at ? data.event.close_at.slice(0, 16) : "");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => { loadDetail(activeId); }, [activeId, loadDetail]);
  useEventSocket(activeId, useCallback((msg) => {
    if (msg?.type === "queue_updated") {
      loadDetail(activeId);
      loadEvents();
    }
  }, [activeId, loadDetail, loadEvents]));

  const createEvent = async () => {
    if (!newName.trim()) return;
    try {
      const { data } = await api.post("/events", { name: newName.trim() });
      setNewName("");
      setCreateOpen(false);
      await loadEvents();
      setActiveId(data.event_id);
      toast.success("Evento creato!");
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const toggleBookings = async (open) => {
    const { data } = await api.patch(`/events/${activeId}/queue-control`, { bookings_open: open });
    setDetail((d) => ({ ...d, event: data }));
    toast.success(open ? "Prenotazioni aperte" : "Prenotazioni chiuse");
  };

  const saveCloseAt = async () => {
    const iso = closeAt ? new Date(closeAt).toISOString() : "";
    const { data } = await api.patch(`/events/${activeId}/queue-control`, { close_at: iso });
    setDetail((d) => ({ ...d, event: data }));
    toast.success(closeAt ? "Orario di chiusura impostato" : "Orario rimosso");
  };

  const markNext = async (entryId) => {
    await api.post(`/events/${activeId}/entries/${entryId}/next`);
    loadDetail(activeId);
    toast.success("Spostato in 'Già cantate'");
  };

  const notifyTurn = async (entryId) => {
    try {
      await api.post(`/events/${activeId}/entries/${entryId}/notify-turn`);
      const row = detail?.active?.find((e) => e.entry_id === entryId);
      toast.success(`Avviso inviato${row ? ` a ${row.singer_name}` : ""}: "Tocca a te!"`);
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const reorderQueue = async (orderedIds) => {
    setDetail((d) => {
      if (!d) return d;
      const byId = Object.fromEntries(d.active.map((e) => [e.entry_id, e]));
      return { ...d, active: orderedIds.map((id) => byId[id]).filter(Boolean) };
    });
    try {
      await api.patch(`/events/${activeId}/reorder`, { ordered_ids: orderedIds });
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
      loadDetail(activeId);
    }
  };

  const deleteEntry = async (entryId) => {
    await api.delete(`/events/${activeId}/entries/${entryId}`);
    loadDetail(activeId);
  };

  const deleteEvent = async (eventId) => {
    try {
      await api.delete(`/events/${eventId}`);
      toast.success("Evento eliminato");
      const remaining = events.filter((e) => e.event_id !== eventId);
      setEvents(remaining);
      if (activeId === eventId) {
        const next = remaining[0]?.event_id || null;
        setActiveId(next);
        setDetail(null);
      }
    } catch (e) {
      toast.error(apiError(e.response?.data?.detail));
    }
  };

  const doLogout = async () => { await logout(); navigate("/"); };

  const joinUrl = detail ? `${window.location.origin}/join/${detail.event.join_code}` : "";

  const sortedActive = (() => {
    if (!detail) return [];
    const arr = [...detail.active];
    if (sortBy === "genre") arr.sort((a, b) => a.genre.localeCompare(b.genre));
    else if (sortBy === "mood") arr.sort((a, b) => a.mood.localeCompare(b.mood));
    else arr.sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
    return arr;
  })();

  const ev = detail?.event;
  const closed = ev?.effective_closed;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-background/70 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center neon-glow">
              <Mic2 className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-display font-extrabold text-lg hidden sm:block">KaraoQ</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:block" data-testid="host-name">{user?.name}</span>
            <ThemeToggle />
            <Button data-testid="logout-btn" variant="ghost" size="icon" onClick={doLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Sidebar */}
        <aside className="lg:col-span-3 space-y-6">
          <div className="flex items-center justify-between">
            <p className="overline text-muted-foreground">I tuoi eventi</p>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="open-create-event" size="icon" className="h-8 w-8 neon-glow"><Plus className="w-4 h-4" /></Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle className="font-display">Nuovo evento</DialogTitle></DialogHeader>
                <div className="space-y-2 pt-2">
                  <Label htmlFor="ev-name">Nome evento</Label>
                  <Input data-testid="event-name-input" id="ev-name" value={newName}
                    onChange={(e) => setNewName(e.target.value)} placeholder="Venerdì Karaoke Night" />
                </div>
                <DialogFooter>
                  <Button data-testid="create-event-btn" onClick={createEvent} className="font-semibold">Crea evento</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2">
            {events.map((e) => (
              <div key={e.event_id} data-testid={`event-item-${e.event_id}`}
                className={`group w-full flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors ${
                  activeId === e.event_id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                }`}>
                <button onClick={() => setActiveId(e.event_id)} className="flex-1 text-left min-w-0">
                  <div className="font-semibold text-sm truncate">{e.name}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    {e.effective_closed ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    {e.join_code}
                  </div>
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button data-testid={`delete-event-${e.event_id}`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1"
                      aria-label="Elimina evento">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-display">Eliminare l'evento?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{e.name}" e tutti i brani in coda verranno eliminati definitivamente. Questa azione non può essere annullata.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="cancel-delete-event">Annulla</AlertDialogCancel>
                      <AlertDialogAction data-testid={`confirm-delete-event-${e.event_id}`}
                        onClick={() => deleteEvent(e.event_id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Elimina
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>

          {ev && (
            <div className="p-5 rounded-2xl border border-border bg-card space-y-4">
              <p className="overline text-muted-foreground">QR per gli ospiti</p>
              <div className="bg-white p-3 rounded-xl w-fit mx-auto" data-testid="event-qr">
                <QRCodeCanvas value={joinUrl} size={160} />
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded truncate" data-testid="join-code">{ev.join_code}</code>
                <Button data-testid="copy-link-btn" size="icon" variant="outline" className="h-8 w-8"
                  onClick={() => { navigator.clipboard.writeText(joinUrl); toast.success("Link copiato"); }}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="lg:col-span-9 space-y-6">
          {loading && <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}

          {!loading && !ev && (
            <div className="py-24 text-center border border-dashed border-border rounded-2xl">
              <Music2 className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Crea il tuo primo evento per iniziare.</p>
            </div>
          )}

          {ev && (
            <>
              <div>
                <p className="overline text-primary mb-1">Evento attivo</p>
                <h1 className="font-display font-extrabold text-3xl">{ev.name}</h1>
              </div>

              {/* Queue control */}
              <div className="p-5 rounded-2xl border border-border bg-card grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {closed ? <Lock className="w-4 h-4 text-destructive" /> : <Unlock className="w-4 h-4 text-primary" />}
                      Prenotazioni
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ev.bookings_open ? "Aperte manualmente" : "Chiuse manualmente"}
                    </p>
                  </div>
                  <Switch data-testid="bookings-toggle" checked={ev.bookings_open} onCheckedChange={toggleBookings} />
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor="close-at" className="flex items-center gap-1 text-xs"><Clock className="w-3 h-3" /> Chiusura programmata</Label>
                    <Input data-testid="close-at-input" id="close-at" type="datetime-local" value={closeAt}
                      onChange={(e) => setCloseAt(e.target.value)} className="mt-1.5" />
                  </div>
                  <Button data-testid="save-close-at" variant="outline" onClick={saveCloseAt}>Salva</Button>
                </div>
              </div>

              <AnimatePresence>
                {closed && (
                  <motion.div data-testid="closed-banner" initial={BANNER_INITIAL} animate={BANNER_ANIMATE}
                    exit={BANNER_INITIAL}
                    className="overflow-hidden rounded-xl border border-[hsl(var(--warning))] bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] px-4 py-3 text-sm font-semibold flex items-center gap-2">
                    <Lock className="w-4 h-4" /> Le prenotazioni sono chiuse: gli ospiti non possono aggiungere brani.
                  </motion.div>
                )}
              </AnimatePresence>

              <Tabs defaultValue="active">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <TabsList>
                    <TabsTrigger data-testid="tab-active" value="active">In coda ({detail.active.length})</TabsTrigger>
                    <TabsTrigger data-testid="tab-sung" value="sung">Già cantate ({detail.sung.length})</TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Ordina per</span>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger data-testid="sort-select" className="w-[130px] h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="time">Tempo</SelectItem>
                        <SelectItem value="genre">Genere</SelectItem>
                        <SelectItem value="mood">Mood</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <TabsContent value="active" className="mt-5 space-y-3">
                  {sortBy === "time" && detail.active.length > 1 && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <GripVertical className="w-3.5 h-3.5" /> Trascina i brani per riordinare la coda
                    </p>
                  )}
                  <ActiveQueue rows={sortedActive} draggable={sortBy === "time"}
                    onReorder={reorderQueue} onNext={markNext} onTurn={notifyTurn} onDelete={deleteEntry} />
                </TabsContent>
                <TabsContent value="sung" className="mt-5">
                  <QueueTable rows={detail.sung} archive />
                </TabsContent>
              </Tabs>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
