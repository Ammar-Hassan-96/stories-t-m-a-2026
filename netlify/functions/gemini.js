// Netlify Function: Gemini AI Proxy (Production Ready)

const DEFAULT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const safeJsonParse = (str) => {
  try {
    return JSON.parse(str || "{}");
  } catch {
    return null;
  }
};

const validateInput = ({ action, prompt, content }) => {
  if (!action) return "Missing action";
  if (
    ["improve_content", "expand_content", "fix_grammar", "suggest_titles", "suggest_category"].includes(action) &&
    !content
  ) {
    return "Missing content";
  }
  if (action === "generate_story" && !prompt) {
    return "Missing prompt";
  }
  return null;
};

const buildPrompt = ({ action, prompt, content, title, category }) => {
  switch (action) {
    case "suggest_titles":
      return `اقرأ القصة التالية واقترح 3 عناوين جذابة وقصيرة (كل عنوان لا يزيد عن 7 كلمات). أرجع العناوين فقط:\n\n${content}`;

    case "improve_content":
      return `أعد صياغة القصة بأسلوب أدبي جذاب مع الحفاظ على التفاصيل:\n\n${content}`;

    case "expand_content":
      return `وسّع القصة لتصبح بين 3000 و 5000 كلمة مع تفاصيل غنية:\n\n${content}`;

    case "fix_grammar":
      return `صحّح الأخطاء اللغوية فقط:\n\n${content}`;

    case "generate_story":
      return `اكتب قصة احترافية طويلة (3000-5000 كلمة):\n\nالفكرة: ${prompt}\nالتصنيف: ${category || "general"}`;

    case "suggest_category":
      return `حدد تصنيف القصة (drama, horror, kids, sci-fi, thriller, islamic, love):\n\n${content}`;

    default:
      return null;
  }
};

const callGemini = async (url, body) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error?.message || "Gemini API error");
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: DEFAULT_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return {
      statusCode: 500,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: "API key missing" }),
    };
  }

  const bodyData = safeJsonParse(event.body);
  if (!bodyData) {
    return {
      statusCode: 400,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const validationError = validateInput(bodyData);
  if (validationError) {
    return {
      statusCode: 400,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({ error: validationError }),
    };
  }

  const { action, prompt, content, title, category } = bodyData;

  try {
    // 🔥 Image generation (special flow)
    if (action === "generate_image") {
      const promptText = `Create cinematic illustration prompt: "${title}" ${content?.slice(0, 300)}`;

      const encoded = encodeURIComponent(promptText);
      const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=768&seed=${Date.now()}`;

      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) throw new Error("Image fetch failed");

      const buffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");

      return {
        statusCode: 200,
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({
          success: true,
          text: promptText,
          image: base64,
        }),
      };
    }

    const finalPrompt = buildPrompt({ action, prompt, content, title, category });

    if (!finalPrompt) {
      return {
        statusCode: 400,
        headers: DEFAULT_HEADERS,
        body: JSON.stringify({ error: "Invalid action" }),
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

    const data = await callGemini(url, {
      contents: [{ parts: [{ text: finalPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });

    const parts = data?.candidates?.[0]?.content?.parts || [];

    const text = parts
      .map((p) => p.text || "")
      .join("")
      .trim();

    return {
      statusCode: 200,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        success: true,
        text,
      }),
    };
  } catch (err) {
    console.error("🔥 Function Error:", err);

    return {
      statusCode: err.name === "AbortError" ? 504 : 500,
      headers: DEFAULT_HEADERS,
      body: JSON.stringify({
        error:
          err.name === "AbortError"
            ? "Request timeout"
            : err.message || "Internal Server Error",
      }),
    };
  }
};
