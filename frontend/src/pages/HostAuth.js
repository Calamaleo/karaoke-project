import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { apiError, setToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mic2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function HostAuth() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const path = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login" ? { email, password } : { email, password, name };
      const { data } = await api.post(path, body);
      setToken(data.token);
      setUser(data);
      toast.success(`Bentornato, ${data.name}!`);
      navigate("/host");
    } catch (err) {
      setError(apiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/host";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="flex items-center justify-between px-6 py-6 max-w-6xl mx-auto w-full">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center neon-glow">
            <Mic2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display font-extrabold text-lg">KaraoQ</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <p className="overline text-primary mb-3">Area Host</p>
            <h1 className="font-display font-extrabold text-3xl">
              {mode === "login" ? "Accedi al pannello" : "Crea il tuo account"}
            </h1>
            <p className="text-muted-foreground text-sm mt-2">
              Gestisci eventi, code e brani in un unico posto.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "register" && (
              <div>
                <Label htmlFor="name">Nome / DJ name</Label>
                <Input data-testid="auth-name-input" id="name" value={name} onChange={(e) => setName(e.target.value)}
                  required placeholder="DJ Alex" className="mt-1.5" />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input data-testid="auth-email-input" id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                required placeholder="tu@email.com" className="mt-1.5" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input data-testid="auth-password-input" id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                required placeholder="••••••••" className="mt-1.5" />
            </div>

            {error && <p data-testid="auth-error" className="text-sm text-destructive font-medium">{error}</p>}

            <Button data-testid="auth-submit" type="submit" disabled={loading} className="w-full font-semibold neon-glow">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {mode === "login" ? "Accedi" : "Registrati"}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">oppure</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <Button data-testid="auth-google" onClick={googleLogin} variant="outline" className="w-full font-semibold">
            <img src="https://www.google.com/favicon.ico" alt="" className="w-4 h-4 mr-2" />
            Continua con Google
          </Button>

          <p className="text-sm text-muted-foreground mt-6 text-center">
            {mode === "login" ? "Non hai un account?" : "Hai già un account?"}{" "}
            <button data-testid="auth-toggle-mode" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
              className="text-primary font-semibold hover:underline">
              {mode === "login" ? "Registrati" : "Accedi"}
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
