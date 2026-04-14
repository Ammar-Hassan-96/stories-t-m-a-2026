// Netlify Function: Gemini AI Proxy (RESILIENT VERSION 🔥)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * 🔥 Smart Fetch with full resilience
 * - Handles high demand
 * - Handles quota
 * - Handles random failures
 */
async function resilientFetch(url, options, retries = 6) {
  let delay = 1500;

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("Invalid JSON response");
      }

      if (res.ok) return data;

      const msg = data?.error?.message || "";

      // 🔥 Retryable errors
      if (
        msg.includes("high demand") ||
        msg.includes("Quota") ||
        msg.includes("rate") ||
        res.status === 429 ||
        res.status >= 500
      ) {
        console.log(`⏳ Retry in ${delay}ms...`);
        await sleep(delay);
        delay *= 2;
        continue;
      }

      throw new Error(msg || "Unknown API error");

    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(delay);
      delay *= 2;
    }
  }

  throw new Error("Max retries reached");
}

// 🔥 Simple in-memory cache (reduces API usage)
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

    // ======================
    // PROMPTS OPTIMIZED
    // ======================
    switch (action) {
      case "generate_story":
        finalPrompt = `
اكتب قصة طويلة (1500-2000 كلمة)

Part ${part}

${part === 1 ? "ابدأ القصة بشكل قوي" : "اكمل بدون إعادة"}

الفكرة:
${prompt}

مهم:
- لا تختصر
- استمر بسلاسة
`;
        break;

      case "expand_content":
        finalPrompt = `وسّع النص إلى قصة مفصلة:\n${content}`;
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

      case "generate_image":
        try {
          const gemini = await resilientFetch(
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
                  maxOutputTokens: 120,
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
            body: JSON.stringify({ error: err.message }),
          };
        }

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Invalid action" }),
        };
    }

    // ======================
    // CACHE CHECK
    // ======================
    const cacheKey = `${action}_${prompt}_${part}`;

    if (cache.has(cacheKey)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(cache.get(cacheKey)),
      };
    }

    // ======================
    // GEMINI CALL
    // ======================
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

    const result = await resilientFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 6000, // 🔥 مهم لتقليل الضغط
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
        error: error.message,
        hint: "System is using resilient mode",
      }),
    };
  }
};
