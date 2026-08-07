const isLocalhost = Boolean(
  window.location.hostname === "localhost" ||
  window.location.hostname === "[::1]" ||
  window.location.hostname.match(
    /^127(?:\.\d+){0,2}\.\d+$/ 
  )
);

export function register() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;

      if (isLocalhost) {
        return;
      }

      navigator.serviceWorker
        .register(swUrl)
        .then(() => {
          console.log("Service Worker registrato");
        })
        .catch((error) => {
          console.log("Errore Service Worker:", error);
        });
    });
  }
}