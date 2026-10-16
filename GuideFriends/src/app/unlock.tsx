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
} from "react-native";
import PrimaryButton from "../components/PrimaryButton";
import { DEV_MASTER_KEY, isValidMasterKey } from "../config/auth";
import { colors } from "../theme/colors";

export default function UnlockScreen() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleUnlock = () => {
    if (!token.trim()) {
      setMessage("Please enter your activation code.");
      return;
    }

    setLoading(true);
    setMessage("");

    setTimeout(() => {
      setLoading(false);

      if (!isValidMasterKey(token)) {
        setMessage("Invalid activation code.");
        return;
      }

      // TODO later (per PRD Flow 1):
      // 1. Call Auth Service (Redis token check)
      // 2. Call POI Service once -> bulk JSON
      // 3. Save JSON into AsyncStorage
      router.replace("/map");
    }, 800);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Unlock Guide</Text>

          <Text style={styles.subtitle}>
            Enter the activation code provided by the counter staff
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Enter activation code"
            placeholderTextColor={colors.textSecondary}
            value={token}
            onChangeText={setToken}
            autoCapitalize="characters"
            autoCorrect={false}
          />

          <PrimaryButton
            title="Unlock"
            onPress={handleUnlock}
            loading={loading}
            disabled={!token.trim()}
          />

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <View style={styles.devBox}>
            <Text style={styles.devTitle}>Temporary dev key</Text>
            <Text style={styles.devKey}>{DEV_MASTER_KEY}</Text>
          </View>

          <Text style={styles.helperText}>
            Need help? Please contact the ticket counter.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    paddingBottom: 48,
  },
  container: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    gap: 16,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
  },
  message: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.accentDark,
  },
  devBox: {
    marginTop: 8,
    backgroundColor: colors.softAccent,
    borderColor: colors.orangeBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  devTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.accentDark,
  },
  devKey: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: "800",
    color: colors.textPrimary,
  },
  helperText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
  },
});