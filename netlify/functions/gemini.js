/**
 * 🏆 Gemini AI Backend - Elite Edition
 * 
 * المهام:
 * 1. توليد الصور (عبر Gemini للـ prompt + Pollinations Flux للصورة)
 * 2. توليد prompts ذكية تفهم القصة العربية بعمق
 * 
 * النصوص بتمشي client-side من index.html مباشرة (مفيش timeout)
 */

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { action, title, content, category, style } = JSON.parse(event.body);
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "GEMINI_API_KEY غير مُعدّ في Netlify" }) };
    }

    if (action === "generate_image") {
      return await handleImageGeneration({ apiKey: API_KEY, title, content, category, style, headers });
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "هذا الـ action غير مدعوم في Backend" }) };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};

/**
 * 🎨 توليد صور احترافية - Elite Image Generation
 * يستخدم Gemini لفهم القصة العربية ثم Pollinations Flux للتوليد
 */
async function handleImageGeneration({ apiKey, title, content, category, style, headers }) {
  // 🎭 خرائط الأنماط البصرية (cinematic, photorealistic, anime, etc.)
  const styleProfiles = {
    cinematic: {
      english: "cinematic film still, shot on ARRI Alexa, anamorphic lens, dramatic lighting, IMAX quality, hyper-detailed, professional color grading",
      arabic: "سينمائي"
    },
    photorealistic: {
      english: "ultra-photorealistic, 8K resolution, intricate details, professional photography, sharp focus, realistic textures, depth of field",
      arabic: "واقعي"
    },
    anime: {
      english: "high-quality anime illustration, Studio Ghibli inspired, beautiful detailed art, vibrant colors, expressive characters",
      arabic: "أنمي"
    },
    digital_art: {
      english: "stunning digital painting, ArtStation trending, concept art, highly detailed, fantasy illustration, masterpiece",
      arabic: "رسم رقمي"
    },
    dark_fantasy: {
      english: "dark fantasy illustration, gothic atmosphere, eerie mood, intricate details, dramatic shadows, oil painting style",
      arabic: "خيال داكن"
    }
  };

  // 🎨 إعدادات بصرية حسب التصنيف
  const categoryVisuals = {
    horror: { mood: "horror, eerie, terrifying, dark shadows, blood-red highlights, supernatural", lighting: "low-key dramatic chiaroscuro, candlelight, moonlight through fog" },
    drama: { mood: "emotional, intimate, melancholic, contemplative", lighting: "warm golden hour, soft natural light, cinematic depth" },
    kids: { mood: "cheerful, magical, wholesome, vibrant, playful", lighting: "bright soft daylight, sparkly highlights, rainbow colors" },
    "sci-fi": { mood: "futuristic, technological, space-age, cyberpunk", lighting: "neon lights, holographic glow, lens flares, electric blue and magenta" },
    thriller: { mood: "suspenseful, tense, mysterious, noir", lighting: "harsh contrast, single light source, deep shadows, rain-slicked surfaces" },
    islamic: { mood: "spiritual, serene, sacred, peaceful, contemplative", lighting: "warm golden light through arches, sunset over desert, soft divine glow" },
    love: { mood: "romantic, tender, warm, intimate, dreamy", lighting: "soft sunset, candlelight, bokeh background, golden hour" }
  };

  const styleProfile = styleProfiles[style] || styleProfiles.cinematic;
  const catVisual = categoryVisuals[category] || { mood: "atmospheric, evocative", lighting: "dramatic cinematic lighting" };

  // 🧠 prompt ذكي للمخرج: يقرأ القصة ويستخرج المشهد البصري الأقوى
  const directorPrompt = `You are a world-class concept artist and visual director for cinema and book covers.

Analyze this Arabic story and craft a vivid English image generation prompt for the SINGLE most striking visual moment.

═══ STORY DATA ═══
Title: "${title}"
Category: ${category} (${catVisual.mood})
Story excerpt: ${content.substring(0, 1500)}

═══ YOUR TASK ═══
Create ONE detailed English prompt (max 350 chars) that captures:

1. SUBJECT: Who/what is the focal point? Describe their appearance, clothing, expression, posture in vivid detail.
2. SETTING: Where exactly? Extract specific locations from the story (room, street, forest, etc.)
3. ACTION: What's happening in this exact moment? Frozen drama or quiet tension?
4. ATMOSPHERE: ${catVisual.mood}
5. LIGHTING: ${catVisual.lighting}
6. STYLE: ${styleProfile.english}

═══ STRICT RULES ═══
- Output ONLY the English prompt (no explanations, no quotes, no markdown)
- NO text/letters/words/typography in image
- NO watermarks
- Make it specific to THIS story, not generic
- If story has Arabic/Middle Eastern setting, preserve cultural authenticity

Begin:`;

  // اطلب من Gemini يصنع prompt للصورة (خفيف وسريع)
  const promptResult = await callGeminiQuick(apiKey, directorPrompt);
  
  let imagePrompt;
  if (promptResult.success && promptResult.text.length > 30) {
    imagePrompt = promptResult.text
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 800)
      .trim();
  } else {
    // fallback: prompt احتياطي أنيق
    imagePrompt = `${styleProfile.english}, ${catVisual.mood}, ${catVisual.lighting}, masterpiece illustration of "${title}", highly detailed, professional book cover quality, no text`;
  }

  console.log("[Image Director] Generated prompt:", imagePrompt.substring(0, 200));

  // 🎲 seed عشوائي تماماً = صور مختلفة كل ضغطة
  const seed = Math.floor(Math.random() * 9999999);
  const encodedPrompt = encodeURIComponent(imagePrompt);
  
  // Pollinations Flux - أحدث وأدق نسخة
  const fluxUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1280&height=720&model=flux&seed=${seed}&nologo=true&enhance=true`;

  try {
    const imgRes = await fetch(fluxUrl);
    if (!imgRes.ok) throw new Error(`Pollinations رد بـ ${imgRes.status}`);

    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        text: imagePrompt,
        image: base64,
        model: "Pollinations Flux + Gemini Director",
        style: style || "cinematic"
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "فشل توليد الصورة: " + e.message }) };
  }
}

/**
 * استدعاء Gemini سريع لتوليد prompts الصور
 */
async function callGeminiQuick(apiKey, prompt) {
  const models = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
  
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, maxOutputTokens: 500 }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const data = await res.json();
      
      if (!res.ok) continue;
      
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      if (text.trim()) return { success: true, text: text.trim() };
    } catch (e) {
      continue;
    }
  }
  
  return { success: false, error: "كل موديلات Gemini فشلت" };
}
