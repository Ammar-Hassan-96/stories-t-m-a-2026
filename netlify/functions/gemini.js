/**
 * 🏆 Gemini AI Backend - Production Edition
 * 
 * المهام:
 * 1. توليد الصور باستخدام Gemini Director + Pollinations (مع fallback ذكي)
 * 2. fallback بين Flux و Turbo models
 * 3. معالجة timeouts بشكل دقيق
 * 
 * النصوص بتمشي client-side من index.html (مفيش Netlify timeout)
 */

const NETLIFY_TIMEOUT_BUDGET = 9500; // 9.5 ثانية - قبل Netlify بـ 0.5 ثانية للأمان

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const startTime = Date.now();

  try {
    const { action, title, content, category, style } = JSON.parse(event.body);
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
      return { 
        statusCode: 500, 
        headers, 
        body: JSON.stringify({ error: "GEMINI_API_KEY غير مُعدّ في متغيرات Netlify" }) 
      };
    }

    if (action === "generate_image") {
      if (!title || !content) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "title و content مطلوبان" }) };
      }
      return await handleImageGeneration({ apiKey: API_KEY, title, content, category, style, headers, startTime });
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: `Action غير مدعوم: ${action}` }) };

  } catch (error) {
    console.error("[Handler Error]", error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: error.message || "خطأ غير معروف" }) 
    };
  }
};

// ═══════════════════════════════════════════════════════════
// 🎨 IMAGE GENERATION - مع fallback متعدد المصادر
// ═══════════════════════════════════════════════════════════

const STYLE_PROFILES = {
  cinematic: "cinematic film still, ARRI Alexa, anamorphic lens, dramatic lighting, IMAX quality, hyper-detailed, professional color grading",
  photorealistic: "ultra-photorealistic, 8K, intricate details, professional photography, sharp focus, realistic textures",
  anime: "high-quality anime, Studio Ghibli style, vibrant colors, expressive characters, detailed background",
  digital_art: "stunning digital painting, ArtStation trending, concept art, masterpiece quality",
  dark_fantasy: "dark fantasy, gothic atmosphere, eerie mood, dramatic shadows, oil painting style"
};

const CATEGORY_VISUALS = {
  horror: { mood: "horror, eerie, terrifying, dark shadows, supernatural", lighting: "low-key chiaroscuro, candlelight, moonlight through fog" },
  drama: { mood: "emotional, intimate, melancholic", lighting: "warm golden hour, soft natural light" },
  kids: { mood: "cheerful, magical, wholesome, vibrant", lighting: "bright soft daylight, sparkly highlights" },
  "sci-fi": { mood: "futuristic, technological, cyberpunk", lighting: "neon lights, holographic glow, electric blue" },
  thriller: { mood: "suspenseful, tense, mysterious, noir", lighting: "harsh contrast, single light source, deep shadows" },
  islamic: { mood: "spiritual, serene, sacred, peaceful", lighting: "warm golden light, sunset over desert" },
  love: { mood: "romantic, tender, warm, dreamy", lighting: "soft sunset, candlelight, bokeh background" }
};

async function handleImageGeneration({ apiKey, title, content, category, style, headers, startTime }) {
  const styleHint = STYLE_PROFILES[style] || STYLE_PROFILES.cinematic;
  const catVisual = CATEGORY_VISUALS[category] || { mood: "atmospheric", lighting: "dramatic cinematic lighting" };

  // 🧠 الخطوة 1: Gemini يولّد prompt إنجليزي ذكي (max 3 ثواني)
  let imagePrompt = await generateImagePrompt({ apiKey, title, content, catVisual, styleHint });
  console.log("[Image Prompt]", imagePrompt.substring(0, 200));

  // ⏱️ احسب الوقت المتبقي بعد توليد الـ prompt
  const elapsed = Date.now() - startTime;
  const remainingTime = NETLIFY_TIMEOUT_BUDGET - elapsed;
  
  if (remainingTime < 2000) {
    return { 
      statusCode: 504, 
      headers, 
      body: JSON.stringify({ error: "نفد الوقت لتوليد الصورة. حاول مرة أخرى." }) 
    };
  }

  // 🎨 الخطوة 2: نجرب Pollinations بـ fallback ذكي
  // Turbo model أسرع بكتير من Flux ومناسب للـ Netlify Free Plan
  const seed = Math.floor(Math.random() * 9999999);
  const encodedPrompt = encodeURIComponent(imagePrompt);
  
  // قائمة المصادر بترتيب الأولوية (الأسرع أولاً للأمان مع Netlify timeout)
  const imageSources = [
    {
      name: "Pollinations Turbo",
      url: `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&model=turbo&seed=${seed}&nologo=true`,
      timeoutMs: Math.min(remainingTime - 500, 7000)
    },
    {
      name: "Pollinations Flux",
      url: `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=576&model=flux&seed=${seed}&nologo=true`,
      timeoutMs: Math.min(remainingTime - 500, 8000)
    }
  ];

  let lastError = null;
  for (const source of imageSources) {
    if (source.timeoutMs < 2000) {
      console.log(`[Skip ${source.name}] Not enough time left: ${source.timeoutMs}ms`);
      continue;
    }
    
    console.log(`[Try ${source.name}] Timeout: ${source.timeoutMs}ms`);
    const result = await fetchImage(source.url, source.timeoutMs);
    
    if (result.success) {
      console.log(`[Success ${source.name}] Image: ${result.size} bytes`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          text: imagePrompt,
          image: result.base64,
          model: source.name,
          style: style || "cinematic"
        })
      };
    }
    
    lastError = result.error;
    console.log(`[Fail ${source.name}] ${result.error}`);
  }

  return { 
    statusCode: 502, 
    headers, 
    body: JSON.stringify({ 
      error: `فشل توليد الصورة من جميع المصادر. آخر خطأ: ${lastError || "غير معروف"}. حاول مرة أخرى.` 
    }) 
  };
}

// 🧠 توليد prompt إنجليزي ذكي يفهم القصة العربية
async function generateImagePrompt({ apiKey, title, content, catVisual, styleHint }) {
  const directorPrompt = `You are an elite concept artist creating a vivid English image generation prompt from this Arabic story.

═══ STORY ═══
Title: "${title}"
Content (excerpt): ${content.substring(0, 1200)}

═══ TASK ═══
Generate ONE detailed English prompt (max 300 chars) for the SINGLE most powerful visual moment in this story.

The prompt MUST include:
1. WHO: Main character(s) - appearance, clothing, age, expression, posture
2. WHERE: Specific setting from the story (interior/exterior, time of day, location details)
3. WHAT: The exact dramatic action or frozen moment
4. MOOD: ${catVisual.mood}
5. LIGHTING: ${catVisual.lighting}
6. STYLE: ${styleHint}

═══ CRITICAL RULES ═══
- Output ONLY the English prompt - no explanations, no quotes, no markdown
- NO text/letters/words/typography in the image (specify "no text, no letters")
- Be SPECIFIC to this story - extract real details, characters, places mentioned
- If Arabic/Middle Eastern setting, describe it accurately (Arab faces, clothing, architecture)
- Maximum 300 characters total

Begin the prompt now:`;

  const result = await callGeminiQuick(apiKey, directorPrompt);
  
  if (result.success && result.text.length > 30) {
    return result.text
      .replace(/^["'`*]+|["'`*]+$/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 800)
      .trim() + ", no text, no letters, no watermarks";
  }
  
  // Fallback عملي لو Gemini فشل
  return `${styleHint}, ${catVisual.mood}, ${catVisual.lighting}, masterpiece illustration depicting "${title}", highly detailed, professional book cover quality, no text, no letters`;
}

// 📞 استدعاء Gemini سريع (لتوليد prompt الصور)
async function callGeminiQuick(apiKey, prompt) {
  const models = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
  
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 ثواني فقط لكل موديل

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85, maxOutputTokens: 400 }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      if (!res.ok) {
        console.log(`[Gemini ${model}] HTTP ${res.status}`);
        continue;
      }
      
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (text.trim()) return { success: true, text: text.trim() };
    } catch (e) {
      console.log(`[Gemini ${model}] Error:`, e.message);
      continue;
    }
  }
  
  return { success: false, error: "كل موديلات Gemini فشلت" };
}

// 🌐 جلب الصورة من URL مع timeout دقيق
async function fetchImage(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const res = await fetch(url, { 
      signal: controller.signal,
      headers: { 'Accept': 'image/*' }
    });
    clearTimeout(timeoutId);
    
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }
    
    const buffer = await res.arrayBuffer();
    const size = buffer.byteLength;
    
    // فحص أن الصورة صحيحة (مش فاضية أو error response)
    if (size < 1000) {
      return { success: false, error: `صورة فارغة (${size} bytes)` };
    }
    
    return { 
      success: true, 
      base64: Buffer.from(buffer).toString('base64'),
      size 
    };
  } catch (e) {
    clearTimeout(timeoutId);
    if (e.name === 'AbortError') {
      return { success: false, error: `Timeout بعد ${timeoutMs}ms` };
    }
    return { success: false, error: e.message };
  }
}
