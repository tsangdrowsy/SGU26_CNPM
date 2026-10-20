// src/app/_layout.tsx
import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";

// Safe even if splash module behaves differently across SDKs
SplashScreen.preventAutoHideAsync?.();

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;

    const boot = async () => {
      try {
        // Put startup work here later (fonts, cache warm-up).
        // For now: nothing that can throw or hang.
      } finally {
        if (alive) setReady(true);
        SplashScreen.hideAsync?.();
      }
    };

    boot();

    // Failsafe: NEVER show a blank screen for more than 3s
    const t = setTimeout(() => {
      setReady(true);
      SplashScreen.hideAsync?.();
    }, 3000);

    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  if (!ready) return null;

  return <Stack screenOptions={{ headerShown: false }} />;
}