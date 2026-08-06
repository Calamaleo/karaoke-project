// Genre and mood badge color maps for both themes.
export const GENRE_STYLES = {
  Pop: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  Rock: "bg-red-500/15 text-red-500 border-red-500/30",
  "Hip-Hop": "bg-orange-500/15 text-orange-500 border-orange-500/30",
  "R&B": "bg-purple-500/15 text-purple-500 border-purple-500/30",
  Latino: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
  Elettronica: "bg-cyan-500/15 text-cyan-500 border-cyan-500/30",
  Classica: "bg-amber-700/15 text-amber-700 border-amber-700/30",
  Country: "bg-lime-500/15 text-lime-600 border-lime-500/30",
  Metal: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  Indie: "bg-teal-500/15 text-teal-500 border-teal-500/30",
  Jazz: "bg-indigo-500/15 text-indigo-500 border-indigo-500/30",
  Altro: "bg-gray-500/15 text-gray-500 border-gray-500/30",
};

export const MOOD_STYLES = {
  Energico: "bg-pink-500/15 text-pink-500 border-pink-500/30",
  Romantico: "bg-rose-500/15 text-rose-500 border-rose-500/30",
  Triste: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  Festa: "bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/30",
  Chill: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  Epico: "bg-violet-500/15 text-violet-500 border-violet-500/30",
};

export function Badge({ label, styles }) {
  const cls = styles[label] || "bg-gray-500/15 text-gray-500 border-gray-500/30";
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}
