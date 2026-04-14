// ✅ Netlify Function: FINAL AI IMAGE + TEXT SYSTEM

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

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY missing");

    // 🎯 IMAGE SYSTEM (NEW)
    if (action === "generate_image") {
      return await handleImageGeneration(GEMINI_KEY, title, content, category, headers);
    }

    // 🧠 TEXT SYSTEM
    const promptMap = {
      suggest_titles: `اقترح 3 عناوين جذابة:\n${content}`,
      improve_content: `حسن النص بدون تغيير الأحداث:\n${content}`,
      fix_grammar: `صحح الأخطاء فقط:\n${content}`,
      suggest_category: `حدد تصنيف واحد فقط:\n${content}`
    };

    const finalPrompt = promptMap[action];
    if (!finalPrompt) throw new Error("Invalid action");

    const result = await callGemini(GEMINI_KEY, "gemini-2.5-flash", finalPrompt);

    if (!result.success) throw new Error("AI failed");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        text: result.text
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};



// 🧠 GEMINI CALL
async function callGemini(apiKey, model, prompt) {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 800,
            temperature: 0.7
          }
        })
      }
    );

    const data = await res.json();

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { success: false };

    return { success: true, text };

  } catch {
    return { success: false };
  }
}



// 🎨 FINAL IMAGE SYSTEM (AI MATCHED TO STORY)
async function handleImageGeneration(apiKey, title, content, category, headers) {
  try {

    // 🔥 STEP 1: استخراج مشهد حقيقي من القصة
    const scenePrompt = `
    Describe ONE realistic cinematic scene from this story.

    Include:
    - character
    - location
    - action
    - mood

    Max 20 words.

    Title: ${title}
    Story: ${content.substring(0, 1200)}
    `;

    const sceneRes = await callGemini(apiKey, "gemini-2.5-flash", scenePrompt);

    let scene = sceneRes.success
      ? sceneRes.text.replace(/\n/g, "").trim()
      : "cinematic dramatic scene";

    console.log("Scene:", scene);

    // 🎨 STEP 2: توليد الصورة بـ Flux
    const fluxUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(scene)}?width=1024&height=768&model=flux&enhance=true`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(fluxUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) throw new Error("Flux failed");

      const buffer = await response.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          scene,
          image: base64,
          source: "flux-ai"
        })
      };

    } catch (fluxErr) {
      clearTimeout(timeout);

      console.log("Flux failed → fallback");

      // 🔄 fallback صورة بسيطة
      const fallbackUrl = `https://image.pollinations.ai/prompt/cinematic%20scene`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          scene,
          image_url: fallbackUrl,
          fallback: true
        })
      };
    }

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Image system failed: " + err.message
      })
    };
  }
}
