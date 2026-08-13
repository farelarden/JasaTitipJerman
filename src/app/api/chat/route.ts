import { NextResponse } from 'next/server';

// ============================================================================
// CONFIGURATION & ENVIRONMENT VARIABLES
// ============================================================================
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(); // cite: 2
const SUPABASE_KEY = (
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
).trim(); // cite: 2
const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim(); // cite: 2
const HUGGINGFACE_API_KEY = (process.env.HUGGINGFACE_API_KEY || '').trim();

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// ============================================================================
// 1. EMBEDDING GENERATOR (HuggingFace Free Inference API)
// ============================================================================
async function getQueryEmbedding(text: string): Promise<number[]> {
  if (!HUGGINGFACE_API_KEY) return [];

  try {
    const res = await fetch(
      'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2',
      {
        headers: { 
          'Authorization': `Bearer ${HUGGINGFACE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        method: 'POST',
        body: JSON.stringify({ inputs: text }),
      }
    );

    if (!res.ok) return [];
    const embedding = await res.json();
    return Array.isArray(embedding[0]) ? embedding[0] : embedding;
  } catch (err) {
    return [];
  }
}

// ============================================================================
// 2. QUERY REWRITER (Extract Keyword from Text / Image Analysis)
// ============================================================================
async function rewriteQueryWithLLM(textInput: string): Promise<string> {
  if (!GROQ_API_KEY || !textInput.trim()) return 'NONE'; // cite: 2

  const systemPrompt = `
Kamu adalah Keyword Extractor untuk mesin pencari database produk retail Jerman.
Tugas utama: Ekstrak HANYA NAMA BRAND atau JENIS PRODUK UTAMA dalam 1-2 kata murni.

ATURAN KETAT:
1. Jika teks menyebut nama BRAND (seperti Balea, Nivea, Essence, Catrice, dll) atau deskripsi produk, KEMBALIKAN NAMA BRAND/PRODUK UTAMANYA SAJA!
2. Jika teks HANYA berisi sapaan/basa-basi (seperti "halo", "apa kabar", "tes"), KEMBALIKAN: NONE
3. HANYA kembalikan kata kunci murni. DILARANG menambah penjelasan.
`; // cite: 2

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', // cite: 2
      headers: {
        'Content-Type': 'application/json', // cite: 2
        'Authorization': `Bearer ${GROQ_API_KEY}`, // cite: 2
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant', // cite: 2
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: textInput }
        ],
        temperature: 0.1, // cite: 2
        max_tokens: 15, // cite: 2
      }),
      cache: 'no-store', // cite: 2
    });

    if (!res.ok) return textInput;

    const data = await res.json(); // cite: 2
    const extracted = data?.choices?.[0]?.message?.content?.trim() || ''; // cite: 2
    const cleanKeyword = extracted.replace(/[^\w\s]/gi, '').trim(); // cite: 2

    return cleanKeyword || 'NONE'; // cite: 2
  } catch (err: any) {
    return textInput;
  }
}

// ============================================================================
// 3. VISION: Analisis Gambar via Groq Llama-3.2 Vision
// ============================================================================
async function analyzeImageWithVision(imageBase64OrUrl: string): Promise<string> {
  if (!GROQ_API_KEY) return ''; // cite: 2

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', // cite: 2
      headers: {
        'Content-Type': 'application/json', // cite: 2
        'Authorization': `Bearer ${GROQ_API_KEY}`, // cite: 2
      },
      body: JSON.stringify({
        model: 'llama-3.2-11b-vision-preview', // cite: 2
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Sebutkan nama merek (brand), nama produk lengkap, dan jenis produk yang terlihat pada gambar ini secara rinci.',
              },
              {
                type: 'image_url',
                image_url: { url: imageBase64OrUrl }, // cite: 2
              },
            ],
          },
        ],
        temperature: 0.2, // cite: 2
        max_tokens: 250,
      }),
    });

    if (!res.ok) return '';
    const data = await res.json(); // cite: 2
    return data?.choices?.[0]?.message?.content || ''; // cite: 2
  } catch (err) {
    return '';
  }
}

// ============================================================================
// 4. RETRIEVAL: Vector Search & Direct REST Fallback
// ============================================================================
async function searchProductsVector(query: string, limit = 5, threshold = 0.20) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !query || query === 'NONE') return []; // cite: 2

  const vector = await getQueryEmbedding(query);
  if (!vector || vector.length === 0) return []; // cite: 2

  const endpoint = `${SUPABASE_URL}/rest/v1/rpc/match_products`; // cite: 2

  try {
    const res = await fetch(endpoint, {
      method: 'POST', // cite: 2
      headers: {
        'apikey': SUPABASE_KEY, // cite: 2
        'Authorization': `Bearer ${SUPABASE_KEY}`, // cite: 2
        'Content-Type': 'application/json', // cite: 2
      },
      body: JSON.stringify({
        query_embedding: vector,
        match_threshold: threshold,
        match_count: limit,
      }),
      cache: 'no-store', // cite: 2
    });

    if (!res.ok) return [];
    const data = await res.json(); // cite: 2
    return data || []; // cite: 2
  } catch (err) {
    return [];
  }
}

async function searchProductsDirectREST(keyword: string, limit = 5) {
  if (!keyword || keyword.toUpperCase() === 'NONE') return []; // cite: 2
  if (!SUPABASE_URL || !SUPABASE_KEY) return []; // cite: 2

  const cleanStr = keyword.replace(/[^\w\s]/gi, '').trim(); // cite: 2
  if (!cleanStr) return []; // cite: 2

  const words = cleanStr.split(/\s+/).filter(w => w.length > 1); // cite: 2
  const mainWord = words[0]; // cite: 2

  const rawFilter = `(brand.ilike.*${mainWord}*,product_name.ilike.*${mainWord}*)`; // cite: 2
  const encodedFilter = encodeURIComponent(rawFilter); // cite: 2

  const endpoint = `${SUPABASE_URL}/rest/v1/dm_products?select=id,product_name,description,price_euro,image_url,product_url,brand&or=${encodedFilter}&limit=${limit}`; // cite: 2

  try {
    const res = await fetch(endpoint, {
      method: 'GET', // cite: 2
      headers: {
        'apikey': SUPABASE_KEY, // cite: 2
        'Authorization': `Bearer ${SUPABASE_KEY}`, // cite: 2
        'Content-Type': 'application/json', // cite: 2
      },
      cache: 'no-store', // cite: 2
    });

    if (!res.ok) return []; // cite: 2
    const data = await res.json(); // cite: 2
    return data || []; // cite: 2
  } catch (err) {
    return []; // cite: 2
  }
}

// ============================================================================
// 5. GENERATE GROQ CHAT (System Prompt)
// ============================================================================
async function generateGroqChat(messagesHistory: Message[], context: string): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY belum terisi di .env.local'); // cite: 2

  const systemMessage: Message = {
    role: 'system',
    content: `Kamu adalah JasTip Germany AI Personal Shopper Assistant. Tugasmu membantu pengguna di Indonesia mencari informasi produk retail di Jerman secara ramah, komunikatif, dan akurat.

KATALOG PRODUK TERSEDIA DARI DATABASE:
${context}

==================================================
INSTRUKSI OPERASIONAL & PERILAKU:
==================================================
1. Jika pengguna hanya menyapa/basa-basi (contoh: "halo", "apa kabar", "tes"), jawab sapaan mereka dengan hangat dan tawarkan bantuan mencari produk retail Jerman.
2. Jika KATALOG PRODUK memuat data produk, REKOMENDASIKAN PRODUK HANYA DARI DATA TERSEBUT!
3. Jika KATALOG PRODUK berisi "TIDAK ADA PRODUK TERKAIT", sampaikan dengan ramah bahwa produk belum tersedia di katalog database, lalu tawarkan bantuan lain.
4. DILARANG keras mengatakan "saya tidak memiliki akses ke gambar" atau "saya tidak dapat menganalisis gambar" karena gambar user SUDAH DIANALISIS oleh sistem dan hasilnya tercantum dalam percakapan.
5. Gunakan riwayat percakapan sebelumnya untuk memberikan jawaban yang berkesinambungan dan relevan.

==================================================
INSTRUKSI FORMATTING PRODUK (WAJIB PATUHI):
==================================================
1. Selalu tampilkan produk menggunakan LIST / BULLET POINTS (•), BUKAN paragraf panjang!
2. Gunakan Bold (**text**) untuk nama brand & produk agar menonjol.
3. FORMAT PENULISAN SETIAP PRODUK:
   • **[Brand] [Nama Produk]** — **€[Harga]**
     ![[Nama Produk]]([Gambar URL])
     *Deskripsi singkat atau kategori*
     🔗 [Lihat Detail Produk di Store]([Link Produk])

   *Catatan Gambar & Link:*
   - Jika Gambar URL bernilai '-' atau tidak valid, JANGAN tampilkan sintaks Markdown gambar ![]().
   - Jika Link Produk bernilai '-' atau tidak valid, JANGAN tampilkan baris link 🔗.

📌 **Informasi Penting:**
- Seluruh harga tertera adalah estimasi retail di Jerman (sudah termasuk MwSt/VAT).
- Platform ini murni berfungsi sebagai katalog & media konsultasi informasi (tanpa fitur transaksi langsung).` // cite: 2
  };

  const controller = new AbortController(); // cite: 2
  const timeoutId = setTimeout(() => controller.abort(), 9000); // cite: 2

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', // cite: 2
      headers: {
        'Content-Type': 'application/json', // cite: 2
        'Authorization': `Bearer ${GROQ_API_KEY}`, // cite: 2
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile', // cite: 2
        messages: [
          systemMessage,
          ...messagesHistory,
        ],
        temperature: 0.6,
        max_tokens: 1800, // cite: 2
      }),
      signal: controller.signal, // cite: 2
      cache: 'no-store', // cite: 2
    });

    clearTimeout(timeoutId); // cite: 2

    if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`); // cite: 2

    const data = await res.json(); // cite: 2
    return data?.choices?.[0]?.message?.content || 'Maaf, tidak ada respon AI.'; // cite: 2
  } catch (err: any) {
    clearTimeout(timeoutId); // cite: 2
    throw err; // cite: 2
  }
}

// ============================================================================
// 6. MAIN ENTRY POINT (POST ROUTE)
// ============================================================================
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || ''; // cite: 2
    let messagesHistory: Message[] = [];
    let extractedImageContext = '';

    // TAHAP 1: PARSING INPUT
    if (contentType.includes('multipart/form-data')) { // cite: 2
      const formData = await req.formData(); // cite: 2
      const rawMessages = formData.get('messages') as string;
      const imageFile = formData.get('image') as Blob; // cite: 2

      if (rawMessages) messagesHistory = JSON.parse(rawMessages);

      if (imageFile) {
        console.log('🖼️ [Multimodal] Memproses File Gambar via Groq Vision...');
        const arrayBuffer = await imageFile.arrayBuffer(); // cite: 2
        const base64Image = Buffer.from(arrayBuffer).toString('base64'); // cite: 2
        const mimeType = imageFile.type || 'image/jpeg'; // cite: 2
        extractedImageContext = await analyzeImageWithVision(`data:${mimeType};base64,${base64Image}`);
        console.log(`✅ [Vision Context]: "${extractedImageContext}"`);
      }
    } else {
      const body = await req.json(); // cite: 2
      messagesHistory = body.messages || [];

      if (body.imageBase64) {
        extractedImageContext = await analyzeImageWithVision(body.imageBase64); // cite: 2
      }
    }

    if (messagesHistory.length === 0 && !extractedImageContext) {
      return NextResponse.json({ error: 'Mohon masukkan pesan teks atau unggah gambar.' }, { status: 400 });
    }

    // TAHAP 2: INJEKSI HASIL VISION KE DALAM HISTORY CHAT
    // Jika ada hasil Vision, gabungkan ke dalam isi pesan user terakhir agar LLM sadar akan isi gambarnya
    if (extractedImageContext) {
      const lastUserIndex = messagesHistory.findLastIndex((m) => m.role === 'user');
      if (lastUserIndex !== -1) {
        messagesHistory[lastUserIndex].content = `${messagesHistory[lastUserIndex].content}\n\n[Sistem Ekstraksi Foto: Gambar memperlihatkan "${extractedImageContext}"]`.trim();
      } else {
        messagesHistory.push({
          role: 'user',
          content: `[Sistem Ekstraksi Foto: Gambar memperlihatkan "${extractedImageContext}"]`,
        });
      }
    }

    // Ambil pesan user terakhir yang sudah diinjeksi konteks visual untuk bahan pencarian
    const lastUserMsg = messagesHistory.filter((m) => m.role === 'user').pop()?.content || '';

    // TAHAP 3: EXTRACT KEYWORD & SEARCH RETRIEVAL
    const searchQuery = await rewriteQueryWithLLM(lastUserMsg); // cite: 2
    console.log(`🔎 [Search Query Extracted]: "${searchQuery}"`);

    let products: any[] = [];
    if (searchQuery && searchQuery !== 'NONE') {
      // Prioritas 1: Vector Search
      products = await searchProductsVector(searchQuery, 5);

      // Prioritas 2: Direct REST Fallback jika Vector Search kosong
      if (products.length === 0) {
        products = await searchProductsDirectREST(searchQuery, 5); // cite: 2
      }
    }

    // TAHAP 4: BENTUK KONTEKS KATALOG UNTUK PROMPT
    const context = products.length > 0
      ? products
          .map(
            (p, i) =>
              `[Produk ${i + 1}] Brand: ${p.brand || 'N/A'} | Nama: ${p.product_name} | Harga: €${p.price_euro || 'N/A'}\nDeskripsi: ${p.description || '-'}\nURL: ${p.product_url || '-'}\nGambar: ${p.image_url || '-'}`
          )
          .join('\n\n---\n\n') // cite: 2
      : 'TIDAK ADA PRODUK TERKAIT DI KATALOG DATABASE.'; // cite: 2

    // Limit riwayat chat untuk menghemat token (6 pesan terakhir)
    const truncatedHistory = messagesHistory.slice(-6);

    // TAHAP 5: GENERATE GROQ CHAT
    try {
      const responseText = await generateGroqChat(truncatedHistory, context); // cite: 2
      return NextResponse.json({
        response: responseText,
        count: products.length,
        products: products,
        imageAnalysis: extractedImageContext || null
      }); // cite: 2
    } catch (llmError: any) {
      return NextResponse.json({
        response: 'Sistem sedang memproses antrean. Silakan coba kirim pesan sekali lagi.',
        count: 0,
        products: [],
      }); // cite: 2
    }

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 }); // cite: 2
  }
}