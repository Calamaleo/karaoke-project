import React, { useState } from "react";

export default function EnableNotifications() {

  const supported = "Notification" in window;

  const [enabled, setEnabled] = useState(
    supported && Notification.permission === "granted"
  );

  const enableNotifications = async () => {

    if (!supported) {
      alert("Questo browser non supporta le notifiche");
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      setEnabled(true);

      new Notification("KaraRoom 🎤", {
        body: "Notifiche attivate! Ti avviseremo quando è il tuo turno.",
        icon: "/icon-192.png",
      });
    }
  };


  // Se il browser non supporta notifiche,
  // non mostriamo niente e non blocchiamo l'app
  if (!supported) {
    return null;
  }


  if (enabled) {
    return (
      <div className="text-sm text-green-500 font-semibold">
        🔔 Notifiche attive
      </div>
    );
  }


  return (
    <button
      onClick={enableNotifications}
      className="w-full rounded-xl border p-3 font-semibold"
    >
      🔔 Attiva notifiche
    </button>
  );
}