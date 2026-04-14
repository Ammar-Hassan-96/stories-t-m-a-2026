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
  // برومبت عبقري يستخلص "الروح" البصرية للقصة
  const directorPrompt = `As a Hollywood Cinematographer, analyze this story: "${title}".
Story Excerpt: ${content.substring(0, 1000)}

Create a MASTERPIECE image prompt in English (60 words max). 
Follow this formula:
[Subject Description] + [Specific Action/Pose] + [Exact Location] + [Time of Day/Lighting Type] + [Camera Lens 35mm/85mm] + [Vibe: Hyper-realistic, 8k, highly detailed, photorealistic].

STRICT RULES:
- NO text/typography.
- NO cartoonish look.
- Focus on the most dramatic scene.
Return ONLY the English text.`;

  const promptResult = await callGemini(apiKey, "gemini-2.0-flash", directorPrompt, 3000);
  const finalImagePrompt = promptResult.success ? promptResult.text : `High-end cinematic shot of ${title}, hyper-realistic`;

  // توليد Seed متغير تماماً لضمان عدم التكرار
  const seed = Math.floor(Math.random() * 9999999);
  const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(finalImagePrompt)}?width=1280&height=720&model=flux&seed=${seed}&nologo=true`;

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
        model: "Flux.Pro-Ultra-Realism"
      })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Image Gen Failed" }) };
  }
}
