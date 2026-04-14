// ====== CONFIG ======
const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELS = [
  "gemini-2.5-flash",
  "gemini-1.5-flash"
];

const MAX_RETRIES = 3;
const TIMEOUT_MS = 15000;

// ====== HELPERS ======
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const safeParse = (body) => {
  try { return JSON.parse(body || "{}"); }
  catch { return null; }
};

const validate = ({ action, prompt, content }) => {
  if (!action) return "Missing action";

  const needsContent = [
    "improve_content",
    "expand_content",
    "fix_grammar",
    "suggest_titles",
    "suggest_category"
  ];

  if (needsContent.includes(action) && !content) return "Missing content";
  if (action === "generate_story" && !prompt) return "Missing prompt";

  return null;
};

const buildPrompt = ({ action, prompt, content, title, category }) => {
  switch (action) {
    case "suggest_titles":
      return `اقترح 3 عناوين جذابة قصيرة:\n${content}`;

    case "improve_content":
      return `حسّن النص أدبياً بدون حذف:\n${content}`;

    case "expand_content":
      return `وسّع النص بتفاصيل غنية:\n${content}`;

    case "fix_grammar":
      return `صحّح الأخطاء فقط:\n${content}`;

    case "generate_story":
      return `اكتب قصة احترافية:\nالفكرة: ${prompt}\nالتصنيف: ${category || "general"}`;

    case "suggest_category":
      return `اختار تصنيف واحد:\n${content}`;

    default:
      return null;
  }
};

// ====== GEMINI CALL (Retry + Timeout) ======
const callGeminiWithRetry = async (url, body) => {
  let lastError;

  for (let i = 0; i < MAX_RETRIES; i++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok) {
        const msg = data?.error?.message || "";

        // 🔥 retry لو ضغط عالي
        if (
          msg.includes("high demand") ||
          msg.includes("overloaded")
        ) {
          await sleep(1000 * (i + 1));
          continue;
        }

        throw new Error(msg);
      }

      return data;

    } catch (err) {
      lastError = err;

      if (err.name === "AbortError") {
        console.warn("⏱ Timeout retry...");
      } else {
        console.warn("⚠ Retry:", err.message);
      }

      await sleep(1000 * (i + 1));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
};

// ====== MODEL FALLBACK ======
const generateFromModels = async (API_KEY, body) => {
  let lastError;

  for (const model of MODELS) {
    try {
      console.log("🚀 Trying model:", model);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
      const data = await callGeminiWithRetry(url, body);

      return data;

    } catch (err) {
      console.warn(`❌ Model failed: ${model}`, err.message);
      lastError = err;
    }
  }

  throw lastError;
};

// ====== MAIN HANDLER ======
exports.handler = async (event) => {

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: HEADERS,
      body: JSON.stringify({ error: "Method not allowed" })
    };
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: "API key missing" })
    };
  }

  const bodyData = safeParse(event.body);
  if (!bodyData) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ error: "Invalid JSON" })
    };
  }

  const validationError = validate(bodyData);
  if (validationError) {
    return {
      statusCode: 400,
      headers: HEADERS,
      body: JSON.stringify({ error: validationError })
    };
  }

  const { action, prompt, content, title, category } = bodyData;

  try {

    // ===== IMAGE FLOW =====
    if (action === "generate_image") {
      const promptText = `cinematic illustration: ${title} ${content?.slice(0, 200)}`;

      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(promptText)}?width=1024&height=768&seed=${Date.now()}`;

      const imgRes = await fetch(url);
      if (!imgRes.ok) throw new Error("Image failed");

      const buffer = await imgRes.arrayBuffer();

      return {
        statusCode: 200,
        headers: HEADERS,
        body: JSON.stringify({
          success: true,
          text: promptText,
          image: Buffer.from(buffer).toString("base64")
        })
      };
    }

    // ===== TEXT FLOW =====
    const finalPrompt = buildPrompt({ action, prompt, content, title, category });

    if (!finalPrompt) {
      return {
        statusCode: 400,
        headers: HEADERS,
        body: JSON.stringify({ error: "Invalid action" })
      };
    }

    const requestBody = {
      contents: [{ parts: [{ text: finalPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    };

    const data = await generateFromModels(API_KEY, requestBody);

    const text = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p.text || "")
      .join("")
      .trim();

    return {
      statusCode: 200,
      headers: HEADERS,
      body: JSON.stringify({
        success: true,
        text
      })
    };

  } catch (err) {

    console.error("🔥 FINAL ERROR:", err);

    if (err.message?.includes("high demand")) {
      return {
        statusCode: 503,
        headers: HEADERS,
        body: JSON.stringify({
          error: "السيرفر مشغول حالياً، حاول تاني بعد شوية"
        })
      };
    }

    return {
      statusCode: err.name === "AbortError" ? 504 : 500,
      headers: HEADERS,
      body: JSON.stringify({
        error: err.message || "Internal Server Error"
      })
    };
  }
};
