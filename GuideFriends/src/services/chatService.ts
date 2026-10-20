// src/services/chatService.ts
import { API_BASE } from "../api/pois";

export async function askChatbot(params: {
  poiId?: string;
  question: string;
  targetLang: string;
}): Promise<string> {
  const res = await fetch(`${API_BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!res.ok) throw new Error(`chat ${res.status}`);

  const { answer } = (await res.json()) as { answer: string };
  return answer;
}