// ✅ Netlify Function: ULTIMATE AI + REAL IMAGES SYSTEM

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
    const UNSPLASH_KEY = process.env.UNSPLASH_ACCESS_KEY;

    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY missing");
    if (!UNSPLASH_KEY) throw new Error("UNSPLASH_ACCESS_KEY missing");

    // 🎯 IMAGE SYSTEM
    if (action === "generate_image") {
      return await handleRealImages(GEMINI_KEY, UNSPLASH_KEY, title, content, category, headers);
    }

    // 🧠 TEXT SYSTEM
    const MODEL_STRATEGY = {
      suggest_titles: ["gemini-2.5-flash"],
      suggest_category: ["gemini-2.5-flash"],
      fix_grammar: ["gemini-2.5-flash"],
      improve_content: ["gemini-2.5-flash"],
    };

    const promptMap = {
      suggest_titles: `اقترح 3 عناوين جذابة:\n${content}`,
      improve_content: `حسن النص بدون تغيير الأحداث:\n${content}`,
      fix_grammar: `صحح الأخطاء فقط:\n${content}`,
      suggest_category: `حدد تصنيف واحد فقط:\n${content}`
    };

    const finalPrompt = promptMap[action];
    if (!finalPrompt) throw new Error("Invalid action");

    const models = MODEL_STRATEGY[action] || ["gemini-2.5-flash"];

    for (const model of models) {
      const result = await callGemini(GEMINI_KEY, model, finalPrompt);
      if (result.success) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            text: result.text,
            model
          })
        };
      }
    }

    throw new Error("All models failed");

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};



// 🧠 GEMINI CALL (FAST + SAFE)
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
            maxOutputTokens: 1200,
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



// 🎨 REAL IMAGE ENGINE (SMART VERSION)
async function handleRealImages(apiKey, unsplashKey, title, content, category, headers) {
  try {

    // 🔥 STEP 1: Smart Keyword Extraction
    const keywordPrompt = `
    Generate 3 highly specific photo search keywords.

    Include:
    - place
    - subject
    - mood

    Title: ${title}
    Story: ${content.substring(0, 1200)}

    Output only keywords separated by commas.
    `;

    const keywordRes = await callGemini(apiKey, "gemini-2.5-flash", keywordPrompt);

    let keywords = keywordRes.success ? keywordRes.text : "cinematic dramatic scene";

    console.log("Keywords:", keywords);

    // 🔥 STEP 2: Multi-query تحسين الدقة
    const queries = keywords.split(",").map(q => q.trim()).slice(0, 3);

    let images = [];

    for (const q of queries) {
      const res = await fetch(
        `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=2&orientation=landscape`,
        {
          headers: {
            Authorization: `Client-ID ${unsplashKey}`,
          }
        }
      );

      const data = await res.json();

      if (data.results) {
        images.push(...data.results.map(img => ({
          url: img.urls.regular,
          thumb: img.urls.small,
          alt: img.alt_description || q,
          author: img.user.name
        })));
      }
    }

    // 🔥 STEP 3: إزالة التكرار
    const uniqueImages = Array.from(new Map(images.map(i => [i.url, i])).values());

    if (uniqueImages.length === 0) throw new Error("No images found");

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        keywords,
        images: uniqueImages.slice(0, 5),
        source: "unsplash-smart"
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Image engine failed: " + err.message
      })
    };
  }
}
