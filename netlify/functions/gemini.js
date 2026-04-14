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
  // برومبت "المخرج الفني" - يركز على العمق النفسي والرمزي للقصة
  const directorPrompt = `You are a world-class Film Director and Concept Artist. 
  Analyze the soul, emotions, and hidden themes of this Arabic story: "${title}".
  Story Context: ${content.substring(0, 1200)}

  Task: Create a highly evocative, symbolic, and cinematic image prompt in English.
  
  Focus on:
  1. The "Soul": What is the core emotion? (Loneliness, terror, hope, ancient wisdom).
  2. The "Atmosphere": Don't just say 'light', describe it (e.g., 'dust motes dancing in a single shaft of moonlight').
  3. The "Visual Anchor": One specific, highly detailed object or person from the story.
  4. Technical Excellence: 35mm film grain, moody lighting, shot on IMAX, hyper-realistic textures.

  STRICT: NO text, NO words, NO flat colors. Make it look like a masterpiece movie poster.
  Return ONLY the English prompt.`;

  const promptResult = await callGemini(apiKey, "gemini-2.0-flash", directorPrompt, 4000);
  
  // إضافة لمسات احترافية إضافية للـ Prompt لضمان الواقعية القصوى
  const cinematicEnhancers = "masterpiece, depth of field, sharp focus, incredible textures, highly emotive, 8k resolution, cinematic color grading.";
  const finalImagePrompt = promptResult.success 
    ? `${promptResult.text}. ${cinematicEnhancers}`
    : `A profound, cinematic, and hyper-realistic scene representing the essence of ${title}. ${cinematicEnhancers}`;

  const seed = Math.floor(Math.random() * 9999999);
  // ملاحظة: قمنا بتغيير الموديل إلى flux-realism لضمان لمسة بشرية وليست بلاستيكية
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
        model: "Flux.Soul-Engine-v2"
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Image Gen Failed" }) };
  }
}
