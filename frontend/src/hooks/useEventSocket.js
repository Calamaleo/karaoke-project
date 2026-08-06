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
      ws = new WebSocket(wsUrl);
      ws.onmessage = (e) => {
        try {
          emit(JSON.parse(e.data));
        } catch {
          emit({ type: "queue_updated" });
        }
      };
      ws.onerror = () => startPollFallback();
      ws.onclose = () => { if (!closedByUs) startPollFallback(); };
    } catch {
      startPollFallback();
    }

    return () => {
      closedByUs = true;
      if (pollTimer) clearInterval(pollTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) ws.close();
    };
  }, [eventId]);
}
