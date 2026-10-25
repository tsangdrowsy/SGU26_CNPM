// src/features/map/MapCanvas.tsx
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { WebView } from "react-native-webview";
import { POI } from "../../types/poi";
import { UserLocation } from "./types";

type MapCanvasProps = {
  pois: POI[];
  center: { latitude: number; longitude: number };
  userLocation: UserLocation | null;
  onReady: () => void;
  onPoiSelected: (poi: POI) => void;
  onMapTap: () => void;
  panToLocation?: { latitude: number; longitude: number } | null;
};

function buildHtml(
  pois: POI[],
  center: { latitude: number; longitude: number }
): string {
  const poisPayload = pois.map((p) => ({
    id: p.id,
    name: p.name,
    latitude: p.location.latitude,
    longitude: p.location.longitude,
    radiusMeters: p.radiusMeters,
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
    body { -webkit-tap-highlight-color: transparent; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var POIS = ${JSON.stringify(poisPayload)};
    var CENTER = ${JSON.stringify(center)};

    function send(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      }
    }

    var map = L.map("map", { zoomControl: false, touchZoom: true, bounceAtZoomLimits: false }).setView(
      [CENTER.latitude, CENTER.longitude], 17
    );

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    POIS.forEach(function (p) {
      L.circle([p.latitude, p.longitude], {
        radius: p.radiusMeters,
        color: "#F97316",
        weight: 1,
        opacity: 0.6,
        fillColor: "#F97316",
        fillOpacity: 0.12
      }).addTo(map);

      var m = L.circleMarker([p.latitude, p.longitude], {
        radius: 9,
        color: "#FFFFFF",
        weight: 2,
        fillColor: "#F97316",
        fillOpacity: 1
      }).addTo(map);

      m.bindTooltip(p.name, { direction: "top", offset: [0, -8] });
      m.on("click", function () { send({ type: "poiSelected", id: p.id }); });
    });

    map.on("click", function () { send({ type: "mapTap" }); });

    var userMarker = null;
    var gotUser = false;

    window.__setUser = function (lat, lng, acc) {
      if (!userMarker) {
        userMarker = L.circleMarker([lat, lng], {
          radius: 8,
          color: "#FFFFFF",
          weight: 3,
          fillColor: "#2563EB",
          fillOpacity: 1
        }).addTo(map);
      } else {
        userMarker.setLatLng([lat, lng]);
      }
      
      if (!gotUser) {
        gotUser = true;
        map.setView([lat, lng], 17);
      }
    };

    window.__zoom = function (dir) {
      if (dir > 0) { map.zoomIn(); } else { map.zoomOut(); }
    };

    window.__locateMe = function() {
      if (userMarker) {
        map.flyTo(userMarker.getLatLng(), 17, { duration: 0.5 });
      }
    };

    // 👈 Đưa hàm panTo vào trong chuỗi HTML
    window.__panTo = function(lat, lng) {
      map.flyTo([lat, lng], 18, { duration: 1 });
    };
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
  onMapTap,
  panToLocation,
}: MapCanvasProps) {
  const webRef = useRef<WebView>(null);
  const initialCenter = useRef(center);
  const html = useMemo(() => buildHtml(pois, initialCenter.current), [pois]);

  useEffect(() => {
    if (!userLocation) return;
    const js =
      "window.__setUser && window.__setUser(" +
      userLocation.latitude +
      ", " +
      userLocation.longitude +
      ", " +
      (userLocation.accuracy ?? 15) +
      "); true;";
    webRef.current?.injectJavaScript(js);
  }, [userLocation]);

  // 👈 Thêm useEffect để hứng lệnh bay map từ React Native
  useEffect(() => {
    if (panToLocation) {
      const js = `window.__panTo && window.__panTo(${panToLocation.latitude}, ${panToLocation.longitude}); true;`;
      webRef.current?.injectJavaScript(js);
    }
  }, [panToLocation]);

  const zoomBy = (dir: 1 | -1) => {
    webRef.current?.injectJavaScript(
      "window.__zoom && window.__zoom(" + dir + "); true;"
    );
  };

  const locateMe = () => {
    webRef.current?.injectJavaScript(
      "window.__locateMe && window.__locateMe(); true;"
    );
  };

  const handleMessage = (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "poiSelected") {
        const poi = pois.find((p) => p.id === data.id);
        if (poi) onPoiSelected(poi);
      } else if (data.type === "mapTap") {
        onMapTap();
      }
    } catch { }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <WebView
        ref={webRef}
        style={styles.webview}
        source={{ html }}
        originWhitelist={["*"]}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        bounces={false}
        onMessage={handleMessage}
        onLoadEnd={onReady}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
      />

      <View style={styles.zoomWrap}>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(1)} activeOpacity={0.8}>
          <Text style={styles.zoomBtnText}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(-1)} activeOpacity={0.8}>
          <Text style={styles.zoomBtnText}>−</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.zoomBtn, styles.locateBtn]}
          onPress={locateMe}
          activeOpacity={0.8}
        >
          <Text style={styles.locateBtnText}>📍</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1 },
  zoomWrap: {
    position: "absolute",
    right: 12,
    top: "38%",
    gap: 8,
    zIndex: 10,
  },
  zoomBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  zoomBtnText: { fontSize: 22, fontWeight: "700", color: "#374151" },
  locateBtn: {
    marginTop: 16,
  },
  locateBtnText: {
    fontSize: 20,
  },
});