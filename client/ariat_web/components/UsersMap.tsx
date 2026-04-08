/**
 * UsersMap — Leaflet map showing live active users.
 * Must be loaded via dynamic() with ssr:false.
 */
import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ActiveUser } from "@/types/api";

interface Props {
  activeUsers: ActiveUser[];
  selectedUserId: string | null;
  onSelectUser: (userId: string) => void;
}

const CEBU_CENTER: [number, number] = [10.3157, 123.8854];

// Pulse animation injected once
const PULSE_CSS = `
@keyframes userPulse {
  0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.9; }
  70%  { transform: translate(-50%,-50%) scale(2.2); opacity: 0; }
  100% { transform: translate(-50%,-50%) scale(2.2); opacity: 0; }
}
@keyframes userPulseHas {
  0%   { transform: translate(-50%,-50%) scale(1);   opacity: 0.9; }
  70%  { transform: translate(-50%,-50%) scale(2.4); opacity: 0; }
  100% { transform: translate(-50%,-50%) scale(2.4); opacity: 0; }
}
`;

function makeUserPin(user: ActiveUser, isSelected: boolean): L.DivIcon {
  const hasItinerary = !!user.itinerary_title;
  const color = hasItinerary ? "#22c55e" : "#3b82f6";
  const pulseColor = hasItinerary ? "rgba(34,197,94,0.4)" : "rgba(59,130,246,0.4)";
  const size = isSelected ? 42 : 34;
  const ring = isSelected ? `2px solid #fff` : "none";

  const initial = user.full_name.charAt(0).toUpperCase();
  const bgImg = user.profile_image_url
    ? `<img src="${user.profile_image_url}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;" />`
    : `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:${size * 0.4}px;font-weight:700;color:#fff;">${initial}</div>`;

  const anim = hasItinerary ? "userPulseHas" : "userPulse";

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="position:relative;width:${size}px;height:${size}px;">
        <div style="
          position:absolute;top:50%;left:50%;
          width:${size}px;height:${size}px;
          border-radius:50%;
          background:${pulseColor};
          animation:${anim} 2s ease-out infinite;
        "></div>
        <div style="
          position:absolute;top:50%;left:50%;
          transform:translate(-50%,-50%);
          width:${size}px;height:${size}px;
          border-radius:50%;
          overflow:hidden;
          box-shadow:0 0 0 ${isSelected ? 3 : 2}px ${color}, 0 2px 8px rgba(0,0,0,0.4);
          outline:${ring};
        ">${bgImg}</div>
        ${hasItinerary ? `<div style="position:absolute;bottom:-1px;right:-1px;width:12px;height:12px;border-radius:50%;background:#22c55e;border:2px solid #0f172a;"></div>` : ""}
      </div>`,
  });
}

export default function UsersMap({ activeUsers, selectedUserId, onSelectUser }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const selectedUserIdRef = useRef(selectedUserId);
  const onSelectUserRef = useRef(onSelectUser);

  // Keep refs in sync
  useEffect(() => { selectedUserIdRef.current = selectedUserId; }, [selectedUserId]);
  useEffect(() => { onSelectUserRef.current = onSelectUser; }, [onSelectUser]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // Inject CSS once
    if (!document.getElementById("users-map-css")) {
      const style = document.createElement("style");
      style.id = "users-map-css";
      style.textContent = PULSE_CSS;
      document.head.appendChild(style);
    }

    const map = L.map(containerRef.current, {
      center: CEBU_CENTER,
      zoom: 12,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; CartoDB",
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
    };
  }, []);

  // Sync markers when active users or selection changes
  const syncMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    const usersWithLocation = activeUsers.filter(
      (u) => u.lat !== null && u.lon !== null
    );

    // Remove markers for users who left
    const currentIds = new Set(usersWithLocation.map((u) => u.userId));
    markersRef.current.forEach((marker, userId) => {
      if (!currentIds.has(userId)) {
        marker.remove();
        markersRef.current.delete(userId);
      }
    });

    // Add/update markers
    usersWithLocation.forEach((user) => {
      const isSelected = user.userId === selectedUserIdRef.current;
      const latLng: [number, number] = [user.lat!, user.lon!];
      const icon = makeUserPin(user, isSelected);

      const existing = markersRef.current.get(user.userId);
      if (existing) {
        existing.setLatLng(latLng);
        existing.setIcon(icon);
        const popup = existing.getPopup();
        if (popup) popup.setContent(buildPopupContent(user));
      } else {
        const marker = L.marker(latLng, { icon });
        marker.bindPopup(buildPopupContent(user), {
          className: "users-map-popup",
          maxWidth: 220,
        });
        marker.on("click", () => {
          onSelectUserRef.current(user.userId);
        });
        marker.addTo(map);
        markersRef.current.set(user.userId, marker);
      }
    });
  }, [activeUsers]);

  useEffect(() => {
    syncMarkers();
  }, [syncMarkers]);

  // Fly to selected user
  useEffect(() => {
    if (!mapRef.current || !selectedUserId) return;
    const user = activeUsers.find((u) => u.userId === selectedUserId);
    if (user && user.lat !== null && user.lon !== null) {
      mapRef.current.flyTo([user.lat, user.lon], 15, { duration: 1.2 });
      const marker = markersRef.current.get(selectedUserId);
      marker?.openPopup();
    }
  }, [selectedUserId, activeUsers]);

  return (
    <>
      <style>{`
        .users-map-popup .leaflet-popup-content-wrapper {
          background: rgba(15,23,42,0.95);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          color: #e2e8f0;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .users-map-popup .leaflet-popup-tip { background: rgba(15,23,42,0.95); }
        .users-map-popup .leaflet-popup-content { margin: 10px 14px; }
        .users-map-popup .leaflet-popup-close-button { color: rgba(255,255,255,0.5) !important; }
      `}</style>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </>
  );
}

function buildPopupContent(user: ActiveUser): string {
  const statusLine = user.itinerary_title
    ? `<span style="color:#22c55e;font-size:11px;">📍 ${user.itinerary_title} (${user.itinerary_stop_count ?? "?"} stops)</span>`
    : `<span style="color:#60a5fa;font-size:11px;">● Browsing app</span>`;
  return `
    <div style="min-width:160px;">
      <p style="font-weight:600;font-size:13px;margin:0 0 2px;">${user.full_name}</p>
      <p style="font-size:11px;opacity:0.6;margin:0 0 6px;">${user.email}</p>
      ${statusLine}
    </div>`;
}
