import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import type { ActiveUser } from "@/types/api";
import { apiClient } from "@/lib/api";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ||
  process.env.NEXT_PUBLIC_API_URL?.replace("/api/v1", "") ||
  "http://localhost:5000";

export function useUsersSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [socketError, setSocketError] = useState<string | null>(null);

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token) return;

    const socket = io(`${WS_URL}/users-watch`, {
      auth: { token },
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setSocketError(null);
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("connect_error", (err) => {
      setSocketError(err.message);
    });

    // Full snapshot on connect
    socket.on("user:active-list", (data: { users: ActiveUser[] }) => {
      setActiveUsers(data.users);
    });

    // New user came online
    socket.on("user:joined", (user: ActiveUser) => {
      setActiveUsers((prev) => {
        const filtered = prev.filter((u) => u.userId !== user.userId);
        return [...filtered, user];
      });
    });

    // User went offline
    socket.on("user:left", (data: { userId: string }) => {
      setActiveUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    });

    // Location update
    socket.on(
      "user:location",
      (data: { userId: string; lat: number; lon: number; heading: number | null; sessionId: string }) => {
        setActiveUsers((prev) =>
          prev.map((u) =>
            u.userId === data.userId
              ? { ...u, lat: data.lat, lon: data.lon, heading: data.heading, sessionId: data.sessionId }
              : u
          )
        );
      }
    );

    // Itinerary update
    socket.on(
      "user:itinerary",
      (data: { userId: string; itinerary_title: string | null; itinerary_stop_count: number | null }) => {
        setActiveUsers((prev) =>
          prev.map((u) =>
            u.userId === data.userId
              ? { ...u, itinerary_title: data.itinerary_title, itinerary_stop_count: data.itinerary_stop_count }
              : u
          )
        );
      }
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  /** Remove a user locally after deletion */
  const removeUser = useCallback((userId: string) => {
    setActiveUsers((prev) => prev.filter((u) => u.userId !== userId));
  }, []);

  return { isConnected, activeUsers, socketError, removeUser };
}
