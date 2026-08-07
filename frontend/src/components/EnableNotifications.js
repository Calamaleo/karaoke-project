import React, { useState } from "react";
import { getToken } from "firebase/messaging";
import { messaging } from "@/firebase";

export default function EnableNotifications({ eventId, email }) {

  const [enabled, setEnabled] = useState(false);

  const toggleNotifications = async () => {

    // Se sono già attive le tolgo solo graficamente
    // (il browser gestisce il blocco reale)
    if (enabled) {
      setEnabled(false);
      return;
    }


    try {

      if (!("Notification" in window)) {
        alert("Browser non supportato");
        return;
      }


      const permission = await Notification.requestPermission();


      if (permission !== "granted") {
        alert("Notifiche non autorizzate");
        return;
      }


      const token = await getToken(messaging, {

        vapidKey:
        "BGt-gcLxMzGhR1p6LlAy5zdJTPFVKCyOz1Xx0jW0EdKqSQfKJdkxluwEq9cWS4AnI1jgQItMcBUn7yyeeHI1Lms"

      });


      console.log("FIREBASE TOKEN:", token);


      if(token){

        await fetch(
          `${process.env.REACT_APP_BACKEND_URL}/api/public/save-token`,
          {
            method:"POST",

            headers:{
              "Content-Type":"application/json"
            },

            body:JSON.stringify({
              event_id:eventId,
              email:email,
              token:token
            })
          }
        );


        setEnabled(true);

      }


    } catch(err){

      console.error(
        "Errore notifiche:",
        err
      );

    }

  };


  return (

    <div 
      className="flex items-center gap-3 cursor-pointer"
      onClick={toggleNotifications}
    >

      <div
        className={`
          w-12 h-6 rounded-full transition-all
          ${enabled ? "bg-green-500" : "bg-gray-400"}
        `}
      >

        <div
          className={`
            w-5 h-5 bg-white rounded-full mt-0.5
            transition-all
            ${enabled ? "translate-x-6" : "translate-x-0.5"}
          `}
        />

      </div>


      <span>
        {enabled
          ? "🔔 Notifiche attive"
          : "🔕 Attiva notifiche"
        }
      </span>


    </div>

  );

}