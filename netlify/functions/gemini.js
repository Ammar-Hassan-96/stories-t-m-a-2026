
// Netlify Function: Gemini AI Proxy (FINAL STABLE + IMAGE FIXED)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===============================
// SAFE FETCH (ANTI CRASH SYSTEM)
// ===============================
async function safeFetch(url, options, retries = 5) {
  let delay = 1500;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();

      // 🔥 HTML DETECTION
      if (text.trim().startsWith("<")) {
        throw new Error("HTML response detected");
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON response");
      }

      if (res.ok) return data;

      const msg = data?.error?.message || "";

      if (
        msg.includes("high demand") ||
        msg.includes("Quota") ||
        msg.includes("rate") ||
        res.status === 429 ||
        res.status >= 500
      ) {
        await sleep(delay);
        delay *= 2;
        continue;
      }

      throw new Error(msg || "API error");

    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(delay);
      delay *= 2;
    }
  }

  throw new Error("Max retries exceeded");
}

// ===============================
// SIMPLE CACHE
// ===============================
const cache = new Map();

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: "Method not allowed" };
  }

  try {
    const { action, prompt, content, title, category, part = 1 } =
      JSON.parse(event.body);

    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "Missing API Key" }),
      };
    }

    let finalPrompt = "";

    // ===============================
    // TEXT ACTIONS
    // ===============================
    switch (action) {
      case "generate_story":
        finalPrompt = `
اكتب قصة طويلة (1500-2000 كلمة)

Part ${part}

${part === 1 ? "ابدأ القصة بقوة" : "اكمل بدون تكرار"}

الفكرة:
${prompt}

مهم:
- لا تختصر
- استمر حتى النهاية
`;
        break;

      case "expand_content":
        finalPrompt = `وسع النص بالكامل:\n${content}`;
        break;

      case "improve_content":
        finalPrompt = `حسّن النص:\n${content}`;
        break;

      case "suggest_titles":
        finalPrompt = `اقترح 3 عناوين فقط:\n${content}`;
        break;

      case "suggest_category":
        finalPrompt = `اختار تصنيف واحد فقط:\n${content}`;
        break;

      case "fix_grammar":
        finalPrompt = `صحح النص فقط:\n${content}`;
        break;

      // ===============================
      // IMAGE GENERATION (FIXED 🔥)
      // ===============================
      case "generate_image":
        try {
          const gemini = await safeFetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: `
You are a cinematic director.

Extract ONE real visual scene from the story.

STRICT RULES:
- Must be a real moment from story
- No imagination or symbolism
- Must be visually filmable

Return ONLY one image prompt.

Include:
- character(s)
- exact action
- location
- lighting
- camera angle

Story Title: ${title}

Story:
${content.substring(0, 1200)}
`
                      },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.3,
                  maxOutputTokens: 200,
                },
              }),
            }
          );

          const imagePrompt =
            gemini?.candidates?.[0]?.content?.parts?.[0]?.text || title;

          // 🔥 FORCE REALISTIC STYLE (VERY IMPORTANT)
          const finalImagePrompt =
            imagePrompt +
            ", cinematic realistic scene, natural lighting, real environment, story accurate, ultra detailed";

          const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
            finalImagePrompt
          )}?seed=${Date.now()}&model=flux`;

          const imgRes = await fetch(imgUrl);
          const buffer = await imgRes.arrayBuffer();

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              text: imagePrompt,
              image: Buffer.from(buffer).toString("base64"),
            }),
          };
        } catch (err) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              error: "Image error: " + err.message,
            }),
          };
        }

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Invalid action" }),
        };
    }

    // ===============================
    // CACHE CHECK
    // ===============================
    const cacheKey = `${action}_${prompt}_${part}`;
    if (cache.has(cacheKey)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(cache.get(cacheKey)),
      };
    }

    // ===============================
    // GEMINI CALL
    // ===============================
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

    const result = await safeFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 6000,
        },
      }),
    });

    const parts = result?.candidates?.[0]?.content?.parts || [];

    let text = "";
    for (const p of parts) {
      if (p.text) text += p.text;
    }

    const response = {
      success: true,
      text: text.trim(),
      nextPart: part + 1,
    };

    cache.set(cacheKey, response);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        fallback: true,
      }),
    };
  }
};
