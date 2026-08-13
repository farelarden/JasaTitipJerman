"use client";

import { useState } from "react";
import { Send, Bot, User, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function ChatInterface() {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([
    {
      role: "assistant",
      content: "Halo! Saya **JasTip AI Assistant** 🇩🇪. Ada produk dari Jerman (skincare, vitamin, cokelat, dll) yang ingin kamu tanyakan?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Maaf, kendala jaringan." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto p-4">
      <header className="flex items-center justify-between py-4 border-b">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-amber-500 rounded-lg text-white font-bold">🇩🇪 ➔ 🇮🇩</div>
          <div>
            <h1 className="font-bold text-lg">JasTip Germany</h1>
            <p className="text-xs text-muted-foreground">Smart Shopping Consultant</p>
          </div>
        </div>
        <Badge variant="outline" className="text-green-600 border-green-600">Konsultasi Gratis ($0)</Badge>
      </header>

      <div className="flex-1 overflow-y-auto space-y-4 py-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-3 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <Card className={`max-w-[80%] ${m.role === "user" ? "bg-amber-600 text-white" : "bg-slate-100"}`}>
              <CardContent className="p-3 text-sm">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </CardContent>
            </Card>
          </div>
        ))}
        {loading && <div className="text-xs text-muted-foreground animate-pulse">Memeriksa database katalog Jerman...</div>}
      </div>

      <div className="pt-2 flex gap-2">
        <Input
          placeholder="Tanyakan produk (contoh: Balea Vitamin C)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <Button onClick={handleSend} disabled={loading} className="bg-amber-600"><Send className="w-4 h-4" /></Button>
      </div>
    </div>
  );
}