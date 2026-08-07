import React, { useState } from "react";

export default function EnableNotifications() {
  const [enabled, setEnabled] = useState(
    Notification.permission === "granted"
  );

  const enableNotifications = async () => {
    if (!("Notification" in window)) {
      alert("Il browser non supporta le notifiche");
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

  if (enabled) {
    return (
      <p className="text-green-500 text-sm">
        🔔 Notifiche attive
      </p>
    );
  }

  return (
    <button
      onClick={enableNotifications}
      className="bg-purple-600 text-white px-4 py-2 rounded-lg"
    >
      🔔 Attiva notifiche
    </button>
  );
}