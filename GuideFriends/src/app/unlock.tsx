// src/app/unlock.tsx
import { useState } from "react";
import { router } from "expo-router";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser"; // 👈 Thêm
import PrimaryButton from "../components/PrimaryButton";
import { colors } from "../theme/colors";
import { API_BASE } from "../api/pois"; // 👈 Thêm

export default function UnlockScreen() {
  const [mode, setMode] = useState<"clerk" | "vnpay">("clerk");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // --- LUỒNG 1: NHẬP MÃ CLERK ---
  const handleClerkUnlock = async () => {
    if (!token.trim()) {
      setMessage("Please enter your activation code.");
      return;
    }
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch(`${API_BASE}/api/auth/validate-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.toUpperCase() }),
      });
      const data = await res.json();

      if (res.ok && data.valid) {
        await AsyncStorage.setItem("access_token", token.toUpperCase());
        router.replace("/map");
      } else {
        setMessage(data.error || "Invalid or expired code.");
      }
    } catch (e) {
      setMessage("Error connecting to the server.");
    } finally {
      setLoading(false);
    }
  };

  // --- LUỒNG 2: THANH TOÁN VNPAY ---
  const handleVNPayUnlock = async () => {
    setLoading(true);
    try {
      // 1. Gọi backend lấy URL thanh toán VNPAY
      const res = await fetch(`${API_BASE}/api/payment/create-vnpay-url`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      // 2. Mở trình duyệt VNPAY
      await WebBrowser.openBrowserAsync(data.paymentUrl);

      // 3. Polling kiểm tra trạng thái sau khi khách quay lại
      pollPaymentStatus(data.token);
    } catch (e) {
      Alert.alert("Error", "cannot create VNPay checkout.");
      setLoading(false);
    }
  };

  const pollPaymentStatus = (vnpayToken: string) => {
    setMessage("Waiting for transaction confirmation...");
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/payment/check-status/${vnpayToken}`);
        const data = await res.json();

        if (data.status === "success") {
          clearInterval(interval);
          await AsyncStorage.setItem("access_token", vnpayToken);
          router.replace("/map");
        }
      } catch (e) {
        // Bỏ qua lỗi mạng tạm thời trong lúc polling
      }
    }, 3000); // 3 giây hỏi 1 lần
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Text style={styles.title}>Unlock Guide</Text>
          <Text style={styles.subtitle}>
            Enter your activation code or pay online to start exploring.
          </Text>

          {/* Thanh chuyển đổi Tab */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, mode === "clerk" && styles.tabActive]}
              onPress={() => setMode("clerk")}
            >
              <Text style={[styles.tabText, mode === "clerk" && styles.tabTextActive]}>
                Nhập mã (Clerk)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === "vnpay" && styles.tabActive]}
              onPress={() => setMode("vnpay")}
            >
              <Text style={[styles.tabText, mode === "vnpay" && styles.tabTextActive]}>
                Thanh toán VNPAY
              </Text>
            </TouchableOpacity>
          </View>

          {mode === "clerk" ? (
            <View style={{ gap: 16 }}>
              <TextInput
                style={styles.input}
                placeholder="Enter activation code (6 chars)"
                placeholderTextColor={colors.textSecondary}
                value={token}
                onChangeText={setToken}
                autoCapitalize="characters"
                maxLength={6}
                autoCorrect={false}
              />
              <PrimaryButton
                title="Unlock"
                onPress={handleClerkUnlock}
                loading={loading}
                disabled={!token.trim()}
              />
            </View>
          ) : (
            <View style={{ gap: 16, alignItems: "center" }}>
              <Text style={{ textAlign: "center", color: colors.textSecondary, marginBottom: 8 }}>
                Thanh toán an toàn qua cổng VNPAY để nhận mã kích hoạt tự động.
              </Text>
              <Image
                source={{ uri: "https://vnpay.vn/wp-content/uploads/2020/07/Logo-VNPAY-1024x576.png" }}
                style={{ width: 200, height: 100, resizeMode: "contain" }}
              />
               <View style={{ marginLeft: 10, marginRight:10 , width: "100%" }}>
              <PrimaryButton
                title="Checkout 15.000đ"
                onPress={handleVNPayUnlock}
                loading={loading}
                
              />
              </View>
            </View>
          )}

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Text style={styles.helperText}>
            Need help? Please contact the ticket counter.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ... (Các style cũ giữ nguyên)
  safeArea: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1, justifyContent: "center", padding: 24, paddingBottom: 48 },
  container: { width: "100%", maxWidth: 420, alignSelf: "center", gap: 16 },
  title: { fontSize: 30, fontWeight: "800", color: colors.textPrimary },
  subtitle: { fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: colors.textPrimary, textAlign: "center", fontWeight: "bold" },
  message: { fontSize: 14, fontWeight: "600", color: colors.accentDark, textAlign: "center" },
  helperText: { fontSize: 13, color: colors.textSecondary, textAlign: "center", marginTop: 16 },
  

  // Style cho Tab
  tabContainer: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 16, padding: 4, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 12 },
  tabActive: { backgroundColor: colors.softAccent },
  tabText: { fontSize: 14, fontWeight: "600", color: colors.textSecondary },
  tabTextActive: { color: colors.accentDark, fontWeight: "800" },

});