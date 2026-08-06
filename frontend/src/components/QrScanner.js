import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Loader2, CameraOff } from "lucide-react";

// In-app QR scanner. Calls onScan(code) with the join code parsed from the QR value.
export function QrScanner({ onScan }) {
  const regionId = "qr-reader-region";
  const scannerRef = useRef(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let mounted = true;
    const html5 = new Html5Qrcode(regionId, { verbose: false });
    scannerRef.current = html5;

    const parseCode = (text) => {
      const t = (text || "").trim();
      const m = t.match(/\/join\/([A-Za-z0-9]+)/);
      if (m) return m[1].toUpperCase();
      // fallback: raw code (letters/digits only)
      if (/^[A-Za-z0-9]{4,12}$/.test(t)) return t.toUpperCase();
      return null;
    };

    html5
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          const code = parseCode(decodedText);
          if (code) {
            html5.stop().catch(() => {});
            onScan(code);
          }
        },
        () => {}
      )
      .then(() => mounted && setStarting(false))
      .catch(() => {
        if (mounted) {
          setError("Impossibile accedere alla fotocamera. Consenti l'accesso o inserisci il codice a mano.");
          setStarting(false);
        }
      });

    return () => {
      const s = scannerRef.current;
      if (s && s.isScanning) s.stop().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="space-y-3">
      <div className="relative rounded-2xl overflow-hidden border border-primary/40 neon-glow aspect-square bg-black">
        <div id={regionId} data-testid="qr-scanner-region" className="w-full h-full [&>video]:object-cover" />
        {starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}
      </div>
      {error && (
        <p data-testid="qr-scanner-error" className="text-sm text-destructive font-medium flex items-center gap-2">
          <CameraOff className="w-4 h-4" /> {error}
        </p>
      )}
    </div>
  );
}
