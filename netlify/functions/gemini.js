// Netlify Function: Gemini AI Proxy (FIXED + STABLE)

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
    const { action, prompt, content, title, category } = JSON.parse(event.body);
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "API KEY missing" })
      };
    }

    let finalPrompt = "";

    // =========================
    // PROMPTS
    // =========================

    switch (action) {

      case "suggest_titles":
        finalPrompt = `اقترح 3 عناوين فقط:\n${content}`;
        break;

      case "improve_content":
        finalPrompt = `حسّن النص بدون اختصار:\n${content}`;
        break;

      case "expand_content":
        finalPrompt = `وسّع القصة إلى 3000 كلمة بدون اختصار:\n${content}`;
        break;

      case "generate_story":
        finalPrompt = `اكتب قصة طويلة جدًا (3000+ كلمة)

الفكرة:
${prompt}

التصنيف:
${category || "general"}

مهم:
- لا تختصر
- استمر حتى النهاية`;
        break;

      case "fix_grammar":
        finalPrompt = `صحح النص فقط:\n${content}`;
        break;

      case "suggest_category":
        finalPrompt = `اختار تصنيف واحد فقط:\n${content}`;
        break;

      case "generate_image":
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: `Create cinematic image prompt for: ${title}`
                  }]
                }],
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 100
                }
              })
            }
          );

          const geminiText = await geminiRes.text();
          let geminiData;

          try {
            geminiData = JSON.parse(geminiText);
          } catch {
            throw new Error("Invalid Gemini response");
          }

          const imagePrompt =
            geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || title;

          const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?seed=${Date.now()}`;

          const imgRes = await fetch(imgUrl);
          const buffer = await imgRes.arrayBuffer();

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              text: imagePrompt,
              image: Buffer.from(buffer).toString("base64")
            })
          };

        } catch (err) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Image error: " + err.message })
          };
        }

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Invalid action" })
        };
    }

    // =========================
    // GEMINI CALL (SAFE)
    // =========================

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: finalPrompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8000
        }
      })
    });

    const rawText = await response.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Invalid JSON from Gemini",
          raw: rawText
        })
      };
    }

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: data.error?.message || "Gemini error"
        })
      };
    }

    let textResult = "";

    const parts = data?.candidates?.[0]?.content?.parts || [];

    parts.forEach(p => {
      if (p.text) textResult += p.text;
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        text: textResult.trim()
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message || "Unknown error"
      })
    };
  }
};
