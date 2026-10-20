// src/app/map.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { MAP_CENTER } from "../data/mockPois";
import { fetchPois } from "../api/pois";
import { LanguageCode, POI } from "../types/poi";
import { colors } from "../theme/colors";
import { getDistanceMeters } from "../features/map/geo";
import MapCanvas from "../features/map/MapCanvas";
import { UserLocation } from "../features/map/types";
import { translatePoi } from "../services/translationService";
import { speak, stopSpeaking } from "../services/ttsService";

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const locationSubscription = useRef<any>(null);
  const simModeRef = useRef(false);
  const visitedRef = useRef<Set<string>>(new Set());
  const [pois, setPois] = useState<POI[]>([]);
  const [poisLoading, setPoisLoading] = useState(true);
  const [poisError, setPoisError] = useState<string | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [simMode, setSimMode] = useState(false);
  const [locationStatus, setLocationStatus] = useState<
    "requesting" | "active" | "denied"
  >("requesting");

  const [userCoords, setUserCoords] = useState<UserLocation | null>(null);
  const [nearbyPoi, setNearbyPoi] = useState<POI | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  const [visitedIds, setVisitedIds] = useState<string[]>([]);

  const [ttsState, setTtsState] = useState<"idle" | "preparing" | "speaking">(
    "idle"
  );
  const [currentLanguage, setCurrentLanguage] = useState<LanguageCode>("en");

  // Keep ref in sync with state
  useEffect(() => {
    simModeRef.current = simMode;
  }, [simMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPoisLoading(true);
        setPoisError(null);
        const data = await fetchPois();
        if (!cancelled) setPois(data);
      } catch (e: any) {
        if (!cancelled) setPoisError(e?.message ?? "Failed to load POIs");
      } finally {
        if (!cancelled) setPoisLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load saved language
  useEffect(() => {
    AsyncStorage.getItem("app_language").then((saved) => {
      if (saved) setCurrentLanguage(saved as LanguageCode);
    });
  }, []);

  // Fallback "map ready" timer
  useEffect(() => {
    const t = setTimeout(() => setMapReady(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const startLocation = useCallback(async () => {
    try {
      setLocationStatus("requesting");

      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== "granted") {
        setLocationStatus("denied");
        return;
      }

      setLocationStatus("active");

      try {
        const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
        if (last && !simModeRef.current) {
          setUserCoords({
            latitude: last.coords.latitude,
            longitude: last.coords.longitude,
            accuracy: last.coords.accuracy ?? 15,
          });
        }
      } catch {}

      try {
        const fresh = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (!simModeRef.current) {
          setUserCoords({
            latitude: fresh.coords.latitude,
            longitude: fresh.coords.longitude,
            accuracy: fresh.coords.accuracy ?? 15,
          });
        }
      } catch (e) {
        console.log("getCurrentPositionAsync failed:", e);
      }

      locationSubscription.current?.remove?.();
      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 2,
          timeInterval: 2000,
        },
        (position) => {
          if (simModeRef.current) return;
          setUserCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy ?? 15,
          });
        }
      );
    } catch (e) {
      console.log("Location error:", e);
      setLocationStatus("denied");
    }
  }, []);

  useEffect(() => {
    startLocation();
    return () => {
      locationSubscription.current?.remove?.();
      locationSubscription.current = null;
    };
  }, [startLocation]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !simModeRef.current && locationStatus === "active") {
        startLocation();
      }
    });
    return () => sub.remove();
  }, [startLocation, locationStatus]);

  const markVisited = useCallback((id: string) => {
    if (visitedRef.current.has(id)) return;
    visitedRef.current.add(id);
    setVisitedIds(Array.from(visitedRef.current));
  }, []);

  const triggerTTS = useCallback(
    async (poi: POI) => {
      await stopSpeaking();
      setTtsState("preparing");

      try {
        const text = await translatePoi(poi.id, poi.shortDescriptionVi, currentLanguage);
        setTtsState("speaking");
        await speak(text, currentLanguage);
        setTtsState("idle");
      } catch (error) {
        console.log("TTS error:", error);
        setTtsState("idle");
      }
    },
    [currentLanguage]
  );

  useEffect(() => {
    if (!userCoords || pois.length === 0) return;

    const found = pois.find(
      (poi) =>
        getDistanceMeters(
          userCoords.latitude,
          userCoords.longitude,
          poi.location.latitude,
          poi.location.longitude
        ) <=
        poi.radiusMeters + 5
    );

    setNearbyPoi(found ?? null);

    if (found && !visitedRef.current.has(found.id)) {
      markVisited(found.id);
      triggerTTS(found);
    }
  }, [userCoords, pois, triggerTTS, markVisited]);

  const simulate = useCallback((latitude: number, longitude: number) => {
    simModeRef.current = true;
    setSimMode(true);
    setUserCoords({ latitude, longitude, accuracy: 5 });
  }, []);

  const resumeRealGps = useCallback(async () => {
    simModeRef.current = false;
    setSimMode(false);

    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        ({ status } = await Location.requestForegroundPermissionsAsync());
      }
      if (status !== "granted") {
        setLocationStatus("denied");
        return;
      }

      setLocationStatus("active");
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setUserCoords({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 15,
      });
    } catch (e) {
      console.log("Real GPS fix failed:", e);
    }
  }, []);

  const displayPoi = selectedPoi ?? nearbyPoi;

  const distance =
    userCoords && displayPoi
      ? Math.round(
          getDistanceMeters(
            userCoords.latitude,
            userCoords.longitude,
            displayPoi.location.latitude,
            displayPoi.location.longitude
          )
        )
      : null;

  const isVisited = displayPoi ? visitedIds.includes(displayPoi.id) : false;

  const handleListen = () => {
    if (!displayPoi) return;
    if (ttsState === "speaking") {
      stopSpeaking();
      setTtsState("idle");
    } else {
      triggerTTS(displayPoi);
    }
  };

  const handleDetails = () =>
    Alert.alert("POI Detail", "Next step: POI detail screen.");

  const handleChat = () => {
    if (!displayPoi) return;
    router.push({
      pathname: "/chat",
      params: { poiId: displayPoi.id, lang: currentLanguage },
    });
  };

  return (
    <View style={styles.safeArea}>
      <View style={styles.container}>
        <MapCanvas
          pois={pois}
          center={userCoords ?? MAP_CENTER}
          userLocation={userCoords}
          onReady={() => setMapReady(true)}
          onPoiSelected={(poi) => setSelectedPoi(poi)}
          onMapTap={() => setSelectedPoi(null)}
        />

        {!mapReady && (
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.overlayPill}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.overlayText}>Loading OpenStreetMap...</Text>
            </View>
          </View>
        )}

        {poisLoading && (
          <View style={styles.overlay}>
            <View style={styles.overlayPill}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.overlayText}>Loading POIs from database…</Text>
            </View>
          </View>
        )}

        {!poisLoading && poisError && (
          <View style={[styles.deniedBanner, { top: insets.top + 60 }]}>
            <Text style={styles.deniedText}>POI load failed: {poisError}</Text>
            <TouchableOpacity
              onPress={() => {
                setPoisLoading(true);
                fetchPois()
                  .then(setPois)
                  .catch((e) => setPoisError(e.message))
                  .finally(() => setPoisLoading(false));
              }}
              style={styles.deniedAction}
            >
              <Text style={styles.deniedActionText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Top controls: Gộp nút Thoát và Trạng thái GPS */}
        <View style={[styles.header, { top: insets.top + 8 }]}>
          <TouchableOpacity
            onPress={async () => {
              await AsyncStorage.removeItem("access_token");
              router.replace("/"); 
            }}
            style={styles.headerPill}
            activeOpacity={0.85}
          >
            <Text style={styles.headerPillText}>Thoát</Text>
          </TouchableOpacity>

          <View style={styles.headerPill}>
            <Text style={styles.headerPillTextSmall}>
              {simMode
                ? "Simulated GPS"
                : locationStatus === "active"
                  ? "GPS Active"
                  : locationStatus === "denied"
                    ? "GPS Denied"
                    : "Waiting for GPS..."}
            </Text>
          </View>
        </View>

        {/* TTS pill */}
        {ttsState === "preparing" && (
          <View style={[styles.ttsOverlay, { top: insets.top + 64 }]}>
            <ActivityIndicator color="#FFFFFF" size="small" />
            <Text style={styles.ttsOverlayText}>Đang chuẩn bị thuyết minh...</Text>
          </View>
        )}

        {ttsState === "speaking" && (
          <View style={[styles.ttsOverlay, { top: insets.top + 64 }]}>
            <Text style={styles.ttsOverlayText}>🔊 Speaking...</Text>
          </View>
        )}

        {/* Denied banner */}
        {locationStatus === "denied" && !simMode && (
          <View style={[styles.deniedBanner, { top: insets.top + 60 }]}>
            <Text style={styles.deniedText}>
              Location denied. Use the simulator chips below, or enable it in Settings.
            </Text>
            <TouchableOpacity
              onPress={() => Linking.openSettings()}
              activeOpacity={0.85}
              style={styles.deniedAction}
            >
              <Text style={styles.deniedActionText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bottom stack */}
        <View style={[styles.bottomStack, { bottom: insets.bottom + 12 }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.simBarContent}
          >
            {pois.map((poi) => (
              <TouchableOpacity
                key={poi.id}
                style={styles.simChip}
                onPress={() => simulate(poi.location.latitude, poi.location.longitude)}
              >
                <Text style={styles.simChipText}>{poi.name.split(" (")[0]}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.simChip, !simMode && styles.simChipActive]}
              onPress={resumeRealGps}
            >
              <Text style={styles.simChipText}>Real GPS</Text>
            </TouchableOpacity>
          </ScrollView>

          {displayPoi ? (
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>{displayPoi.name}</Text>
                <View
                  style={[
                    styles.badge,
                    isVisited ? styles.badgeGreen : styles.badgeOrange,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      isVisited ? styles.badgeTextGreen : styles.badgeTextOrange,
                    ]}
                  >
                    {isVisited ? "Visited" : selectedPoi ? "Selected" : "Nearby"}
                  </Text>
                </View>
              </View>

              <Text style={styles.cardDescription}>
                {displayPoi.shortDescriptionVi}
              </Text>

              {distance !== null && (
                <Text style={styles.cardDistance}>Distance: {distance}m</Text>
              )}

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionPrimary]}
                  onPress={handleListen}
                  disabled={ttsState === "preparing"}
                  activeOpacity={0.9}
                >
                  <Text style={styles.actionPrimaryText}>
                    {ttsState === "speaking"
                      ? "Stop"
                      : ttsState === "preparing"
                        ? "Preparing..."
                        : "Listen"}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.actionOutline]}
                  onPress={handleDetails}
                  activeOpacity={0.9}
                >
                  <Text style={styles.actionOutlineText}>Details</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionButton, styles.actionOutline]}
                  onPress={handleChat}
                  activeOpacity={0.9}
                >
                  <Text style={styles.actionOutlineText}>Chat</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Linh Ung Pagoda Map</Text>
              <Text style={styles.cardDescription}>
                Tap a POI marker, or use the simulator chips to trigger the 20m geofence.
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },

  overlay: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 30,
  },
  overlayPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(17, 24, 39, 0.85)",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999,
    elevation: 6,
  },
  overlayText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },

  ttsOverlay: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(17, 24, 39, 0.9)",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 999,
    gap: 10,
    zIndex: 50,
  },
  ttsOverlayText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },

  header: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerPill: {
    backgroundColor: colors.surface,
    borderColor: colors.orangeBorder,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 4,
  },
  headerPillText: { fontSize: 14, fontWeight: "700", color: colors.accentDark },
  headerPillTextSmall: { fontSize: 12, fontWeight: "700", color: "#374151" },

  deniedBanner: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 20,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  deniedText: { fontSize: 13, fontWeight: "600", color: "#DC2626" },
  deniedAction: {
    alignSelf: "flex-start",
    backgroundColor: "#DC2626",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  deniedActionText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },

  bottomStack: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 20,
    gap: 10,
  },
  simBarContent: { gap: 8 },
  simChip: {
    backgroundColor: colors.surface,
    borderColor: colors.orangeBorder,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    elevation: 3,
  },
  simChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.softAccent,
  },
  simChipText: { fontSize: 12, fontWeight: "700", color: colors.accentDark },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.orangeBorder,
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: colors.textPrimary },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  badgeOrange: { backgroundColor: colors.softAccent },
  badgeGreen: { backgroundColor: "#F0FDF4" },
  badgeText: { fontSize: 12, fontWeight: "700" },
  badgeTextOrange: { color: colors.accentDark },
  badgeTextGreen: { color: "#16A34A" },
  cardDescription: { marginTop: 8, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  cardDistance: { marginTop: 8, fontSize: 14, fontWeight: "700", color: colors.accentDark },
  cardActions: { marginTop: 16, flexDirection: "row", gap: 12 },
  actionButton: { flex: 1, alignItems: "center", borderRadius: 16, paddingVertical: 12 },
  actionPrimary: { backgroundColor: colors.accent },
  actionPrimaryText: { color: colors.white, fontWeight: "700" },
  actionOutline: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1 },
  actionOutlineText: { color: colors.accentDark, fontWeight: "700" },
});