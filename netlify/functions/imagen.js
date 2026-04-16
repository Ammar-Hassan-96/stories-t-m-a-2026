/**
 * 🎨 Imagen 3 - Google AI Image Generation
 * بيستخدم نفس GEMINI_API_KEY
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: "GEMINI_API_KEY غير موجود" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  const { prompt } = body;
  if (!prompt) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "prompt مطلوب" }) };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${GEMINI_KEY}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: "16:9",
          safetyFilterLevel: "block_few",
          personGeneration: "allow_adult"
        }
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

    const imageBase64 = data.predictions?.[0]?.bytesBase64Encoded;
    if (!imageBase64) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "مفيش صورة في الرد" }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, imageBase64 })
    };

  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
