// src/app/chat.tsx
import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { askChatbot } from "../services/chatService";
import { colors } from "../theme/colors";

export default function ChatScreen() {
  const { poiId, lang } = useLocalSearchParams<{ poiId: string; lang: string }>();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!question.trim() || loading) return;
    
    const userQ = question;
    setMessages((prev) => [...prev, { role: "user", text: userQ }]);
    setQuestion("");
    setLoading(true);

    try {
      const answer = await askChatbot({
        poiId,
        question: userQ,
        targetLang: lang || "vi",
      });
      setMessages((prev) => [...prev, { role: "ai", text: answer }]);
    } catch (e: any) {
      setMessages((prev) => [...prev, { role: "ai", text: "Lỗi: Không thể kết nối tới AI." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>AI Tour Guide</Text>
        <View style={{ width: 60 }} /> {/* Spacer */}
      </View>
      
      <ScrollView style={styles.chatBox} contentContainerStyle={{ padding: 16 }}>
        {messages.length === 0 && (
          <Text style={{ textAlign: "center", color: "#9CA3AF", marginTop: 20 }}>
            Hỏi tôi bất cứ điều gì về địa điểm này!
          </Text>
        )}
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}>
            <Text style={[styles.text, m.role === "user" && { color: "white" }]}>{m.text}</Text>
          </View>
        ))}
        {loading && <Text style={styles.loading}>AI đang suy nghĩ...</Text>}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={question}
          onChangeText={setQuestion}
          placeholder="Nhập câu hỏi..."
          placeholderTextColor="#9CA3AF"
        />
        <TouchableOpacity style={styles.button} onPress={sendMessage} disabled={loading}>
          <Text style={styles.buttonText}>Gửi</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingTop: 60, backgroundColor: "white", borderBottomWidth: 1, borderColor: "#E5E7EB" },
  backBtn: { padding: 8 },
  backText: { color: colors.accentDark, fontSize: 16, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "bold" },
  chatBox: { flex: 1 },
  bubble: { padding: 12, borderRadius: 16, marginBottom: 10, maxWidth: "85%" },
  userBubble: { backgroundColor: colors.accent, alignSelf: "flex-end", borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: "white", alignSelf: "flex-start", borderBottomLeftRadius: 4 },
  text: { fontSize: 15, color: "#1F2937", lineHeight: 22 },
  loading: { fontStyle: "italic", color: "#6B7280", marginLeft: 8, marginBottom: 10 },
  inputRow: { flexDirection: "row", padding: 16, backgroundColor: "white", borderTopWidth: 1, borderColor: "#E5E7EB", paddingBottom: 32 },
  input: { flex: 1, backgroundColor: "#F3F4F6", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 },
  button: { marginLeft: 10, backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 20, justifyContent: "center" },
  buttonText: { color: "white", fontWeight: "bold", fontSize: 15 },
});