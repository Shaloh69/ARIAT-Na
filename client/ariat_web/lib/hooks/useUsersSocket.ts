import type { ActiveUser } from "@/types/api";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

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

    socket.on("user:active-list", (data: { users: ActiveUser[] }) => {
      setActiveUsers(data.users);
    });

    socket.on("user:joined", (user: ActiveUser) => {
      setActiveUsers((prev) => {
        const filtered = prev.filter((u) => u.userId !== user.userId);

        return [...filtered, user];
      });
    });

    socket.on("user:left", (data: { userId: string }) => {
      setActiveUsers((prev) => prev.filter((u) => u.userId !== data.userId));
    });

    socket.on(
      "user:location",
      (data: {
        userId: string;
        lat: number;
        lon: number;
        heading: number | null;
        sessionId: string;
      }) => {
        setActiveUsers((prev) =>
          prev.map((u) =>
            u.userId === data.userId
              ? {
                  ...u,
                  lat: data.lat,
                  lon: data.lon,
                  heading: data.heading,
                  sessionId: data.sessionId,
                }
              : u,
          ),
        );
      },
    );

    socket.on(
      "user:itinerary",
      (data: {
        userId: string;
        itinerary_title: string | null;
        itinerary_stop_count: number | null;
      }) => {
        setActiveUsers((prev) =>
          prev.map((u) =>
            u.userId === data.userId
              ? {
                  ...u,
                  itinerary_title: data.itinerary_title,
                  itinerary_stop_count: data.itinerary_stop_count,
                }
              : u,
          ),
        );
      },
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const removeUser = useCallback((userId: string) => {
    setActiveUsers((prev) => prev.filter((u) => u.userId !== userId));
  }, []);

  return { isConnected, activeUsers, socketError, removeUser };
}
