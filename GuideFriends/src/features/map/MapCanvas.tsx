// src/features/map/MapCanvas.tsx

import { useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { buildMapHtml } from "./mapHtml";
import { MapCanvasProps, UserLocation } from "./types";

export default function MapCanvas({
  pois,
  center,
  userLocation,
  onReady,
  onPoiSelected,
  onMapTap,
}: MapCanvasProps) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);

  const cbRef = useRef({ onReady, onPoiSelected, onMapTap });
  cbRef.current = { onReady, onPoiSelected, onMapTap };

  const html = useMemo(() => buildMapHtml(pois, center), [pois, center]);

  const pushLocation = (loc: UserLocation | null) => {
    if (!readyRef.current || !loc) return;

    webViewRef.current?.injectJavaScript(`
      if (window.updateUserLocation) {
        window.updateUserLocation(${loc.latitude}, ${loc.longitude}, ${loc.accuracy ?? 15});
      }
      true;
    `);
  };

  const latestLocRef = useRef<UserLocation | null>(null);
  latestLocRef.current = userLocation;

  useEffect(() => {
    pushLocation(userLocation);
  }, [userLocation]);

  return (
    <WebView
      ref={webViewRef}
      style={styles.webview}
      originWhitelist={["*"]}
      source={{ html }}
      javaScriptEnabled
      domStorageEnabled
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);

          if (data.type === "MAP_READY") {
            readyRef.current = true;
            pushLocation(latestLocRef.current);
            cbRef.current.onReady?.();
          }

          if (data.type === "POI_SELECTED") {
            cbRef.current.onPoiSelected?.(data.payload);
          }

          if (data.type === "MAP_TAPPED") {
            cbRef.current.onMapTap?.();
          }
        } catch (error) {
          console.log("WebView message error:", error);
        }
      }}
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
});