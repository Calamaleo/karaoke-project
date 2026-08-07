import { useState } from "react";

export default function EnableNotifications() {

const supported =
  typeof window !== "undefined" &&
  "Notification" in window;


const [enabled, setEnabled] = useState(
  typeof Notification !== "undefined" &&
  Notification.permission === "granted"
);

const enableNotifications = async () => {

if (!supported) {
 alert("Il browser non supporta le notifiche");
 return;
}


const permission = await Notification.requestPermission();


if (permission === "granted") {

setEnabled(true);

new Notification("KaraRoom 🎤", {
body:"Notifiche attivate! Ti avviseremo quando è il tuo turno.",
icon:"/icon-192.png"
});

}

};


if (!supported) return null;


if(enabled){
return (
<div className="text-sm text-green-500">
🔔 Notifiche attive
</div>
);
}


return (
<button onClick={enableNotifications}>
🔔 Attiva notifiche
</button>
);

}