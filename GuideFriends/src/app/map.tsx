// src/app/map.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Dimensions,
  Linking,
  PanResponder,
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
import { translateText,translateBatch } from "../services/translationService"; 
import { speak, stopSpeaking } from "../services/ttsService";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const COLLAPSED_HEIGHT = 250;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.65;
const DRAG_THRESHOLD = 50;

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

  // 👈 DỜI KHAI BÁO displayPoi LÊN ĐÂY ĐỂ TRÁNH LỖI
  const displayPoi = selectedPoi ?? nearbyPoi;

  // --- STATE CHO DỊCH THUẬT ---
  const [translatedDesc, setTranslatedDesc] = useState({ short: "", full: "" });
  const [isTranslating, setIsTranslating] = useState(false);

  // --- ANIMATION CHO BOTTOM SHEET ---
  const animatedHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const currentHeightRef = useRef(COLLAPSED_HEIGHT);

  useEffect(() => {
    const id = animatedHeight.addListener(({ value }) => {
      currentHeightRef.current = value;
    });
    return () => animatedHeight.removeListener(id);
  }, [animatedHeight]);

  const snapTo = (targetHeight: number) => {
    Animated.spring(animatedHeight, {
      toValue: targetHeight,
      useNativeDriver: false,
      bounciness: 5,
    }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const newHeight = currentHeightRef.current - gestureState.dy;
        if (newHeight >= COLLAPSED_HEIGHT && newHeight <= EXPANDED_HEIGHT) {
          animatedHeight.setValue(newHeight);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -DRAG_THRESHOLD || currentHeightRef.current > (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2) {
          snapTo(EXPANDED_HEIGHT);
        } else {
          snapTo(COLLAPSED_HEIGHT);
        }
      },
    })
  ).current;

  useEffect(() => {
    if (selectedPoi) {
      snapTo(EXPANDED_HEIGHT);
    } else {
      snapTo(COLLAPSED_HEIGHT);
    }
  }, [selectedPoi]);

  // --- TỰ ĐỘNG DỊCH KHI ĐỔI POI HOẶC NGÔN NGỮ ---
  useEffect(() => {
    if (!displayPoi) {
      setTranslatedDesc({ short: "", full: "" });
      return;
    }

    let isMounted = true;
    setIsTranslating(true);

    const fetchTranslations = async () => {
      const shortText = await translateText(displayPoi.shortDescriptionVi, currentLanguage);
      const fullText = await translateText(displayPoi.fullDescriptionVi || "", currentLanguage);

      if (isMounted) {
        setTranslatedDesc({ short: shortText, full: fullText });
        setIsTranslating(false);
      }
    };

    fetchTranslations();
    return () => { isMounted = false; };
  }, [displayPoi, currentLanguage]);

  // --- CÁC LOGIC CŨ ---
  useEffect(() => {
    simModeRef.current = simMode;
  }, [simMode]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setPoisLoading(true);
        const cachedData = await AsyncStorage.getItem("cached_pois");

        if (cachedData) {
          if (!cancelled) setPois(JSON.parse(cachedData));
          setPoisLoading(false);
        } else {
          const data = await fetchPois();
          if (!cancelled) {
            setPois(data);
            await AsyncStorage.setItem("cached_pois", JSON.stringify(data));
          }
          setPoisLoading(false);
        }
      } catch (e: any) {
        // Xử lý lỗi
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("app_language").then((saved) => {
      if (saved) setCurrentLanguage(saved as LanguageCode);
    });
  }, []);

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
      } catch { }

      try {
        const fresh = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
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
        { accuracy: Location.Accuracy.High, distanceInterval: 2, timeInterval: 2000 },
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
    if (!displayPoi) {
      setTranslatedDesc({ short: "", full: "" });
      return;
    }

    let isMounted = true;
    setIsTranslating(true);

    const fetchAllTranslations = async () => {
      // Thu thập tất cả text cần dịch vào 1 mảng
      const textsToTranslate = [
        displayPoi.shortDescriptionVi,
        displayPoi.fullDescriptionVi || ""
      ];

      // Gọi API 1 lần duy nhất
      const translated = await translateBatch(textsToTranslate, currentLanguage);

      if (isMounted) {
        setTranslatedDesc({ short: translated[0], full: translated[1] });
        setIsTranslating(false);
      }
    };

    fetchAllTranslations();
    return () => { isMounted = false; };
  }, [displayPoi, currentLanguage]);
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
        // Tận dụng bản dịch có sẵn trên UI nếu đang chọn đúng POI này
        let text = (displayPoi?.id === poi.id && translatedDesc.short)
          ? translatedDesc.short
          : await translateText(poi.shortDescriptionVi, currentLanguage);

        setTtsState("speaking");
        await speak(text, currentLanguage);
        setTtsState("idle");
      } catch (error) {
        console.log("TTS error:", error);
        setTtsState("idle");
      }
    },
    [currentLanguage, displayPoi, translatedDesc.short]
  );

  useEffect(() => {
    if (!userCoords || pois.length === 0) return;
    const found = pois.find(
      (poi) =>
        getDistanceMeters(
          userCoords.latitude, userCoords.longitude,
          poi.location.latitude, poi.location.longitude
        ) <= poi.radiusMeters + 5
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
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setUserCoords({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? 15,
      });
    } catch (e) {
      console.log("Real GPS fix failed:", e);
    }
  }, []);

  const distance = userCoords && displayPoi
    ? Math.round(
      getDistanceMeters(
        userCoords.latitude, userCoords.longitude,
        displayPoi.location.latitude, displayPoi.location.longitude
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

        {/* Overlays */}
        {!mapReady && (
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.overlayPill}>
              <ActivityIndicator color={colors.accent} size="small" />
              <Text style={styles.overlayText}>Loading OpenStreetMap...</Text>
            </View>
          </View>
        )}

        {locationStatus === "denied" && !simMode && (
          <View style={[styles.deniedBanner, { top: insets.top + 60 }]}>
            <Text style={styles.deniedText}>Location denied. Use simulator chips.</Text>
            <TouchableOpacity onPress={() => Linking.openSettings()} style={styles.deniedAction}>
              <Text style={styles.deniedActionText}>Open Settings</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Header & TTS pill */}
        <View style={[styles.header, { top: insets.top + 8 }]}>
          <TouchableOpacity
            onPress={async () => {
              await AsyncStorage.removeItem("access_token");
              router.replace("/");
            }}
            style={styles.headerPill}
            activeOpacity={0.85}
          >
            <Text style={styles.headerPillText}>Exit</Text>
          </TouchableOpacity>

          <View style={styles.headerPill}>
            <Text style={styles.headerPillTextSmall}>
              {simMode ? "Simulated GPS" : locationStatus === "active" ? "GPS Active" : "Waiting for GPS..."}
            </Text>
          </View>
        </View>

        {ttsState === "preparing" && (
          <View style={[styles.ttsOverlay, { top: insets.top + 64 }]}>
            <ActivityIndicator color="#FFFFFF" size="small" />
            <Text style={styles.ttsOverlayText}>Loading...</Text>
          </View>
        )}
        {ttsState === "speaking" && (
          <View style={[styles.ttsOverlay, { top: insets.top + 64 }]}>
            <Text style={styles.ttsOverlayText}>🔊 Speaking...</Text>
          </View>
        )}

        {/* ===== BOTTOM STACK ===== */}
        <View style={[styles.bottomStack, { bottom: insets.bottom }]}>
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

          <Animated.View style={[styles.card, { height: animatedHeight }]}>
            <View {...panResponder.panHandlers} style={styles.dragHandleArea}>
              <View style={styles.dragHandle} />
            </View>

            <View style={styles.cardHeaderFixed}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {displayPoi ? displayPoi.name : "Linh Ung Pagoda Map"}
                </Text>
                {displayPoi && (
                  <View style={[styles.badge, isVisited ? styles.badgeGreen : styles.badgeOrange]}>
                    <Text style={[styles.badgeText, isVisited ? styles.badgeTextGreen : styles.badgeTextOrange]}>
                      {isVisited ? "Visited" : selectedPoi ? "Selected" : "Nearby"}
                    </Text>
                  </View>
                )}
              </View>

              {displayPoi && (
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionPrimary]}
                    onPress={handleListen}
                    disabled={ttsState === "preparing"}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.actionPrimaryText}>
                      {ttsState === "speaking" ? "Stop" : ttsState === "preparing" ? "Preparing..." : "Listen"}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionButton, styles.actionOutline]}
                    onPress={handleChat}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.actionOutlineText}>Chat</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <ScrollView
              style={styles.cardScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
            >
              {displayPoi ? (
                <>
                  {/* Hiển thị bản dịch ngắn (kèm loading nếu đang dịch) */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={styles.cardDescription}>
                      {translatedDesc.short || displayPoi.shortDescriptionVi}
                    </Text>
                    {isTranslating && <ActivityIndicator size="small" color={colors.accent} />}
                  </View>

                  {distance !== null && (
                    <Text style={styles.cardDistance}>Distance: {distance}m</Text>
                  )}

                  <View style={styles.divider} />
                  <Text style={styles.sectionTitle}>Details</Text>
                  {/* Hiển thị bản dịch dài */}
                  <Text style={styles.fullDescription}>
                    {translatedDesc.full || displayPoi.fullDescriptionVi || "Updating..."}
                  </Text>

                  {/* Shopkeepers */}
                  {displayPoi.shopkeepers && displayPoi.shopkeepers.length > 0 && (
                    <>
                      <View style={styles.divider} />
                      <Text style={styles.sectionTitle}>Shops nearby</Text>
                      {displayPoi.shopkeepers.map((shop) => (
                        <View key={shop.id} style={styles.shopCard}>
                          <Text style={styles.shopName}>{shop.name}</Text>
                          {/* Có thể gọi translateText cho shop.descriptionVi nếu muốn */}
                          <Text style={styles.shopDesc}>{shop.descriptionVi}</Text>
                          {shop.openingHours && (
                            <Text style={styles.shopInfo}>🕒 {shop.openingHours}</Text>
                          )}
                        </View>
                      ))}
                    </>
                  )}
                </>
              ) : (
                <Text style={styles.cardDescription}>
                  Choose a location on the map or pick a location from the quick navigation to start.
                </Text>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },

  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 30 },
  overlayPill: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "rgba(17, 24, 39, 0.85)", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, elevation: 6 },
  overlayText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },

  ttsOverlay: { position: "absolute", alignSelf: "center", flexDirection: "row", alignItems: "center", backgroundColor: "rgba(17, 24, 39, 0.9)", paddingVertical: 12, paddingHorizontal: 20, borderRadius: 999, gap: 10, zIndex: 50 },
  ttsOverlayText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },

  header: { position: "absolute", left: 16, right: 16, zIndex: 20, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerPill: { backgroundColor: colors.surface, borderColor: colors.orangeBorder, borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, elevation: 4 },
  headerPillText: { fontSize: 14, fontWeight: "700", color: colors.accentDark },
  headerPillTextSmall: { fontSize: 12, fontWeight: "700", color: "#374151" },

  deniedBanner: { position: "absolute", left: 16, right: 16, zIndex: 20, backgroundColor: "#FEF2F2", borderColor: "#FECACA", borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  deniedText: { fontSize: 13, fontWeight: "600", color: "#DC2626" },
  deniedAction: { alignSelf: "flex-start", backgroundColor: "#DC2626", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
  deniedActionText: { color: "#FFFFFF", fontWeight: "700", fontSize: 12 },

  bottomStack: { position: "absolute", left: 16, right: 16, zIndex: 20, gap: 10 },
  simBarContent: { gap: 8, paddingBottom: 4 },
  simChip: { backgroundColor: colors.surface, borderColor: colors.orangeBorder, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, elevation: 3 },
  simChipActive: { borderColor: colors.accent, backgroundColor: colors.softAccent },
  simChipText: { fontSize: 12, fontWeight: "700", color: colors.accentDark },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.orangeBorder,
    borderWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: "hidden",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  dragHandleArea: { width: "100%", height: 30, alignItems: "center", justifyContent: "center" },
  dragHandle: { width: 50, height: 5, borderRadius: 3, backgroundColor: "#D1D5DB" },
  cardHeaderFixed: { paddingHorizontal: 16, paddingBottom: 12 },
  cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 },
  cardTitle: { flex: 1, fontSize: 20, fontWeight: "800", color: colors.textPrimary },
  badge: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  badgeOrange: { backgroundColor: colors.softAccent },
  badgeGreen: { backgroundColor: "#F0FDF4" },
  badgeText: { fontSize: 12, fontWeight: "700" },
  badgeTextOrange: { color: colors.accentDark },
  badgeTextGreen: { color: "#16A34A" },

  cardActions: { flexDirection: "row", gap: 12 },
  actionButton: { flex: 1, alignItems: "center", borderRadius: 16, paddingVertical: 12 },
  actionPrimary: { backgroundColor: colors.accent },
  actionPrimaryText: { color: colors.white, fontWeight: "700" },
  actionOutline: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1 },
  actionOutlineText: { color: colors.accentDark, fontWeight: "700" },

  cardScroll: { flex: 1, paddingHorizontal: 16 },
  cardDescription: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  cardDistance: { marginTop: 8, fontSize: 14, fontWeight: "700", color: colors.accentDark },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, marginBottom: 8 },
  fullDescription: { fontSize: 15, lineHeight: 24, color: colors.textSecondary },

  shopCard: { backgroundColor: "#F9FAFB", padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: "#E5E7EB" },
  shopName: { fontSize: 15, fontWeight: "700", color: colors.textPrimary },
  shopDesc: { fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  shopInfo: { fontSize: 13, color: colors.accentDark, marginTop: 6, fontWeight: "600" },
});