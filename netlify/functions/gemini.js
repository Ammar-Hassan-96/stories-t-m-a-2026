// Netlify Function: Gemini AI Proxy (Fixed & Stable)

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
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  try {
    // ✅ Safe JSON parse
    let bodyData;
    try {
      bodyData = JSON.parse(event.body || "{}");
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Invalid JSON" }),
      };
    }

    const { action, prompt, content, title, category } = bodyData;

    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: "GEMINI_API_KEY غير مُعدّ في Netlify" }),
      };
    }

    // ✅ بناء الـ prompt
    let finalPrompt = "";

    switch (action) {
      case "suggest_titles":
        finalPrompt = `اقرأ القصة التالية واقترح 3 عناوين جذابة وقصيرة (كل عنوان لا يزيد عن 7 كلمات). أرجع العناوين فقط:\n\n${content}`;
        break;

      case "improve_content":
        finalPrompt = `أعد صياغة القصة بأسلوب أدبي جذاب مع الحفاظ على التفاصيل:\n\n${content}`;
        break; // 🔥 FIX

      case "expand_content":
        finalPrompt = `وسّع القصة بتفاصيل غنية:\n\n${content}`;
        break; // 🔥 FIX

      case "fix_grammar":
        finalPrompt = `صحّح الأخطاء فقط:\n\n${content}`;
        break;

      case "generate_story":
        finalPrompt = `اكتب قصة احترافية:\n\nالفكرة: ${prompt}\nالتصنيف: ${category || "عام"}`;
        break; // 🔥 FIX

      case "suggest_category":
        finalPrompt = `حدد تصنيف واحد فقط:\n\n${content}`;
        break;

      case "generate_image":
        try {
          // 🧠 Gemini prompt
          const promptRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: `Create image prompt: "${title}" ${String(content).slice(0, 300)}`
                  }]
                }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 100 }
              })
            }
          );

          const contentType = promptRes.headers.get("content-type") || "";
          if (!contentType.includes("application/json")) {
            throw new Error("Gemini returned non-JSON");
          }

          const promptData = await promptRes.json();

          const imagePrompt =
            promptData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
            `Artistic illustration for "${title}"`;

          // 🎨 Pollinations image
          const imgRes = await fetch(
            `https://image.pollinations.ai/prompt/${encodeURIComponent(imagePrompt)}?width=1024&height=768&seed=${Date.now()}`
          );

          const imgType = imgRes.headers.get("content-type") || "";
          if (!imgType.includes("image")) {
            throw new Error("Image API failed");
          }

          const buffer = await imgRes.arrayBuffer();

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              text: imagePrompt,
              image: Buffer.from(buffer).toString("base64"),
            }),
          };
        } catch (err) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "خطأ في الصورة: " + err.message }),
          };
        }

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "action غير معروف" }),
        };
    }

    // 🚀 Gemini request
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: finalPrompt }] }],
          generationConfig: {
            temperature: 0.8,
            maxOutputTokens: 4096, // 🔥 أخف وأسرع
          },
        }),
      }
    );

    // ✅ تحقق من نوع الرد
    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("application/json")) {
      const text = await response.text();
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Invalid response from Gemini",
          debug: text.slice(0, 200),
        }),
      };
    }

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: data?.error?.message || "Gemini error",
        }),
      };
    }

    // ✅ استخراج النتيجة
    const parts = data?.candidates?.[0]?.content?.parts || [];

    let textResult = "";
    let imageBase64 = null;

    for (const part of parts) {
      if (part.text) textResult += part.text;
      if (part.inlineData?.data) imageBase64 = part.inlineData.data;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        text: textResult.trim(),
        image: imageBase64,
      }),
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message || "Internal Server Error",
      }),
    };
  }
};
