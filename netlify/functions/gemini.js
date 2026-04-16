/**
 * Gemini AI Backend - Secure Proxy
 * ✅ الـ API key محمي تماماً على السيرفر - لا يُرسَل للـ client أبداً
 * ✅ كل الطلبات تمر من هنا فقط
 * ✅ timeout handling + input validation
 */

const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
]);

const MAX_PROMPT_LENGTH = 20000;

exports.handler = async (event) => {
  const SITE_URL = process.env.URL || process.env.DEPLOY_URL || "";
  const headers = {
    "Access-Control-Allow-Origin": SITE_URL || "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "GEMINI_API_KEY غير مضبوط على السيرفر" }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  // ⛔ مفيش get_key - الـ key لا يخرج من السيرفر أبداً
  if (body.action === "get_key") {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: "غير مسموح" }),
    };
  }

  const { model, prompt } = body;

  // ✅ التحقق من صحة المدخلات
  if (!model || !prompt) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "model و prompt مطلوبين" }) };
  }
  if (!ALLOWED_MODELS.has(model)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "model غير مسموح به" }) };
  }
  if (typeof prompt !== "string" || prompt.length > MAX_PROMPT_LENGTH) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "prompt طويل جداً أو غير صالح" }) };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s timeout

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 8192 },
      }),
    });

    clearTimeout(timeoutId);

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || `HTTP ${res.status}` }),
      };
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    let text = "";
    for (const p of parts) if (p.text) text += p.text;

    if (!text.trim()) {
      const reason = data.candidates?.[0]?.finishReason || "UNKNOWN";
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: `رد فاضي من ${model} (${reason})` }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, text: text.trim(), model }),
    };

  } catch (err) {
    if (err.name === "AbortError") {
      return {
        statusCode: 504,
        headers,
        body: JSON.stringify({ error: "انتهى الوقت المحدد للطلب، حاول مرة أخرى" }),
      };
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
