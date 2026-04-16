/**
 * Gemini AI Backend - Secure Proxy
 * ✅ المهام السريعة (< 25s): تتنفذ على السيرفر — الـ key مخفي تماماً
 * ✅ المهام البطيئة (تطويل القصة): الـ key يتبعت للـ client بعد التحقق من Supabase JWT
 * ✅ model whitelist + input validation + timeout
 */

const ALLOWED_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
]);

// المهام البطيئة اللي بتاخد أكثر من 25s — تتنفذ client-side
const SLOW_ACTIONS = new Set(["expand_content", "continue_expand", "generate_story"]);

const MAX_PROMPT_LENGTH = 20000;

// ✅ التحقق من Supabase JWT — بيأكد إن المستخدم logged in فعلاً
async function verifySupabaseToken(authHeader) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7);
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "apikey": SUPABASE_ANON_KEY,
      },
    });
    return res.ok;
  } catch {
    return false;
  }
}

exports.handler = async (event) => {
  const SITE_URL = process.env.URL || process.env.DEPLOY_URL || "";
  const headers = {
    "Access-Control-Allow-Origin": SITE_URL || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

  // ✅ get_key للمهام البطيئة — بس بعد التحقق من الـ JWT
  if (body.action === "get_key") {
    const isValid = await verifySupabaseToken(event.headers["authorization"]);
    if (!isValid) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: "غير مصرح — يجب تسجيل الدخول أولاً" }),
      };
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ key: GEMINI_KEY }),
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
