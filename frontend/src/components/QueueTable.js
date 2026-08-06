import { motion, AnimatePresence } from "framer-motion";
import { Badge, GENRE_STYLES, MOOD_STYLES } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { SkipForward, Trash2, AlertTriangle } from "lucide-react";

const ROW_INITIAL = { opacity: 0, y: 8 };
const ROW_ANIMATE = { opacity: 1, y: 0 };
const ROW_EXIT = { opacity: 0, x: 40 };

function timeLabel(iso) {
  try {
    return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function QueueTable({ rows, onNext, onDelete, archive = false }) {
  if (!rows || rows.length === 0) {
    return (
      <div data-testid="queue-empty" className="py-16 text-center text-muted-foreground border border-dashed border-border rounded-2xl">
        {archive ? "Nessun brano cantato ancora." : "La coda è vuota. Condividi il QR per iniziare!"}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-card/90 backdrop-blur-xl">
          <tr className="text-left text-muted-foreground overline">
            <th className="px-4 py-3 font-semibold">Ora</th>
            <th className="px-4 py-3 font-semibold">Cantante</th>
            <th className="px-4 py-3 font-semibold">Brano</th>
            <th className="px-4 py-3 font-semibold">Genere</th>
            <th className="px-4 py-3 font-semibold">Mood</th>
            <th className="px-4 py-3 font-semibold text-right">Azioni</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {rows.map((r) => (
              <motion.tr
                key={r.entry_id}
                layout
                data-testid={`queue-row-${r.entry_id}`}
                data-duplicate={r.is_duplicate ? "true" : "false"}
                initial={ROW_INITIAL}
                animate={ROW_ANIMATE}
                exit={ROW_EXIT}
                className={`border-t border-border ${r.is_duplicate ? "bg-destructive/10" : "hover:bg-accent/5"}`}
              >
                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                  {timeLabel(archive ? r.sung_at : r.created_at)}
                </td>
                <td className="px-4 py-3">
                  <div className={`font-semibold ${r.is_duplicate ? "text-destructive" : ""}`}>{r.singer_name}</div>
                  <div className={`text-xs flex items-center gap-1 ${r.is_duplicate ? "text-destructive" : "text-muted-foreground"}`}>
                    {r.is_duplicate && <AlertTriangle className="w-3 h-3" />}
                    {r.email}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{r.song_title}</div>
                  <div className="text-xs text-muted-foreground">{r.song_artist}</div>
                </td>
                <td className="px-4 py-3"><Badge label={r.genre} styles={GENRE_STYLES} /></td>
                <td className="px-4 py-3"><Badge label={r.mood} styles={MOOD_STYLES} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {!archive && (
                      <Button data-testid={`next-btn-${r.entry_id}`} size="sm" onClick={() => onNext(r.entry_id)}
                        className="font-semibold neon-glow">
                        <SkipForward className="w-4 h-4 mr-1" /> Prossimo
                      </Button>
                    )}
                    {onDelete && (
                      <Button data-testid={`delete-btn-${r.entry_id}`} size="icon" variant="ghost"
                        onClick={() => onDelete(r.entry_id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
