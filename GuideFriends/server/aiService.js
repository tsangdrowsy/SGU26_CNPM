// server/aiService.js
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
dotenv.config();

let aiClient = null;

function getGemini() {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      console.warn("[gemini] GEMINI_API_KEY missing — translations will fallback to source text.");
    }
    aiClient = new GoogleGenAI({ apiKey: key ?? "" });
  }
  return aiClient;
}

const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";

/**
 * Translate Vietnamese text into the target language.
 * Returns the translated string, or the original text if Gemini fails.
 */
// server/aiService.js
export async function translateTextGemini(textVi, targetLang) {
  if (!textVi) return "";
  if (targetLang === "vi") return textVi;

  const ai = getGemini();
  
  // Thử lại tối đa 3 lần nếu Google báo quá tải (503)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: `You are a professional tour-guide translator. Translate the following Vietnamese text into natural, spoken ${targetLang}. Return ONLY the translation — no explanations, no quotes, no markdown.\n\nVietnamese text:\n${textVi}`,
      });
      return response.text?.trim() ?? textVi;
    } catch (err) {
      console.warn(`[gemini] attempt ${attempt} failed:`, err.message);
      if (attempt === 3) throw err; // Nếu 3 lần đều lỗi thì ném lỗi ra ngoài
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Chờ 1.5s rồi thử lại
    }
  }
}

export async function chatWithContext({ question, contextVi, targetLang = "en" }) {
  const ai = getGemini();
  const context = contextVi ? `Here is the ground-truth information about this location:\n---\n${contextVi}\n---\n` : "";

  // Tương tự cho phần Chat
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL,
        contents: `${context}You are a helpful tour guide at Linh Ung Pagoda.\nAnswer the visitor's question in ${targetLang}.\nIf the answer is not in the provided context, say you don't know — do not invent facts.\n\nVisitor question: ${question}`,
      });
      return response.text?.trim() ?? "";
    } catch (err) {
      console.warn(`[gemini chat] attempt ${attempt} failed:`, err.message);
      if (attempt === 3) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

