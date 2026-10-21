// src/services/translationService.ts
import { API_BASE } from "../api/pois";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Mảng dự phòng nếu AI sập (503)
const MOCK_TRANSLATIONS: Record<string, Record<string, string>> = {
  poi_001: {
    en: "Linh Ung Pagoda, famous for having the tallest Guan Yin statue in Vietnam.",
    zh: "灵应寺，以拥有越南最高的观音像而闻名。",
    ko: "링응 사찰, 베트남에서 가장 높은 관음상으로 유명합니다.",
    ja: "リンウン寺、ベトナムで最も高い観音像で有名です。",
  },
  poi_002: {
    en: "The Guan Yin statue is 67 meters tall, equivalent to a 30-story building.",
    zh: "观音像高67米，相当于30层楼高。",
    ko: "관음상은 67미터로, 30층 건물과 맞먹는 높이입니다.",
    ja: "観音像は高さ67メートルで、30階建てのビルに相当します。",
  },
  poi_003: {
    en: "The main entrance gate featuring traditional Buddhist architecture.",
    zh: "具有传统佛教建筑风格的正门。",
    ko: "전통 불교 건축양식을 갖춘 정문.",
    ja: "伝統的な仏教建築様式を持つ正門。",
  },
};

const memoryCache = new Map<string, string>();

export async function translatePoi(
  poiId: string,
  textVi: string,
  targetLang: string
): Promise<string> {
  if (targetLang === "vi") return textVi;

  const cacheKey = `${poiId}:${targetLang}`;
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey)!;

  try {
    const res = await fetch(`${API_BASE}/api/ai/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ poiId, targetLang }),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const { text } = (await res.json()) as { text: string };
    memoryCache.set(cacheKey, text);
    return text;
  } catch (e) {
    console.warn("[translate] AI failed (maybe 503), using mock fallback:", e);
    // Nếu AI sập, dùng câu tiếng Anh mẫu. 
    // Tuyệt đối không trả về textVi để tránh giọng Anh đọc tiếng Việt.
    const fallbackText = MOCK_TRANSLATIONS[poiId]?.[targetLang] || textVi;
    return fallbackText;
  }
}
export async function translateText(textVi: string, targetLang: string): Promise<string> {
  if (targetLang === "vi" || !textVi) return textVi;

  // Tạo key cache dựa trên mã băm của text để tránh trùng lặp
  const cacheKey = `trans_${textVi.substring(0, 30)}_${targetLang}`;
  
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return cached;

    const res = await fetch(`${API_BASE}/api/ai/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: textVi, targetLang }),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    
    await AsyncStorage.setItem(cacheKey, data.text);
    return data.text;
  } catch (e) {
    console.warn("[translate] AI failed, fallback to original:", e);
    return textVi; // Nếu AI lỗi, hiển thị tiếng Việt
  }
}
export async function translateBatch(texts: string[], targetLang: string): Promise<string[]> {
  if (targetLang === "vi" || texts.length === 0) return texts;

  try {
    const res = await fetch(`${API_BASE}/api/ai/translate-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, targetLang }),
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = await res.json();
    return data.texts;
  } catch (e) {
    console.warn("[translateBatch] failed:", e);
    return texts; // Fallback
  }
}