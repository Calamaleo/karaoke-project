import React, { useState } from "react";
import { getToken } from "firebase/messaging";
import { messaging } from "@/firebase";


export default function EnableNotifications({ eventId, email }) {

  const [enabled, setEnabled] = useState(false);


  const enableNotifications = async () => {

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

        vapidKey: "BGt-gcLxMzGhR1p6LlAy5zdJTPFVKCyOz1Xx0jW0EdKqSQfKJdkxluwEq9cWS4AnI1jgQItMcBUn7yyeeHI1Lms"

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

        });


        setEnabled(true);

      }


    } catch(err){

      console.error(
        "Errore notifiche:",
        err
      );

    }

  };


  if(enabled){

    return (
      <div>
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