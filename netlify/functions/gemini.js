// Netlify Function: Gemini AI Proxy (ZERO CRASH VERSION 🔥)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===============================
// SMART FETCH (NO FAIL SYSTEM)
// ===============================
async function safeFetch(url, options, retries = 5) {
  let delay = 1500;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();

      // 🔥 Detect HTML response
      if (text.trim().startsWith("<")) {
        console.log("⚠️ HTML RESPONSE DETECTED");
        throw new Error("HTML response received instead of JSON");
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        console.log("RAW:", text);
        throw new Error("Invalid JSON response");
      }

      if (res.ok) return data;

      const msg = data?.error?.message || "";

      // 🔁 Retryable errors
      if (
        msg.includes("high demand") ||
        msg.includes("Quota") ||
        msg.includes("rate") ||
        res.status === 429 ||
        res.status >= 500
      ) {
        console.log(`⏳ Retry in ${delay}ms`);
        await sleep(delay);
        delay *= 2;
        continue;
      }

      throw new Error(msg || "API Error");

    } catch (err) {
      console.log(`❌ Attempt ${i + 1} failed:`, err.message);

      if (i === retries - 1) {
        throw err;
      }

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

    // =========================
    // PROMPTS
    // =========================
    switch (action) {
      case "generate_story":
        finalPrompt = `
اكتب قصة طويلة (1500-2000 كلمة)

Part ${part}

${part === 1 ? "ابدأ القصة بقوة" : "اكمل بدون إعادة"}

الفكرة:
${prompt}

مهم:
- لا تختصر
- استمر حتى النهاية
`;
        break;

      case "expand_content":
        finalPrompt = `وسع النص:\n${content}`;
        break;

      case "improve_content":
        finalPrompt = `حسّن النص:\n${content}`;
        break;

      case "suggest_titles":
        finalPrompt = `3 عناوين فقط:\n${content}`;
        break;

      case "suggest_category":
        finalPrompt = `اختار تصنيف واحد:\n${content}`;
        break;

      case "fix_grammar":
        finalPrompt = `صحح فقط:\n${content}`;
        break;

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
                        text: `Cinematic image prompt for: ${title}`,
                      },
                    ],
                  },
                ],
                generationConfig: {
                  maxOutputTokens: 100,
                  temperature: 0.7,
                },
              }),
            }
          );

          const imagePrompt =
            gemini?.candidates?.[0]?.content?.parts?.[0]?.text || title;

          const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
            imagePrompt
          )}?seed=${Date.now()}`;

          const imgRes = await fetch(imgUrl);
          const buffer = await imgRes.arrayBuffer();

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              image: Buffer.from(buffer).toString("base64"),
              text: imagePrompt,
            }),
          };
        } catch (err) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              error: "Image failed: " + err.message,
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

    // =========================
    // CACHE CHECK
    // =========================
    const cacheKey = `${action}_${prompt}_${part}`;

    if (cache.has(cacheKey)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(cache.get(cacheKey)),
      };
    }

    // =========================
    // GEMINI CALL
    // =========================
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
    console.log("🔥 FINAL ERROR:", error.message);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        fallback: true,
        message: "System is in safe mode - retrying recommended",
      }),
    };
  }
};
