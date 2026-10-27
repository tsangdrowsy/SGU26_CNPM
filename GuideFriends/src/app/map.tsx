// src/app/map.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Animated, AppState, Dimensions, Linking, PanResponder,
  ScrollView, StyleSheet, Text, TouchableOpacity, View, Image //  Thêm Image
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { MAP_CENTER } from "../data/mockPois";
import { fetchPois, API_BASE } from "../api/pois";
import { LanguageCode, POI, Shopkeeper } from "../types/poi"; // 👈 Thêm Shopkeeper
import { colors } from "../theme/colors";
import { getDistanceMeters } from "../features/map/geo";
import MapCanvas from "../features/map/MapCanvas";
import { UserLocation } from "../features/map/types";
import { translateText, translateBatch } from "../services/translationService";
import { speak, stopSpeaking } from "../services/ttsService";


const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const COLLAPSED_HEIGHT = 250;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.75; // Tăng chiều cao lên một chút để chứa list quán
const DRAG_THRESHOLD = 50;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const locationSubscription = useRef<any>(null);
  const simModeRef = useRef(false);
  const visitedRef = useRef<Set<string>>(new Set());

  const [pois, setPois] = useState<POI[]>([]);
  const [poisLoading, setPoisLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [simMode, setSimMode] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"requesting" | "active" | "denied">("requesting");

  const [userCoords, setUserCoords] = useState<UserLocation | null>(null);
  const [nearbyPoi, setNearbyPoi] = useState<POI | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<POI | null>(null);
  const [visitedIds, setVisitedIds] = useState<string[]>([]);

  const [ttsState, setTtsState] = useState<"idle" | "preparing" | "speaking">("idle");
  const [currentLanguage, setCurrentLanguage] = useState<LanguageCode>("en");

  // --- STATE CHO DỊCH THUẬT & QUÁN ---
  const [translatedDesc, setTranslatedDesc] = useState({ short: "", full: "" });
  const [isTranslating, setIsTranslating] = useState(false);

  const [selectedShop, setSelectedShop] = useState<Shopkeeper | null>(null); // Quán đang được bấm vào
  const [translatedShopDesc, setTranslatedShopDesc] = useState("");
  const [isTranslatingShop, setIsTranslatingShop] = useState(false);
  const [panToLocation, setPanToLocation] = useState<{ latitude: number, longitude: number } | null>(null); // Lệnh bay map

  const displayPoi = selectedPoi ?? nearbyPoi;

  // --- ANIMATION CHO BOTTOM SHEET ---
  const animatedHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;
  const currentHeightRef = useRef(COLLAPSED_HEIGHT);
  const SCREEN_WIDTH = Dimensions.get("window").width;

  // Component Thanh trượt ảnh
  const ImageCarousel = ({ imageUrl }: { imageUrl?: string }) => {
    // Tạo giả lập 3 ảnh để bạn thấy hiệu ứng vuốt
    const images = imageUrl
      ? [imageUrl, imageUrl, imageUrl]
      : ["https://via.placeholder.com/400x200?text=No+Image"];

    return (
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={{ width: "100%", height: 180, marginVertical: 16 }}
      >
        {images.map((img, idx) => (
          <Image
            key={idx}
            source={{ uri: img.startsWith("http") && !img.includes("placeholder") ? `${API_BASE}${img}` : img }}
            style={{ width: SCREEN_WIDTH - 32, height: 180, borderRadius: 16 }}
            resizeMode="cover"
          />
        ))}
      </ScrollView>
    );
  };
  useEffect(() => {
    const id = animatedHeight.addListener(({ value }) => { currentHeightRef.current = value; });
    return () => animatedHeight.removeListener(id);
  }, [animatedHeight]);

  const snapTo = (targetHeight: number) => {
    Animated.spring(animatedHeight, { toValue: targetHeight, useNativeDriver: false, bounciness: 5 }).start();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const newHeight = currentHeightRef.current - gestureState.dy;
        if (newHeight >= COLLAPSED_HEIGHT && newHeight <= EXPANDED_HEIGHT) animatedHeight.setValue(newHeight);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy < -DRAG_THRESHOLD || currentHeightRef.current > (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2) snapTo(EXPANDED_HEIGHT);
        else snapTo(COLLAPSED_HEIGHT);
      },
    })
  ).current;

  useEffect(() => {
    if (selectedPoi || selectedShop) snapTo(EXPANDED_HEIGHT);
    else snapTo(COLLAPSED_HEIGHT);
  }, [selectedPoi, selectedShop]);

  // --- TỰ ĐỘNG DỊCH POI ---
  useEffect(() => {
    if (!displayPoi) { setTranslatedDesc({ short: "", full: "" }); return; }
    let isMounted = true;
    setIsTranslating(true);
    const fetchAll = async () => {
      const t = await translateBatch([displayPoi.shortDescriptionVi, displayPoi.fullDescriptionVi || ""], currentLanguage);
      if (isMounted) { setTranslatedDesc({ short: t[0], full: t[1] }); setIsTranslating(false); }
    };
    fetchAll();
    return () => { isMounted = false; };
  }, [displayPoi, currentLanguage]);

  // --- XỬ LÝ KHI BẤM VÀO QUÁN ---
  const handleShopClick = async (shop: Shopkeeper) => {
    setSelectedShop(shop);
    // Bay map tới vị trí quán
    if (shop.latitude && shop.longitude) {
      setPanToLocation({ latitude: shop.latitude, longitude: shop.longitude });
    }
    // Dịch mô tả quán
    setIsTranslatingShop(true);
    const text = await translateText(shop.descriptionVi || "", currentLanguage);
    setTranslatedShopDesc(text);
    setIsTranslatingShop(false);
  };

  // Nếu bấm ra ngoài map thì huỷ chọn quán
  const handleMapTap = () => {
    setSelectedPoi(null);
    setSelectedShop(null);
  };

  // --- CÁC HÀM LOAD DỮ LIỆU & GPS CŨ GIỮ NGUYÊN ---
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
          if (!cancelled) { setPois(data); await AsyncStorage.setItem("cached_pois", JSON.stringify(data)); }
          setPoisLoading(false);
        }
      } catch (e) { }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("app_language").then((saved) => { if (saved) setCurrentLanguage(saved as LanguageCode); });
  }, []);

  useEffect(() => { const t = setTimeout(() => setMapReady(true), 4000); return () => clearTimeout(t); }, []);

  const startLocation = useCallback(async () => {
    // (Giữ nguyên logic GPS cũ của bạn)
    try {
      setLocationStatus("requesting");
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") ({ status } = await Location.requestForegroundPermissionsAsync());
      if (status !== "granted") { setLocationStatus("denied"); return; }
      setLocationStatus("active");
      locationSubscription.current?.remove?.();
      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 2, timeInterval: 2000 },
        (pos) => { if (!simModeRef.current) setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 15 }); }
      );
    } catch (e) { setLocationStatus("denied"); }
  }, []);

  useEffect(() => {
    startLocation();
    return () => { locationSubscription.current?.remove?.(); locationSubscription.current = null; };
  }, [startLocation]);

  const markVisited = useCallback((id: string) => {
    if (visitedRef.current.has(id)) return;
    visitedRef.current.add(id); setVisitedIds(Array.from(visitedRef.current));
  }, []);

  const triggerTTS = useCallback(async (poi: POI) => {
    await stopSpeaking(); setTtsState("preparing");
    try {
      let text = (displayPoi?.id === poi.id && translatedDesc.short) ? translatedDesc.short : await translateText(poi.shortDescriptionVi, currentLanguage);
      setTtsState("speaking"); await speak(text, currentLanguage); setTtsState("idle");
    } catch (e) { setTtsState("idle"); }
  }, [currentLanguage, displayPoi, translatedDesc.short]);

  useEffect(() => {
    if (!userCoords || pois.length === 0) return;
    const found = pois.find((poi) => getDistanceMeters(userCoords.latitude, userCoords.longitude, poi.location.latitude, poi.location.longitude) <= poi.radiusMeters + 5);
    setNearbyPoi(found ?? null);
    if (found && !visitedRef.current.has(found.id)) { markVisited(found.id); triggerTTS(found); }
  }, [userCoords, pois, triggerTTS, markVisited]);

  const simulate = useCallback((lat: number, lng: number) => { simModeRef.current = true; setSimMode(true); setUserCoords({ latitude: lat, longitude: lng, accuracy: 5 }); }, []);
  const resumeRealGps = useCallback(async () => {
    simModeRef.current = false; setSimMode(false);
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setUserCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy ?? 15 });
  }, []);

  const distance = userCoords && displayPoi ? Math.round(getDistanceMeters(userCoords.latitude, userCoords.longitude, displayPoi.location.latitude, displayPoi.location.longitude)) : null;
  const isVisited = displayPoi ? visitedIds.includes(displayPoi.id) : false;

  const handleListen = () => {
    if (!displayPoi) return;
    if (ttsState === "speaking") { stopSpeaking(); setTtsState("idle"); }
    else triggerTTS(displayPoi);
  };

  const handleChat = () => {
    if (!displayPoi) return;
    router.push({ pathname: "/chat", params: { poiId: displayPoi.id, lang: currentLanguage } });
  };

  return (
    <View style={styles.safeArea}>
      <View style={styles.container}>
        <MapCanvas
          pois={pois}
          center={userCoords ?? MAP_CENTER}
          userLocation={userCoords}
          panToLocation={panToLocation} // 👈 Truyền lệnh bay map
          onReady={() => setMapReady(true)}
          onPoiSelected={(poi) => { setSelectedPoi(poi); setSelectedShop(null); }}
          onShopSelected={(shop) => handleShopClick(shop)}
          onMapTap={handleMapTap}
        />

        {/* Overlays giữ nguyên */}
        {locationStatus === "denied" && !simMode && (
          <View style={[styles.deniedBanner, { top: insets.top + 60 }]}>
            <Text style={styles.deniedText}>Location denied.</Text>
          </View>
        )}

        <View style={[styles.header, { top: insets.top + 8 }]}>
          <TouchableOpacity onPress={async () => { await AsyncStorage.removeItem("access_token"); router.replace("/"); }} style={styles.headerPill}>
            <Text style={styles.headerPillText}>Exit</Text>
          </TouchableOpacity>
          <View style={styles.headerPill}>
            <Text style={styles.headerPillTextSmall}>{locationStatus === "active" ? "GPS Active" : "Waiting..."}</Text>
          </View>
        </View>

        {/* ===== BOTTOM STACK ===== */}
        <View style={[styles.bottomStack, { bottom: insets.bottom }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.simBarContent}>
            {pois.map((poi) => (
              <TouchableOpacity key={poi.id} style={styles.simChip} onPress={() => simulate(poi.location.latitude, poi.location.longitude)}>
                <Text style={styles.simChipText}>{poi.name.split(" (")[0]}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Animated.View style={[styles.card, { height: animatedHeight }]}>
            <View {...panResponder.panHandlers} style={styles.dragHandleArea}><View style={styles.dragHandle} /></View>

            {/* HEADER CARD: Hiển thị POI hoặc SHOP tuỳ vào trạng thái */}
            <View style={styles.cardHeaderFixed}>
              {selectedShop ? (
                // NẾU ĐANG CHỌN SHOP
                <View>
                  <TouchableOpacity onPress={() => setSelectedShop(null)} style={{ marginBottom: 8 }}>
                    <Text style={{ color: colors.accent, fontWeight: 'bold' }}>← Back to POI</Text>
                  </TouchableOpacity>
                  <Text style={styles.cardTitle}>{selectedShop.name}</Text>
                  <Text style={{ color: colors.textSecondary, marginTop: 4 }}>🕒 {selectedShop.openingHours || "Đang cập nhật"}</Text>
                </View>
              ) : (
                // NẾU ĐANG CHỌN POI
                <>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{displayPoi ? displayPoi.name : "Linh Ung Pagoda Map"}</Text>
                    {displayPoi && (
                      <View style={[styles.badge, isVisited ? styles.badgeGreen : styles.badgeOrange]}>
                        <Text style={[styles.badgeText, isVisited ? styles.badgeTextGreen : styles.badgeTextOrange]}>{isVisited ? "Visited" : "Nearby"}</Text>
                      </View>
                    )}
                  </View>
                  {displayPoi && (
                    <View style={styles.cardActions}>
                      <TouchableOpacity style={[styles.actionButton, styles.actionPrimary]} onPress={handleListen}>
                        <Text style={styles.actionPrimaryText}>{ttsState === "speaking" ? "Stop" : "Listen"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionButton, styles.actionOutline]} onPress={handleChat}>
                        <Text style={styles.actionOutlineText}>Chat</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </>
              )}
            </View>

            {/* NỘI DUNG CARD */}
            <ScrollView style={styles.cardScroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>

              {/* === CHẾ ĐỘ XEM SHOP === */}
              {selectedShop ? (
                <View>
                  <ImageCarousel imageUrl={selectedShop.imageUrl} />

                  {isTranslatingShop ? (
                    <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 20 }} />
                  ) : (
                    <Text style={styles.fullDescription}>{translatedShopDesc || selectedShop.descriptionVi}</Text>
                  )}
                </View>
              ) : (
                /* === CHẾ ĐỘ XEM POI === */
                displayPoi ? (
                  <>
                    <Text style={styles.cardDescription}>{translatedDesc.short || displayPoi.shortDescriptionVi}</Text>
                    {distance !== null && <Text style={styles.cardDistance}>Distance: {distance}m</Text>}

                      <ImageCarousel imageUrl={displayPoi.imageUrl} />

                    <View style={styles.divider} />
                    <Text style={styles.sectionTitle}>Details</Text>
                    <Text style={styles.fullDescription}>{translatedDesc.full || displayPoi.fullDescriptionVi}</Text>

                    {/*  PHẦN HIỂN THỊ CÁC QUÁN CUỘN NGANG */}
                    {displayPoi.shopkeepers && displayPoi.shopkeepers.length > 0 && (
                      <>
                        <View style={styles.divider} />
                        <Text style={styles.sectionTitle}>Shops nearby</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 10 }}>
                          {displayPoi.shopkeepers.map((shop) => (
                            <TouchableOpacity
                              key={shop.id}
                              style={styles.shopHorizontalCard}
                              onPress={() => handleShopClick(shop)}
                              activeOpacity={0.8}
                            >
                              <Image
                                source={{ uri: shop.imageUrl ? `${API_BASE}${shop.imageUrl}` : "https://via.placeholder.com/150" }}
                                style={styles.shopImage}
                              />
                              <View style={styles.shopTextWrap}>
                                <Text style={styles.shopName} numberOfLines={1}>{shop.name}</Text>
                                <Text style={styles.shopHours}>🕒 {shop.openingHours || "N/A"}</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </>
                    )}
                  </>
                ) : (
                  <Text style={styles.cardDescription}>Choose a location on the map to start.</Text>
                )
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ... các style cũ giữ nguyên ...
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  header: { position: "absolute", left: 16, right: 16, zIndex: 20, flexDirection: "row", justifyContent: "space-between" },
  headerPill: { backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.orangeBorder },
  headerPillText: { fontWeight: "700", color: colors.accentDark },
  headerPillTextSmall: { fontSize: 12, fontWeight: "700", color: "#374151" },
  deniedBanner: { position: "absolute", left: 16, right: 16, zIndex: 20, backgroundColor: "#FEF2F2", padding: 12, borderRadius: 16 },
  deniedText: { color: "#DC2626", fontWeight: "600" },

  bottomStack: { position: "absolute", left: 16, right: 16, zIndex: 20, gap: 10 },
  simBarContent: { gap: 8, paddingBottom: 4 },
  simChip: { backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.orangeBorder },
  simChipText: { fontSize: 12, fontWeight: "700", color: colors.accentDark },

  card: { backgroundColor: colors.surface, borderRadius: 24, overflow: "hidden", elevation: 8, borderWidth: 1, borderColor: colors.orangeBorder },
  dragHandleArea: { width: "100%", height: 30, alignItems: "center", justifyContent: "center" },
  dragHandle: { width: 50, height: 5, borderRadius: 3, backgroundColor: "#D1D5DB" },
  cardHeaderFixed: { paddingHorizontal: 16, paddingBottom: 12 },
  cardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  cardTitle: { fontSize: 20, fontWeight: "800", color: colors.textPrimary, flex: 1 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  badgeOrange: { backgroundColor: colors.softAccent },
  badgeGreen: { backgroundColor: "#F0FDF4" },
  badgeText: { fontSize: 12, fontWeight: "700", color: colors.accentDark },
  badgeTextOrange: { color: colors.accentDark },
  badgeTextGreen: { color: "#16A34A" },

  cardActions: { flexDirection: "row", gap: 12 },
  actionButton: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 16 },
  actionPrimary: { backgroundColor: colors.accent },
  actionPrimaryText: { color: "white", fontWeight: "700" },
  actionOutline: { borderWidth: 1, borderColor: colors.accent },
  actionOutlineText: { color: colors.accentDark, fontWeight: "700" },

  cardScroll: { flex: 1, paddingHorizontal: 16 },
  cardDescription: { fontSize: 15, color: colors.textSecondary, lineHeight: 22 },
  cardDistance: { marginTop: 8, color: colors.accentDark, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "800", color: colors.textPrimary, marginBottom: 12 },
  fullDescription: { fontSize: 15, color: colors.textSecondary, lineHeight: 24 },

  // 👈 STYLE CHO THẺ QUÁN CUỘN NGANG
  shopHorizontalCard: {
    width: 160,
    backgroundColor: "#F9FAFB",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  shopImage: {
    width: "100%",
    height: 100,
    backgroundColor: "#E5E7EB",
  },
  shopTextWrap: {
    padding: 10,
  },
  shopName: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  shopHours: {
    fontSize: 12,
    color: colors.textSecondary,
  }
});