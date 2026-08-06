import { useEffect, useState } from "react";
import { Reorder, useDragControls } from "framer-motion";
import { Badge, GENRE_STYLES, MOOD_STYLES } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { SkipForward, Trash2, AlertTriangle, GripVertical, Megaphone } from "lucide-react";

function timeLabel(iso) {
  try {
    return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function RowInner({ r, index, draggable, dragControls, onNext, onTurn, onDelete }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-3 ${r.is_duplicate ? "bg-destructive/10" : ""}`}>
      {draggable && (
        <button
          data-testid={`drag-handle-${r.entry_id}`}
          onPointerDown={(e) => dragControls.start(e)}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-primary touch-none"
          aria-label="Trascina per riordinare"
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <span className="w-6 text-center text-sm font-bold text-primary">{index + 1}</span>
      <div className="w-14 text-xs text-muted-foreground hidden sm:block">{timeLabel(r.created_at)}</div>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold text-sm truncate ${r.is_duplicate ? "text-destructive" : ""}`}>{r.singer_name}</div>
        <div className={`text-xs flex items-center gap-1 truncate ${r.is_duplicate ? "text-destructive" : "text-muted-foreground"}`}>
          {r.is_duplicate && <AlertTriangle className="w-3 h-3 shrink-0" />}
          {r.email}
        </div>
      </div>
      <div className="flex-1 min-w-0 hidden md:block">
        <div className="font-medium text-sm truncate">{r.song_title}</div>
        <div className="text-xs text-muted-foreground truncate">{r.song_artist}</div>
      </div>
      <div className="hidden lg:flex items-center gap-1.5">
        <Badge label={r.genre} styles={GENRE_STYLES} />
        <Badge label={r.mood} styles={MOOD_STYLES} />
      </div>
      <div className="flex items-center gap-1.5">
        <Button data-testid={`turn-btn-${r.entry_id}`} size="sm" variant="outline"
          onClick={() => onTurn(r.entry_id)} className="font-semibold">
          <Megaphone className="w-4 h-4 mr-1" /> Tocca a te
        </Button>
        <Button data-testid={`next-btn-${r.entry_id}`} size="sm" onClick={() => onNext(r.entry_id)}
          className="font-semibold neon-glow">
          <SkipForward className="w-4 h-4 mr-1" /> Prossimo
        </Button>
        <Button data-testid={`delete-btn-${r.entry_id}`} size="icon" variant="ghost"
          onClick={() => onDelete(r.entry_id)} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function DraggableRow({ r, index, onNext, onTurn, onDelete }) {
  const dragControls = useDragControls();
  return (
    <Reorder.Item value={r} dragListener={false} dragControls={dragControls}
      data-testid={`queue-row-${r.entry_id}`} data-duplicate={r.is_duplicate ? "true" : "false"}
      className="border-t border-border first:border-t-0 bg-card">
      <RowInner r={r} index={index} draggable dragControls={dragControls}
        onNext={onNext} onTurn={onTurn} onDelete={onDelete} />
    </Reorder.Item>
  );
}

export function ActiveQueue({ rows, draggable, onReorder, onNext, onTurn, onDelete }) {
  const [items, setItems] = useState(rows);
  useEffect(() => { setItems(rows); }, [rows]);

  if (!rows || rows.length === 0) {
    return (
      <div data-testid="queue-empty" className="py-16 text-center text-muted-foreground border border-dashed border-border rounded-2xl">
        La coda è vuota. Condividi il QR per iniziare!
      </div>
    );
  }

  if (!draggable) {
    return (
      <div className="rounded-2xl border border-border overflow-hidden">
        {rows.map((r, i) => (
          <div key={r.entry_id} data-testid={`queue-row-${r.entry_id}`} data-duplicate={r.is_duplicate ? "true" : "false"}
            className="border-t border-border first:border-t-0 bg-card">
            <RowInner r={r} index={i} draggable={false} onNext={onNext} onTurn={onTurn} onDelete={onDelete} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <Reorder.Group axis="y" values={items}
      onReorder={(next) => { setItems(next); onReorder(next.map((x) => x.entry_id)); }}
      className="rounded-2xl border border-border overflow-hidden">
      {items.map((r, i) => (
        <DraggableRow key={r.entry_id} r={r} index={i} onNext={onNext} onTurn={onTurn} onDelete={onDelete} />
      ))}
    </Reorder.Group>
  );
}
