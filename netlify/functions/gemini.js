// Netlify Function: Gemini AI Proxy - PRO VERSION
// ✅ مشاهد سينمائية حقيقية بدل صور عشوائية
// ✅ توليد صورتين (Opening + Climax)
// ✅ تحسين جودة الـ prompt بشكل احترافي
// ✅ fallback ذكي
// ✅ نفس الأداء السريع

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { action, prompt, content, title, category } = JSON.parse(event.body);
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "GEMINI_API_KEY مش موجود" }) };
    }

    const MODEL_STRATEGY = {
      default: ["gemini-2.5-flash"],
    };

    if (action === "generate_image") {
      return await handleImageGeneration(API_KEY, title, content, category, headers);
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: "action غير معروف" }) };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};

// ============================
// 🧠 Gemini Call
// ============================
async function callGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.9,
      maxOutputTokens: 2048
    }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.error?.message || "Gemini error" };
    }

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
    if (!text.trim()) return { success: false, error: "Empty response" };

    return { success: true, text: text.trim() };

  } catch (err) {
    clearTimeout(timeoutId);
    return { success: false, error: err.message };
  }
}

// ============================
// 🎨 IMAGE GENERATION (PRO)
// ============================
async function handleImageGeneration(apiKey, title, content, category, headers) {
  try {

    const styleMap = {
      horror: "dark horror cinematic lighting shadows fog eerie atmosphere",
      drama: "emotional cinematic storytelling soft lighting realistic",
      kids: "colorful cartoon soft lighting disney style",
      "sci-fi": "futuristic cyberpunk neon high tech cinematic",
      thriller: "dark tense noir cinematic shadows high contrast",
      islamic: "islamic architecture warm light spiritual detailed",
      love: "romantic warm golden hour soft cinematic lighting"
    };

    const styleHint = styleMap[category] || "cinematic ultra realistic";

    // ============================
    // 🎬 1. OPENING SCENE
    // ============================
    const openingPrompt = `
You are a film director.

Extract the OPENING scene from this story.

Make it extremely visual:
- character (age, look)
- exact place
- action happening
- camera angle
- lighting

Convert it into a cinematic image prompt.

Style:
${styleHint}
ultra realistic, 4k, depth of field, no text

Story: ${content.substring(0, 2000)}

Return ONLY the prompt.
`;

    // ============================
    // 🔥 2. CLIMAX SCENE
    // ============================
    const climaxPrompt = `
You are a film director.

Extract the MOST INTENSE moment (climax) from this story.

Make it extremely visual:
- character emotion
- action peak moment
- environment
- cinematic lighting

Convert it into a cinematic image prompt.

Style:
${styleHint}
ultra realistic, 4k, dramatic lighting, no text

Story: ${content.substring(0, 2000)}

Return ONLY the prompt.
`;

    const [openingRes, climaxRes] = await Promise.all([
      callGemini(apiKey, "gemini-2.5-flash", openingPrompt),
      callGemini(apiKey, "gemini-2.5-flash", climaxPrompt)
    ]);

    const prompts = [];

    if (openingRes.success) prompts.push(cleanPrompt(openingRes.text));
    if (climaxRes.success) prompts.push(cleanPrompt(climaxRes.text));

    // fallback لو فشل كله
    if (prompts.length === 0) {
      prompts.push(`
cinematic scene ${styleHint}, 
single character, detailed environment, 
dramatic lighting, ultra realistic, 4k, no text
      `.trim());
    }

    // ============================
    // 🎨 توليد الصور
    // ============================
    const images = [];

    for (let i = 0; i < prompts.length; i++) {
      const seed = generateSeed(title + i);
      const encoded = encodeURIComponent(prompts[i]);

      const url = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=768&seed=${seed}&model=flux&enhance=true&nologo=true`;

      try {
        const res = await fetch(url);
        const buffer = await res.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");

        images.push(base64);
      } catch (err) {
        console.log("Image error:", err.message);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        prompts,
        images,
        model: "flux-pro-cinematic"
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
}

// ============================
// 🧼 تنظيف الـ prompt
// ============================
function cleanPrompt(text) {
  return text
    .replace(/^["']|["']$/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================
// 🎲 Seed ثابت
// ============================
function generateSeed(str) {
  return Math.abs(str.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)) & 0x7FFFFFFF;
}
