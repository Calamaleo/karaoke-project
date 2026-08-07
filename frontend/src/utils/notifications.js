export function sendTurnNotification() {

  if (!("Notification" in window)) {
    return;
  }

  if (Notification.permission !== "granted") {
    return;
  }

  navigator.serviceWorker.ready.then((registration) => {

    registration.showNotification(
      "KaraRoom 🎤",
      {
        body: "È il tuo turno! Preparati a cantare!",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        vibrate: [200, 100, 200],
        tag: "kararoom-turn"
      }
    );

  });

}