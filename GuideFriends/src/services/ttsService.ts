// src/services/ttsService.ts
import * as Speech from "expo-speech";

const VOICE_MAP: Record<string, string> = {
  vi: "vi-VN",
  en: "en-US",
  zh: "zh-CN",
  ko: "ko-KR",
  ja: "ja-JP",
};

export function localeFor(lang: string): string {
  return VOICE_MAP[lang] ?? "en-US";
}

export function speak(text: string, lang: string): Promise<void> {
  return new Promise((resolve, reject) => {
    Speech.speak(text, {
      language: localeFor(lang),
      rate: 0.9,
      pitch: 1.0,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: (error) => reject(error),
    });
  });
}

export async function stopSpeaking(): Promise<void> {
  await Speech.stop();
}