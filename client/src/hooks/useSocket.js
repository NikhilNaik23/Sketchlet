import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

/**
 * Opens a single Socket.io connection for the lifetime of the app and
 * exposes it via a ref (so event handlers registered elsewhere always
 * see the live socket) plus a `connected` flag for UI state.
 */
export function useSocket(token) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      setConnected(false);
      return undefined;
    }

    const socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      autoConnect: false,
      auth: { token },
    });

    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.connect();

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [token]);

  return { socketRef, connected };
}
