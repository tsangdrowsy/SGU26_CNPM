// src/app/map.tsx

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native";
import * as Location from "expo-location";
import { router } from "expo-router";
import { MAP_CENTER, MOCK_POIS, POI } from "../data/mockPois";
import { colors } from "../theme/colors";
import { getDistanceMeters } from "../features/map/geo";
import MapCanvas from "../features/map/MapCanvas";
import { UserLocation } from "../features/map/types";

export default function MapScreen() {
  const locationSubscription = useRef<any>(null);
  const simModeRef = useRef(false);

  const [mapReady, setMapReady] = useState(false);
  const [simMode, setSimMode] = useState(false);
  const [locationStatus, setLocationStatus] = useState<
    "requesting" | "active" | "denied"
  >("requesting");

  const [userCoords, setUserCoords] = useState<UserLocation | null>(null);
  const [nearbyPoi, setNearbyPoi] = useState<POI | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);

  simModeRef.current = simMode;

  // ===== Real GPS (works on native AND web browser geolocation) =====
  useEffect(() => {
    let isMounted = true;

    const startLocation = async () => {
      try {
        setLocationStatus("requesting");

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) return;

        if (status !== "granted") {
          setLocationStatus("denied");
          return;
        }

        setLocationStatus("active");

        locationSubscription.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 5 },
          (position) => {
            if (simModeRef.current) return; // simulator overrides GPS

            setUserCoords({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy ?? 15,
            });
          }
        );
      } catch (error) {
        console.log("Location error:", error);
        setLocationStatus("denied");
      }
    };

    startLocation();

    return () => {
      isMounted = false;
      locationSubscription.current?.remove();
    };
  }, []);

  // ===== Geofencing (PRD Flow 2, step 1-2) =====
  useEffect(() => {
    if (!userCoords) return;

    const found = MOCK_POIS.find(
      (poi) =>
        getDistanceMeters(
          userCoords.latitude,
          userCoords.longitude,
          poi.latitude,
          poi.longitude
        ) <=
        poi.radiusMeters + 5
    );

    setNearbyPoi(found ?? null);
  }, [userCoords]);

  const simulate = useCallback((latitude: number, longitude: number) => {
    setSimMode(true);
    setUserCoords({ latitude, longitude, accuracy: 5 });
  }, []);

  const displayPoi = selectedPoi ?? nearbyPoi;

  const distance =
    userCoords && displayPoi
      ? Math.round(
          getDistanceMeters(
            userCoords.latitude,
            userCoords.longitude,
            displayPoi.latitude,
            displayPoi.longitude
          )
        )
      : null;

  const handleListen = () => {
    Alert.alert(
      "Audio Guide",
      "Next step (PRD Flow 2): 'Đang chuẩn bị thuyết minh...' -> POST /api/ai/translate -> expo-speech.speak()"
    );
  };

  const handleDetails = () => {
    Alert.alert("POI Detail", "Next step: POI detail screen.");
  };

  const handleChat = () => {
    Alert.alert("AI Chatbot", "Next step (PRD Flow 3): RAG chat with POI context.");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* ===== OpenStreetMap canvas (native: WebView / web: Leaflet DOM) ===== */}
        <MapCanvas
          pois={MOCK_POIS}
          center={MAP_CENTER}
          userLocation={userCoords}
          onReady={() => setMapReady(true)}
          onPoiSelected={(poi) => setSelectedPoi(poi)}
          onMapTap={() => setSelectedPoi(null)}
        />

        {!mapReady && (
          <View style={styles.overlay}>
            <ActivityIndicator color={colors.accent} size="large" />
            <Text style={styles.overlayText}>Loading OpenStreetMap...</Text>
          </View>
        )}

        {/* ===== Top controls ===== */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.headerPill}
            activeOpacity={0.85}
          >
            <Text style={styles.headerPillText}>Back</Text>
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

        {/* ===== GPS simulator (demo on PC / emulator) ===== */}
        <View style={styles.simBar}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.simBarContent}
          >
            {MOCK_POIS.map((poi) => (
              <TouchableOpacity
                key={poi.id}
                style={styles.simChip}
                onPress={() => simulate(poi.latitude, poi.longitude)}
              >
                <Text style={styles.simChipText}>
                 {poi.name.split(" (")[0]}
                </Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.simChip, !simMode && styles.simChipActive]}
              onPress={() => setSimMode(false)}
            >
              <Text style={styles.simChipText}>Real GPS</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {locationStatus === "denied" && !simMode && (
          <View style={styles.deniedBanner}>
            <Text style={styles.deniedText}>
              Location denied. Use the simulator chips above to demo geofencing.
            </Text>
          </View>
        )}

        {/* ===== Bottom POI card ===== */}
        <View style={styles.bottomCardWrap}>
          {displayPoi ? (
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>{displayPoi.name}</Text>

                <View
                  style={[
                    styles.badge,
                    selectedPoi ? styles.badgeOrange : styles.badgeGreen,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      selectedPoi
                        ? styles.badgeTextOrange
                        : styles.badgeTextGreen,
                    ]}
                  >
                    {selectedPoi ? "Selected" : "Nearby"}
                  </Text>
                </View>
              </View>

              <Text style={styles.cardDescription}>
                {displayPoi.shortDescription}
              </Text>

              {distance !== null && (
                <Text style={styles.cardDistance}>Distance: {distance}m</Text>
              )}

              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.actionPrimary]}
                  onPress={handleListen}
                  activeOpacity={0.9}
                >
                  <Text style={styles.actionPrimaryText}>Listen</Text>
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
                Tap a POI marker, or use the simulator chips to trigger the
                20m geofence.
              </Text>
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },

   overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 30,
  },
  overlayText: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
    textAlign: "center",
  },

  header: {
    position: "absolute",
    top: 8,
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
  },
  headerPillText: { fontSize: 14, fontWeight: "700", color: colors.accentDark },
  headerPillTextSmall: { fontSize: 12, fontWeight: "700", color: "#374151" },

  simBar: {
    position: "absolute",
    top: 52,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  simBarContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  simChip: {
    backgroundColor: colors.surface,
    borderColor: colors.orangeBorder,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  simChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.softAccent,
  },
  simChipText: { fontSize: 12, fontWeight: "700", color: colors.accentDark },

  deniedBanner: {
    position: "absolute",
    top: 92,
    left: 16,
    right: 16,
    zIndex: 20,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
  },
  deniedText: { fontSize: 13, fontWeight: "600", color: "#DC2626" },

  bottomCardWrap: {
    position: "absolute",
    bottom: 24,
    left: 16,
    right: 16,
    zIndex: 20,
  },
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