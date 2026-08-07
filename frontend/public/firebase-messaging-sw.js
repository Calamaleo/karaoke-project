importScripts(
"https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"
);

importScripts(
"https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js"
);


firebase.initializeApp({

apiKey: "AIzaSyA0wn84ZAlAaGXJFMQBc0IL9RE76nEWUCU",
authDomain: "kararoom-9dea3.firebaseapp.com",
projectId: "kararoom-9dea3",
storageBucket: "kararoom-9dea3.firebasestorage.app",
messagingSenderId: "903295245788",
appId: "1:903295245788:web:7bdde35ba5fa7d542b8319"

});


const messaging = firebase.messaging();


messaging.onBackgroundMessage((payload)=>{

 console.log(
 "Messaggio background:",
 payload
 );


 self.registration.showNotification(
   payload.notification.title,
   {
    body: payload.notification.body,
    icon:"/icon-192.png"
   }
 );

});