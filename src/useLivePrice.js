import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://aurum-backend-v2.onrender.com";

export function useLivePrice() {
  const [price, setPrice] = useState(null);
  const [prevClose, setPrevClose] = useState(null);
  const [source, setSource] = useState("connecting");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [history, setHistory] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    const socket = io(BACKEND_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => setSource((s) => (s === "connecting" ? "live" : s)));
    socket.on("connect_error", () => setSource("disconnected"));
    socket.on("disconnect", () => setSource("disconnected"));

    socket.on("snapshot", (state) => {
      if (state.price != null) setPrice(state.price);
      if (state.prevClose != null) setPrevClose(state.prevClose);
      if (state.source) setSource(state.source);
      if (state.updatedAt) setUpdatedAt(state.updatedAt);
      if (state.history) setHistory(state.history.map((h) => ({ i: h.t, price: h.price })));
    });

    socket.on("price", (update) => {
      setPrice(update.price);
      setPrevClose(update.prevClose);
      setSource(update.source);
      setUpdatedAt(update.updatedAt);
      setHistory((h) => [...h.slice(-499), { i: update.updatedAt, price: update.price }]);
    });

    return () => socket.disconnect();
  }, []);

  return {
    price,
    prevClose,
    source,
    updatedAt,
    history,
    isLive: source !== "connecting" && source !== "disconnected",
    reconnect: () => {
      socketRef.current?.disconnect();
      socketRef.current?.connect();
    },
  };
}
