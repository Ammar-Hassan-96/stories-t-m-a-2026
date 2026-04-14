// Netlify Function: Gemini AI Proxy (ULTIMATE VERSION)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 🔥 Smart Retry (Quota + High Demand)
async function fetchWithSmartRetry(url, options, retries = 5) {
  let delay = 2000;

  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    const data = await res.json();

    if (res.ok) return data;

    const msg = data.error?.message || "";

    // Quota أو ضغط
    if (msg.includes("Quota") || msg.includes("rate") || msg.includes("high demand")) {
      console.log(`⏳ Retry بعد ${delay / 1000}s`);
      await sleep(delay);
      delay *= 2;
      continue;
    }

    throw new Error(msg);
  }

  throw new Error("فشل بعد عدة محاولات");
}

// 🔥 Cache لتقليل الاستهلاك
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
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { action, prompt, content, title, category, part = 1 } = JSON.parse(event.body);
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "API KEY missing" }) };
    }

    let finalPrompt = "";

    // 🔥 دمج لتقليل requests
    if (action === "generate_full_package") {
      finalPrompt = `
أنشئ حزمة كاملة:

1. قصة (2000 كلمة)
2. 3 عناوين
3. تصنيف

الفكرة: ${prompt}
`;
    } else {

      switch (action) {

        case "generate_story":
          finalPrompt = `
اكتب قصة احترافية (1500 - 2000 كلمة)

Part ${part}

${part === 1 
? "ابدأ من البداية"
: "اكمل بدون إعادة"}

${prompt}

مهم:
- لا تختصر
- نهاية مفتوحة لو مش آخر جزء
`;
          break;

        case "expand_content":
          finalPrompt = `
وسع النص إلى 2000 كلمة بدون اختصار:

${content}`;
          break;

        case "improve_content":
          finalPrompt = `حسّن النص:\n${content}`;
          break;

        case "suggest_titles":
          finalPrompt = `اقترح 5 عناوين:\n${content}`;
          break;

        case "suggest_category":
          finalPrompt = `اختار تصنيف:\n${content}`;
          break;

        case "fix_grammar":
          finalPrompt = `صحح فقط:\n${content}`;
          break;

        case "generate_image":
          try {
            const cacheKey = "img_" + title;

            if (cache.has(cacheKey)) {
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify(cache.get(cacheKey))
              };
            }

            const promptRes = await fetchWithSmartRetry(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{
                    parts: [{
                      text: `cinematic image prompt for ${title}`
                    }]
                  }],
                  generationConfig: { maxOutputTokens: 100 }
                })
              }
            );

            const imgPrompt = promptRes.candidates?.[0]?.content?.parts?.[0]?.text || title;

            const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imgPrompt)}?seed=${Date.now()}`;

            const imgRes = await fetch(imgUrl);
            const buffer = await imgRes.arrayBuffer();

            const result = {
              success: true,
              image: Buffer.from(buffer).toString("base64"),
              text: imgPrompt
            };

            cache.set(cacheKey, result);

            return {
              statusCode: 200,
              headers,
              body: JSON.stringify(result)
            };

          } catch (err) {
            throw new Error("Image error: " + err.message);
          }

        default:
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid action" }) };
      }
    }

    // 🔥 Cache للنصوص
    const cacheKey = `${action}_${prompt}_${part}`;
    if (cache.has(cacheKey)) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(cache.get(cacheKey))
      };
    }

    // 🔥 اختيار موديل حسب الحمل
    const model = "gemini-2.5-flash";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    const body = {
      contents: [{ parts: [{ text: finalPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8000 // 👈 تقليل الضغط
      }
    };

    const data = await fetchWithSmartRetry(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    let textResult = "";
    const partsArr = data.candidates?.[0]?.content?.parts || [];

    partsArr.forEach(p => {
      if (p.text) textResult += p.text;
    });

    const result = {
      success: true,
      text: textResult.trim(),
      nextPart: part + 1
    };

    cache.set(cacheKey, result);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
