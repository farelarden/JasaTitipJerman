'use client';

import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// Interface diperbarui dengan properti image opsional
interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string; // Menyimpan URL preview lokal untuk UI
}

export default function MinimalistChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Halo! 👋 Saya **JasTip Germany Assistant**. Mau cari produk retail apa dari Jerman hari ini? Kamu juga bisa unggah foto produk lho!',
    },
  ]);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 4 * 1024 * 1024) {
        alert('Ukuran gambar maksimal 4MB');
        return;
      }
      setSelectedImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleRemoveImage = () => {
    setSelectedImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedImage) || isLoading) return;

    // Simpan URL preview lokal untuk ditampilkan di Chat Bubble
    const currentImagePreview = imagePreview;

    // Buat objek pesan baru
    const userMessage: Message = {
      role: 'user',
      content: input.trim(),
      image: currentImagePreview || undefined, // Tempelkan URL gambar ke pesan user
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const formData = new FormData();
      // Kirim history messages tanpa properti blob UI yang berat
      const cleanHistoryForBackend = newMessages.map(({ role, content }) => ({ role, content }));
      formData.append('messages', JSON.stringify(cleanHistoryForBackend));
      
      if (selectedImage) {
        formData.append('image', selectedImage);
      }

      // Reset form input & preview
      setSelectedImage(null);
      setImagePreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      const res = await fetch('/api/chat', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (data.response) {
        setMessages([...newMessages, { role: 'assistant', content: data.response }]);
      } else {
        setMessages([
          ...newMessages,
          { role: 'assistant', content: '⚠️ Gagal mendapatkan balasan dari AI.' },
        ]);
      }
    } catch (error) {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: '❌ Terjadi masalah jaringan. Silakan coba lagi.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#09090b] text-zinc-100 font-sans selection:bg-zinc-800 selection:text-white">
      
      {/* HEADER */}
      <header className="sticky top-0 z-10 bg-[#09090b]/80 backdrop-blur-md border-b border-zinc-800/80 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h1 className="text-xs font-semibold tracking-wider uppercase text-zinc-200">
            JasTip Germany <span className="text-zinc-500 font-normal"></span>
          </h1>
        </div>
      </header>

      {/* CHAT MESSAGES */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-8 max-w-5xl mx-auto w-full space-y-6">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[95%] sm:max-w-[85%] rounded-2xl px-5 py-4 text-xs sm:text-sm leading-relaxed transition-all ${
                msg.role === 'user'
                  ? 'bg-zinc-100 text-zinc-900 font-medium rounded-br-xs shadow-sm'
                  : 'bg-zinc-900/90 text-zinc-200 border border-zinc-800/80 rounded-bl-xs shadow-md'
              }`}
            >
              {/* RENDER GAMBAR DARI USER JIKA ADA */}
              {msg.image && (
                <div className="mb-3 overflow-hidden rounded-xl border border-zinc-300 max-w-[220px]">
                  <img
                    src={msg.image}
                    alt="Foto Unggahan User"
                    className="w-full h-auto max-h-48 object-cover rounded-lg"
                  />
                </div>
              )}

              {/* RENDER TEXT DENGAN MARKDOWN */}
              {msg.content && (
                <ReactMarkdown
                  components={{
                    img: ({ node, ...props }) => {
                      if (!props.src || props.src === '-' || props.src.trim() === '') return null; // cite: 4
                      return (
                        <span className="block my-2.5 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/50 p-1 max-w-[200px]">
                          <img
                            {...props}
                            src={props.src}
                            className="rounded-lg max-h-36 w-full object-contain hover:scale-105 transition-transform duration-300"
                            alt={props.alt || 'Gambar Produk'}
                            loading="lazy"
                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                          />
                        </span>
                      );
                    },
                    a: ({ node, ...props }) => {
                      if (!props.href || props.href === '-' || props.href.trim() === '') return null; // cite: 4
                      return (
                        <a
                          {...props}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 underline font-medium text-xs transition-colors my-1"
                        />
                      );
                    },
                    p: ({ children }) => <span className="block mb-2 last:mb-0">{children}</span>, // cite: 4
                    ul: ({ children }) => <ul className="space-y-3 my-2">{children}</ul>, // cite: 4
                    li: ({ children }) => (
                      <li className="list-none border-b border-zinc-800/40 pb-2 last:border-none last:pb-0">
                        {children}
                      </li>
                    ), // cite: 4
                    strong: ({ children }) => (
                      <strong className="font-semibold text-white">{children}</strong> // cite: 4
                    ),
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              )}
            </div>
          </div>
        ))}

        {/* Indikator Loading */}
        {isLoading && (
          <div className="flex items-center gap-2 text-zinc-500 text-xs pl-2">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" />
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0.2s]" />
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0.4s]" />
            <span className="ml-1 text-[11px] font-mono text-zinc-600">Menganalisis foto & mencari katalog...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* INPUT FOOTER */}
      <footer className="p-4 sm:p-6 bg-[#09090b] border-t border-zinc-800/60 max-w-5xl mx-auto w-full">
        
        {/* PREVIEW GAMBAR SEBELUM DIKIRIM */}
        {imagePreview && (
          <div className="mb-3 flex items-center gap-2 bg-zinc-900 border border-zinc-800 p-2 rounded-xl w-max">
            <img src={imagePreview} alt="Preview" className="w-12 h-12 object-cover rounded-lg" />
            <button
              type="button"
              onClick={handleRemoveImage}
              className="p-1 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="relative flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-3 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-800 transition-all cursor-pointer"
            title="Unggah Foto Produk"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 002-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={selectedImage ? 'Tambah catatan (opsional)...' : 'Cari brand atau produk Jerman...'}
              className="w-full bg-zinc-900/90 text-zinc-100 placeholder-zinc-500 text-xs sm:text-sm rounded-full pl-5 pr-12 py-3.5 border border-zinc-800 focus:outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all shadow-inner"
            />
            
            <button
              type="submit"
              disabled={isLoading || (!input.trim() && !selectedImage)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-zinc-100 text-zinc-900 hover:bg-white disabled:opacity-20 disabled:hover:bg-zinc-100 transition-all cursor-pointer"
            >
              <svg
                className="w-3.5 h-3.5 transform rotate-90"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M12 19V5m0 0l-7 7m7-7l7 7"
                />
              </svg>
            </button>
          </div>
        </form>

        <p className="text-[10px] text-center text-zinc-600 mt-2 tracking-wide">
          JasTip Germany AI • Katalog Informasi & Konsultasi Retail Jerman
        </p>
      </footer>
    </div>
  );
}