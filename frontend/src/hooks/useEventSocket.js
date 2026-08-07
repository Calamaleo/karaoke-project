import { useEffect, useRef } from "react";

// Subscribes to realtime messages for an event over WebSocket.
// Calls onMessage(msg) for every parsed message. Falls back to a slow poll
// (emitting a synthetic {type:'queue_updated'}) if the socket cannot connect.
export function useEventSocket(eventId, onMessage) {
  const cbRef = useRef(onMessage);
  cbRef.current = onMessage;

  useEffect(() => {
    if (!eventId) return;
    const base = process.env.REACT_APP_BACKEND_URL || "";
    const wsUrl = base.replace(/^http/, "ws") + `/api/ws/${eventId}`;

    let ws;
    let closedByUs = false;
    let pollTimer = null;

    const emit = (msg) => cbRef.current && cbRef.current(msg);

    const startPollFallback = () => {
      if (pollTimer) return;
      pollTimer = setInterval(() => emit({ type: "queue_updated" }), 8000);
    };

    try {
  console.log("WEBSOCKET CONNECT:", wsUrl);

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WEBSOCKET CONNECTED");
  };

  ws.onmessage = (e) => {
    console.log("WEBSOCKET RAW:", e.data);

    try {
      const msg = JSON.parse(e.data);
      console.log("WEBSOCKET MESSAGE:", msg);
      emit(msg);
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
    if (!closedByUs) startPollFallback();
  };

} catch (e) {
  console.log("WEBSOCKET EXCEPTION:", e);
  startPollFallback();
}
    return () => {
      closedByUs = true;
      if (pollTimer) clearInterval(pollTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
    };
  }, [eventId]);
}
