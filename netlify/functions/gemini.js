// Netlify Function: Gemini AI Proxy (PRO VERSION)

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
      return { statusCode: 500, headers, body: JSON.stringify({ error: "GEMINI_API_KEY غير مُعدّ" }) };
    }

    let finalPrompt = "";
    let useImageModel = false;

    switch (action) {

      case "suggest_titles":
        finalPrompt = `اقرأ القصة التالية واقترح 5 عناوين جذابة وقصيرة (كل عنوان لا يزيد عن 10 كلمات). أرجع فقط العناوين بدون شرح:\n\n${content}`;
        break;

      case "improve_content":
        finalPrompt = `أعد كتابة القصة التالية بأسلوب أدبي أقوى وأكثر تشويقًا، بدون تقصير، بل مع إضافة وصف ومشاعر أعمق:\n\n${content}`;
        break;

      case "expand_content":
        finalPrompt = `وسّع القصة التالية لتصبح قصة طويلة جداً (4000+ كلمة).

مهم جداً:
- لا تختصر
- لا تتوقف فجأة
- لو لم تكمل، استمر وكأنك ستكمل في جزء آخر

أضف:
- حوارات كثيرة
- وصف تفصيلي
- مشاعر داخلية

${content}`;
        break;

      case "generate_story":
        finalPrompt = `اكتب قصة احترافية طويلة جداً (4000+ كلمة)

Part ${part}:

${part === 1 
? `ابدأ القصة من البداية مع تقديم قوي وشخصيات واضحة وتصاعد درامي.`
: `اكمل القصة من حيث انتهى الجزء السابق بدون إعادة.`}

الفكرة: ${prompt}
التصنيف: ${category || "general"}

مهم:
- لا تختصر
- اكتب بتفصيل عالي
- اجعل النهاية مفتوحة لو هذا ليس الجزء الأخير
`;
        break;

      case "fix_grammar":
        finalPrompt = `صحح الأخطاء فقط بدون تغيير الأسلوب:\n\n${content}`;
        break;

      case "suggest_category":
        finalPrompt = `حدد تصنيف واحد فقط من: drama, horror, kids, sci-fi, thriller, islamic, love\n\n${content}`;
        break;

      case "generate_image":
        try {
          const promptResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: `Create short cinematic image prompt for: "${title}" based on: ${content.substring(0, 300)}`
                  }]
                }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
              })
            }
          );

          const promptData = await promptResponse.json();
          const imagePrompt = promptData.candidates?.[0]?.content?.parts?.[0]?.text || title;

          const encodedPrompt = encodeURIComponent(imagePrompt);
          const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=768&seed=${Date.now()}`;

          const imgRes = await fetch(url);
          const buffer = await imgRes.arrayBuffer();

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              image: Buffer.from(buffer).toString("base64"),
              text: imagePrompt
            })
          };

        } catch (err) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: err.message })
          };
        }

      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: "action غير معروف" }) };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;

    const body = {
      contents: [{ parts: [{ text: finalPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 16000
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Gemini Error");
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    let textResult = "";

    parts.forEach(p => {
      if (p.text) textResult += p.text;
    });

    // 🔥 fallback لو الرد قصير
    if (textResult.length < 500 && action.includes("story")) {
      textResult += "\n\n(ملحوظة: يمكن طلب الجزء التالي لإكمال القصة)";
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        text: textResult.trim(),
        nextPart: part + 1
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
