// src/app/language.tsx

import { useState } from "react";
import { router } from "expo-router";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import PrimaryButton from "../components/PrimaryButton";
import { colors } from "../theme/colors";

const languages = [
  { code: "vi", label: "Tiếng Việt" },
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "ko", label: "한국어" },
  { code: "ja", label: "日本語" },
];

export default function LanguageScreen() {
  const [selectedLanguage, setSelectedLanguage] = useState("en");

  const handleContinue = () => {
    router.push("/unlock");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <Text style={styles.title}>Select Language</Text>

          <Text style={styles.subtitle}>
            Choose your preferred guide language
          </Text>

          <View style={styles.languageList}>
            {languages.map((language) => {
              const isSelected = language.code === selectedLanguage;

              return (
                <TouchableOpacity
                  key={language.code}
                  style={[
                    styles.languageCard,
                    isSelected && styles.languageCardSelected,
                  ]}
                  onPress={() => setSelectedLanguage(language.code)}
                  activeOpacity={0.85}
                >
                  <Text
                    style={[
                      styles.languageText,
                      isSelected && styles.languageTextSelected,
                    ]}
                  >
                    {language.label}
                  </Text>

                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>

          <PrimaryButton title="Continue" onPress={handleContinue} />
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
    marginBottom: 8,
  },

  languageList: {
    gap: 12,
    marginBottom: 12,
  },

  languageCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  languageCardSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.softAccent,
  },

  languageText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
  },

  languageTextSelected: {
    color: colors.accentDark,
  },

  checkmark: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.accent,
  },
});