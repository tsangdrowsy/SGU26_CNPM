// src/features/map/MapCanvas.web.tsx

import { useEffect, useRef } from "react";
import { View } from "react-native";
import L from "leaflet";
import { MapCanvasProps } from "./types";

export default function MapCanvas({
  pois,
  center,
  userLocation,
  onReady,
  onPoiSelected,
  onMapTap,
}: MapCanvasProps) {
  const containerRef = useRef<any>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);

  const cbRef = useRef({ onReady, onPoiSelected, onMapTap });
  cbRef.current = { onReady, onPoiSelected, onMapTap };

  // Inject Leaflet CSS at runtime (safe on web)
  useEffect(() => {
    if (typeof document === "undefined") return;

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current).setView(
      [center.latitude, center.longitude],
      17
    );

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    pois.forEach((poi) => {
      L.circle([poi.latitude, poi.longitude], {
        radius: poi.radiusMeters || 20,
        color: "#f97316",
        fillColor: "#f97316",
        fillOpacity: 0.1,
        weight: 1,
      }).addTo(map);

      L.circleMarker([poi.latitude, poi.longitude], {
        radius: 9,
        color: "#f97316",
        fillColor: "#f97316",
        fillOpacity: 0.9,
        weight: 2,
      })
        .on("click", () => cbRef.current.onPoiSelected?.(poi))
        .addTo(map);
    });

    map.on("click", () => cbRef.current.onMapTap?.());

    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 0);

    map.whenReady(() => cbRef.current.onReady?.());

    return () => {
      map.remove();
      mapRef.current = null;
      userMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation) return;

    const latlng: [number, number] = [
      userLocation.latitude,
      userLocation.longitude,
    ];

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.circleMarker(latlng, {
        radius: 7,
        color: "#2563eb",
        fillColor: "#2563eb",
        fillOpacity: 1,
        weight: 2,
      }).addTo(map);
    } else {
      userMarkerRef.current.setLatLng(latlng);
    }
  }, [userLocation]);

  // On react-native-web, View ref = real DOM node
  return <View ref={containerRef} style={{ flex: 1, minHeight: 400 }} />;
}