// src/app/index.tsx

import { router } from "expo-router";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import PrimaryButton from "../components/PrimaryButton";
import { colors } from "../theme/colors";

const features = [
  {
    id: "map",
    icon: "🗺️",
    title: "Interactive Map",
    description: "Explore Linh Ung Pagoda easily",
  },
  {
    id: "audio",
    icon: "🎧",
    title: "Automatic Audio Guide",
    description: "Audio plays when you arrive near a POI",
  },
  {
    id: "ai",
    icon: "💬",
    title: "AI Assistant",
    description: "Ask questions about the pagoda",
  },
];

export default function IndexScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.container}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Linh Ung Pagoda</Text>
          </View>

          <View style={styles.heroCircle}>
            <Text style={styles.heroIcon}>🛕</Text>
          </View>

          <Text style={styles.title}>Linh Ung Guide</Text>

          <Text style={styles.subtitle}>
            Discover Linh Ung Pagoda with an automatic audio guide,
            interactive map, and AI assistant.
          </Text>

          <View style={styles.featureList}>
            {features.map((feature) => (
              <View key={feature.id} style={styles.featureCard}>
                <View style={styles.featureIconBox}>
                  <Text style={styles.featureIcon}>{feature.icon}</Text>
                </View>

                <View style={styles.featureTextBox}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureDescription}>
                    {feature.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.ctaWrap}>
            <PrimaryButton
              title="Get Started"
              onPress={() => router.push("/language")}
            />
          </View>

          <Text style={styles.helperText}>
            You will need an activation code from the counter.
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
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    paddingBottom: 48,
  },
  container: {
    width: "100%",
    maxWidth: 420,
    alignItems: "center",
  },
  badge: {
    backgroundColor: colors.softAccent,
    borderColor: colors.orangeBorder,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  badgeText: {
    color: colors.accentDark,
    fontSize: 13,
    fontWeight: "700",
  },
  heroCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 32,
  },
  heroIcon: {
    fontSize: 52,
  },
  title: {
    marginTop: 24,
    fontSize: 32,
    fontWeight: "800",
    color: colors.textPrimary,
    textAlign: "center",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  featureList: {
    width: "100%",
    marginTop: 32,
    gap: 16,
  },
  featureCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.orangeBorder,
    borderWidth: 1,
    borderRadius: 20,
    padding: 16,
    gap: 16,
  },
  featureIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.softAccent,
    alignItems: "center",
    justifyContent: "center",
  },
  featureIcon: {
    fontSize: 22,
  },
  featureTextBox: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  featureDescription: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  ctaWrap: {
    width: "100%",
    marginTop: 32,
  },
  helperText: {
    marginTop: 16,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: "center",
  },
});