import type { ChatMessage } from "@/types/api";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

import { apiClient } from "@/lib/api";

export interface OnlineAdmin {
  socketId: string;
  adminId: string;
  full_name: string;
  profile_image_url: string | null;
  role: string;
}

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ||
  "http://localhost:5000";

export function useAdminSocket() {
  const socketRef = useRef<Socket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [onlineAdmins, setOnlineAdmins] = useState<OnlineAdmin[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [socketError, setSocketError] = useState<string | null>(null);

  useEffect(() => {
    const token = apiClient.getAccessToken();

    if (!token) return;

    const socket = io(`${WS_URL}/admin`, {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setSocketError(null);

      // Heartbeat every 30 s
      heartbeatRef.current = setInterval(() => {
        socket.emit("admin:heartbeat");
      }, 30_000);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);

      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    });

    socket.on("connect_error", (err) => {
      setSocketError(err.message);
    });

    socket.on("admin:online-list", (data: { admins: OnlineAdmin[] }) => {
      setOnlineAdmins(data.admins);
    });

    socket.on("admin:joined", (data: OnlineAdmin) => {
      setOnlineAdmins((prev) => {
        const filtered = prev.filter((a) => a.adminId !== data.adminId);

        return [...filtered, data];
      });
    });

    socket.on("admin:left", (data: { adminId: string }) => {
      setOnlineAdmins((prev) => prev.filter((a) => a.adminId !== data.adminId));
    });

    socket.on("admin:chat", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("admin:error", (data: { message: string }) => {
      setSocketError(data.message);
    });

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit("admin:chat", { message: text });
    }
  }, []);

  return {
    isConnected,
    onlineAdmins,
    messages,
    socketError,
    sendMessage,
    setMessages,
  };
}
