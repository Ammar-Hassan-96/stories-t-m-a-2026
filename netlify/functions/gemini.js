/**
 * 🏆 Gemini AI Backend - Hybrid Proxy
 * ⚡ سريع (< 10s): server يكلم Gemini مباشرة
 * 🐢 بطيء (30-60s): يرجع الـ key للـ client يكلم Gemini مباشرة (مفيش timeout)
 */

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "GEMINI_API_KEY غير موجود في environment variables" })
    };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  // 🐢 طلب الـ key للمهام البطيئة (client-side direct call)
  if (body.action === "get_key") {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ key: GEMINI_KEY })
    };
  }

  // ⚡ المهام السريعة → server يكلم Gemini
  const { model, prompt } = body;
  if (!model || !prompt) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "model و prompt مطلوبين" }) };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.8, maxOutputTokens: 8192 }
      })
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || `HTTP ${res.status}` })
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
        body: JSON.stringify({ error: `رد فاضي من ${model} (${reason})` })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, text: text.trim(), model })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
