// Netlify Function: Gemini AI Proxy (ULTRA OPTIMIZED)

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 🔥 Retry + Anti-Quota
async function fetchWithRetry(url, options, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    const data = await res.json();

    if (res.ok) return data;

    const msg = data.error?.message || "";

    if (msg.includes("Quota") || msg.includes("rate")) {
      console.log("⏳ Quota hit... waiting 60s");
      await sleep(60000);
      continue;
    }

    throw new Error(msg);
  }

  throw new Error("Max retries exceeded");
}

// 🔥 Cache بسيط (يقلل requests)
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

    // 🔥 دمج العمليات لتقليل requests
    if (action === "generate_full_package") {
      finalPrompt = `
أنشئ حزمة كاملة للقصة:

1. قصة طويلة (3000+ كلمة)
2. 3 عناوين جذابة
3. تصنيف واحد مناسب

ارجع بالشكل:
TITLE:
...
TITLES:
...
CATEGORY:
...
STORY:
...

الفكرة: ${prompt}
`;
    } else {

      switch (action) {

        case "suggest_titles":
          finalPrompt = `اقترح 5 عناوين فقط:\n${content}`;
          break;

        case "improve_content":
          finalPrompt = `حسّن النص بدون تقصير:\n${content}`;
          break;

        case "expand_content":
          finalPrompt = `
وسّع النص التالي ليكون 4000+ كلمة.

مهم:
- لا تختصر
- لا تتوقف فجأة

${content}`;
          break;

        case "generate_story":
          finalPrompt = `
اكتب قصة طويلة جدًا (4000+ كلمة)

Part ${part}:

${part === 1 
? "ابدأ القصة من البداية"
: "اكمل القصة بدون إعادة"}

${prompt}

مهم:
- لا تختصر
- استمر حتى النهاية
`;
          break;

        case "fix_grammar":
          finalPrompt = `صحح فقط:\n${content}`;
          break;

        case "suggest_category":
          finalPrompt = `اختار تصنيف واحد:\n${content}`;
          break;

        case "generate_image":
          try {
            // 🔥 cache للصورة
            const cacheKey = "img_" + title;
            if (cache.has(cacheKey)) {
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify(cache.get(cacheKey))
              };
            }

            const promptRes = await fetchWithRetry(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{
                    parts: [{
                      text: `Create short cinematic prompt: ${title}`
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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

    const body = {
      contents: [{ parts: [{ text: finalPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 12000
      }
    };

    const data = await fetchWithRetry(url, {
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

    // 🔥 خزّن النتيجة
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
