import { useEffect, useRef } from "react";

// Realtime WebSocket subscription for an event.
// Calls onMessage(msg) for every parsed message.
// Falls back to polling if WebSocket is unavailable.

export function useEventSocket(eventId, onMessage) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!eventId) return;

    const base = process.env.REACT_APP_BACKEND_URL || "";
    const wsUrl = base.replace(/^http/, "ws") + `/api/ws/${eventId}`;

    let ws = null;
    let closedByUs = false;
    let pollTimer = null;
    let pingTimer = null;
    let reconnectTimer = null;

    const emit = (msg) => {
      if (cbRef.current) {
        cbRef.current(msg);
      }
    };

    const startPollFallback = () => {
      if (pollTimer) return;

      console.log("WEBSOCKET FALLBACK POLLING ATTIVO");

      pollTimer = setInterval(() => {
        emit({ type: "queue_updated" });
      }, 8000);
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const connect = () => {
      if (closedByUs) return;

      console.log("WEBSOCKET CONNECT:", wsUrl);

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log("WEBSOCKET CONNECTED");

          stopPolling();

          // heartbeat per mantenere la connessione viva
          pingTimer = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send("ping");
              console.log("WEBSOCKET PING");
            }
          }, 25000);
        };


        ws.onmessage = (e) => {
          console.log("WEBSOCKET RAW:", e.data);

          try {
            const msg = JSON.parse(e.data);

            // ignora il ping del server
            if (msg.type !== "ping") {
              console.log("WEBSOCKET MESSAGE:", msg);
              emit(msg);
            }

          } catch {
            emit({ type: "queue_updated" });
          }
        };


        ws.onerror = (err) => {
          console.log("WEBSOCKET ERROR:", err);

          startPollFallback();
        };


        ws.onclose = () => {
          console.log("WEBSOCKET CLOSED");

          if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
          }

          if (!closedByUs) {
            startPollFallback();

            console.log("WEBSOCKET RECONNECT TRA 5 SECONDI");

            reconnectTimer = setTimeout(() => {
              connect();
            }, 5000);
          }
        };


      } catch (e) {
        console.log("WEBSOCKET EXCEPTION:", e);
        startPollFallback();
      }
    };


    connect();


    return () => {
      console.log("WEBSOCKET CLEANUP ESEGUITO");

      closedByUs = true;

      if (pollTimer) {
        clearInterval(pollTimer);
      }

      if (pingTimer) {
        clearInterval(pingTimer);
      }

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      if (
        ws &&
        (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        )
      ) {
        ws.close();
      }
    };

  }, [eventId]);
}
