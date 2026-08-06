import { Link } from "react-router-dom";
import { Mic2, QrCode, ListMusic, Palette, ArrowRight } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

const FEATURES = [
  { icon: QrCode, title: "QR Univoco", text: "Crea un evento e condividi un QR code: il pubblico entra in un tap." },
  { icon: ListMusic, title: "Coda Live", text: "Ordina per tempo, genere e mood. Segna 'Prossimo' e archivia le cantate." },
  { icon: Palette, title: "Neon o Clean", text: "Tema scuro neon o chiaro minimale, con un solo toggle." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/20 blur-3xl pointer-events-none dark:block hidden" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent/20 blur-3xl pointer-events-none dark:block hidden" />

      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center neon-glow">
            <Mic2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-display font-extrabold text-xl tracking-tight">KaraoQ</span>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link to="/host/login">
            <Button data-testid="nav-host-login" variant="ghost" className="font-semibold">Area Host</Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 max-w-7xl mx-auto px-6 md:px-12 pt-10 md:pt-20 pb-24">
        <p className="overline text-primary neon-text mb-5">Karaoke Queue Manager</p>
        <h1 className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl max-w-4xl leading-[1.05]">
          Gestisci la serata karaoke <span className="text-primary neon-text">senza caos</span>.
        </h1>
        <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl">
          Gli ospiti scansionano un QR, scelgono un brano e finiscono in coda. Tu premi
          "Prossimo" e godi lo spettacolo. Niente doppioni, niente foglietti.
        </p>

        <div className="mt-10 flex flex-col sm:flex-row gap-4">
          <Link to="/host/login">
            <Button data-testid="cta-start-host" size="lg" className="w-full sm:w-auto font-semibold neon-glow group">
              Inizia come Host
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>
          <Link to="/join">
            <Button data-testid="cta-join-user" size="lg" variant="outline" className="w-full sm:w-auto font-semibold">
              Entra in un evento
            </Button>
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-6 rounded-2xl border border-border bg-card hover:border-primary transition-colors hover:-translate-y-1 duration-300">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display font-bold text-lg mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
