// src/api/pois.ts
import { Platform } from "react-native";
import { POI } from "../types/poi";

export const API_BASE = `https://residence-cathedral-blinks.ngrok-free.dev`;

export async function fetchPois(): Promise<POI[]> {
  const res = await fetch(`${API_BASE}/api/pois`, {
    headers: {
      "ngrok-skip-browser-warning": "true", // 👈 Bắt buộc phải có khi dùng Ngrok
    },
  });
  
  if (!res.ok) {
    throw new Error(`POI fetch failed (${res.status})`);
  }
  const data = (await res.json()) as { pois: POI[] };
  return data.pois;
}