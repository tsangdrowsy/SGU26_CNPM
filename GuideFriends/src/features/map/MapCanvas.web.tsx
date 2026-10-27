// src/features/map/MapCanvas.web.tsx
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { POI, Shopkeeper } from "../../types/poi"; // 👈 Thêm Shopkeeper
import { UserLocation } from "./types";

type MapCanvasProps = {
  pois: POI[];
  center: { latitude: number; longitude: number };
  userLocation: UserLocation | null;
  onReady: () => void;
  onPoiSelected: (poi: POI) => void;
  onShopSelected: (shop: Shopkeeper) => void; // 👈 Thêm prop
  onMapTap: () => void;
  panToLocation?: { latitude: number; longitude: number } | null;
};

function buildHtml(
  pois: POI[],
  center: { latitude: number; longitude: number }
): string {
  // 👈 Truyền mảng shopkeepers xuống
  const poisPayload = pois.map((p) => ({
    id: p.id,
    name: p.name,
    latitude: p.location.latitude,
    longitude: p.location.longitude,
    radiusMeters: p.radiusMeters,
    shopkeepers: p.shopkeepers || [],
  }));

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
    #map { touch-action: none; }
    body { -webkit-tap-highlight-color: transparent; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var POIS = ${JSON.stringify(poisPayload)};
    var CENTER = ${JSON.stringify(center)};

    function send(msg) {
      try {
        window.parent.postMessage(JSON.stringify(msg), "*");
      } catch (e) {}
    }

    var map = L.map("map", { zoomControl: false }).setView(
      [CENTER.latitude, CENTER.longitude], 17
    );

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    POIS.forEach(function (p) {
      // Vẽ POI (Màu cam)
      L.circle([p.latitude, p.longitude], {
        radius: p.radiusMeters, color: "#F97316", weight: 1, opacity: 0.6, fillColor: "#F97316", fillOpacity: 0.12
      }).addTo(map);

      var m = L.circleMarker([p.latitude, p.longitude], {
        radius: 9, color: "#FFFFFF", weight: 2, fillColor: "#F97316", fillOpacity: 1
      }).addTo(map);

      m.bindTooltip(p.name, { direction: "top", offset: [0, -8] });
      m.on("click", function () { send({ type: "poiSelected", id: p.id }); });

      // 👈 Vẽ Shopkeepers (Màu xanh lá)
      if (p.shopkeepers && p.shopkeepers.length > 0) {
        p.shopkeepers.forEach(function (s) {
          if (s.latitude && s.longitude) {
            var sMarker = L.circleMarker([s.latitude, s.longitude], {
              radius: 6, color: "#FFFFFF", weight: 1.5, fillColor: "#10B981", fillOpacity: 1
            }).addTo(map);
            
            sMarker.bindTooltip(s.name, { direction: "top", offset: [0, -6] });
            sMarker.on("click", function (e) { 
              // Ngăn chặn sự kiện click lan ra map (tránh đóng popup)
              L.DomEvent.stopPropagation(e);
              send({ type: "shopSelected", shop: s }); 
            });
          }
        });
      }
    });

    map.on("click", function () { send({ type: "mapTap" }); });

    var userMarker = null;
    var gotUser = false;

    window.__setUser = function (lat, lng, acc) {
      if (!userMarker) {
        userMarker = L.circleMarker([lat, lng], {
          radius: 8, color: "#FFFFFF", weight: 3, fillColor: "#2563EB", fillOpacity: 1
        }).addTo(map);
      } else {
        userMarker.setLatLng([lat, lng]);
      }
      if (!gotUser) { gotUser = true; map.setView([lat, lng], 17); }
    };

    window.__zoom = function (dir) {
      if (dir > 0) { map.zoomIn(); } else { map.zoomOut(); }
    };

    window.__panTo = function (lat, lng) {
      map.flyTo([lat, lng], 18, { duration: 1 });
    };

    // Receive commands from the React parent
    window.addEventListener("message", function (event) {
      try {
        var data = JSON.parse(event.data);
        if (data.type === "setUser") {
          window.__setUser(data.lat, data.lng, data.acc);
        } else if (data.type === "zoom") {
          window.__zoom(data.dir);
        } else if (data.type === "panTo") {
          window.__panTo(data.lat, data.lng);
        }
      } catch (e) {}
    });

    function sendReady() { send({ type: "ready" }); }
    if (document.readyState === "complete") { sendReady(); }
    else { window.addEventListener("load", sendReady); }
    setTimeout(sendReady, 600);
  </script>
</body>
</html>
`;
}

export default function MapCanvas({
  pois,
  center,
  userLocation,
  onReady,
  onPoiSelected,
  onShopSelected, // 👈 Nhận prop
  onMapTap,
  panToLocation,
}: MapCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latestUserRef = useRef<UserLocation | null>(userLocation);
  latestUserRef.current = userLocation;

  const html = useMemo(() => buildHtml(pois, center), [pois, center]);

  // Listen for events coming from the iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "ready") {
          onReady();
          const cur = latestUserRef.current;
          if (cur && iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage(
              JSON.stringify({ type: "setUser", lat: cur.latitude, lng: cur.longitude, acc: cur.accuracy ?? 15 }),
              "*"
            );
          }
        } else if (data.type === "poiSelected") {
          const poi = pois.find((p) => p.id === data.id);
          if (poi) onPoiSelected(poi);
        } else if (data.type === "shopSelected") {
          onShopSelected(data.shop); // 👈 Bắt sự kiện bấm shop
        } else if (data.type === "mapTap") {
          onMapTap();
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [pois, onReady, onPoiSelected, onShopSelected, onMapTap]);

  // Push GPS updates into the iframe
  useEffect(() => {
    if (!userLocation || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      JSON.stringify({
        type: "setUser",
        lat: userLocation.latitude,
        lng: userLocation.longitude,
        acc: userLocation.accuracy ?? 15,
      }),
      "*"
    );
  }, [userLocation]);

  // Lắng nghe panToLocation
  useEffect(() => {
    if (panToLocation && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({
          type: "panTo",
          lat: panToLocation.latitude,
          lng: panToLocation.longitude,
        }),
        "*"
      );
    }
  }, [panToLocation]);

  const zoomBy = (dir: 1 | -1) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ type: "zoom", dir }), "*");
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <iframe
        ref={iframeRef}
        srcDoc={html}
        style={{ border: "none", width: "100%", height: "100%", display: "block" }}
        title="Leaflet Map"
      />
      <View style={styles.zoomWrap}>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(1)} activeOpacity={0.8}>
          <Text style={styles.zoomBtnText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(-1)} activeOpacity={0.8}>
          <Text style={styles.zoomBtnText}>−</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  zoomWrap: { position: "absolute", right: 12, top: "38%", gap: 8, zIndex: 10 },
  zoomBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#E5E7EB", boxShadow: "0 2px 6px rgba(0,0,0,0.15)" },
  zoomBtnText: { fontSize: 22, fontWeight: "700", color: "#374151" },
});