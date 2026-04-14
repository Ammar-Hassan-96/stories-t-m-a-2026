// Netlify Function: Gemini AI Proxy - ELITE VERSION 2026
// Optimized for: Extreme Story Representation & Photorealism

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method Not Allowed" }) };

  try {
    const { action, prompt, content, title, category } = JSON.parse(event.body);
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: "API Key Missing" }) };

    // استراتيجية النماذج: نستخدم أحدث الإصدارات المتاحة للذكاء والإبداع
    const MODEL_STRATEGY = {
      suggest_titles: ["gemini-2.0-flash", "gemini-1.5-flash"],
      generate_story: ["gemini-1.5-pro", "gemini-2.0-flash"], // Pro أفضل للحبكة الطويلة
      generate_image: ["gemini-2.0-flash"] // Flash أسرع في هندسة الأوامر
    };

    let systemContext = "You are a professional Creative Director and Senior Developer.";
    let finalPrompt = "";

    switch (action) {
      case "suggest_titles":
        finalPrompt = `Analyze this story and suggest 3 viral, catchy titles. Return ONLY the titles in Arabic, one per line.\nStory: ${content}`;
        break;
      case "generate_story":
        finalPrompt = `Write a deep, immersive, and thrilling story about: ${prompt}. Category: ${category}. Maximize drama and descriptive details. Language: Arabic. Output ONLY the story.`;
        break;
      case "generate_image":
        return await handleImageGeneration(API_KEY, title, content, category, headers);
      default:
        // التعامل مع باقي الحالات (توسيع النص، تحسينه) بنفس المنطق القوي
        finalPrompt = `Action: ${action}. Target Content: ${content}. Apply professional creative writing rules. Return only the result.`;
    }

    const models = MODEL_STRATEGY[action] || ["gemini-2.0-flash"];
    const result = await callGemini(API_KEY, models[0], finalPrompt, 8500);

    return {
      statusCode: result.success ? 200 : 500,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};

async function callGemini(apiKey, model, prompt, timeoutMs) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: controller.signal
    });
    clearTimeout(id);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    return { success: res.ok, text: text.trim() };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleImageGeneration(apiKey, title, content, category, headers) {
  // برومبت المخرج المحترف - يركز على تحويل النص لمشهد بصري ملموس
  const directorPrompt = `You are a visionary Concept Artist for high-end cinema. 
  Story Title: "${title}"
  Full Story Context: ${content.substring(0, 1500)}

  Task: Extract the most powerful visual scene from this Arabic story and describe it for image generation.
  
  Guidelines:
  1. Main Subject: Describe the protagonist or key object with intense detail (clothing, expression, texture).
  2. Setting: Describe the environment based on the story (ancient ruins, futuristic city, misty forest).
  3. Lighting & Mood: Use dramatic lighting (e.g., chiaroscuro, volumetric fog, ethereal glow).
  4. Symbolic Detail: Include one unique item or element mentioned in the story to make it authentic.
  
  Style: Hyper-realistic cinematic masterpiece, shot on 70mm lens, IMAX quality, extremely detailed textures, photorealistic.
  STRICT: No text or typography. No cartoonish vibes.
  Return ONLY the English prompt text.`;

  const promptResult = await callGemini(apiKey, "gemini-2.0-flash", directorPrompt, 5000);
  const finalImagePrompt = promptResult.success ? promptResult.text : `Cinematic photorealistic masterpiece of ${title}`;

  const seed = Math.floor(Math.random() * 9999999);
  // استخدام نموذج Flux مع تفعيل الـ Enhance لضمان دقة التفاصيل
  const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalImagePrompt)}?width=1280&height=720&model=flux&seed=${seed}&nologo=true&enhance=true`;

  try {
    const imgRes = await fetch(fluxUrl);
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        text: finalImagePrompt,
        image: base64,
        model: "Flux-Visionary-v3"
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Image Gen Failed: " + e.message }) };
  }
}
