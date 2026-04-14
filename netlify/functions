// Netlify Function: Gemini AI Proxy
// يخفي الـ API Key ويتعامل مع Gemini بأمان

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
      return { statusCode: 500, headers, body: JSON.stringify({ error: "GEMINI_API_KEY غير مُعدّ في Netlify" }) };
    }

    // بناء الـ prompt حسب الـ action
    let finalPrompt = "";
    let useImageModel = false;

    switch (action) {
      case "suggest_titles":
        finalPrompt = `اقرأ القصة التالية واقترح 3 عناوين جذابة وقصيرة (كل عنوان لا يزيد عن 7 كلمات) مناسبة لها. أرجع الـ 3 عناوين فقط، كل واحد في سطر منفصل، بدون ترقيم أو رموز أو شرح.\n\nالقصة:\n${content}`;
        break;

      case "improve_content":
        finalPrompt = `أعد صياغة القصة التالية بأسلوب أدبي جذاب وممتع، مع الحفاظ على الأحداث الأساسية والشخصيات. اجعلها أكثر تشويقاً وحيوية. أرجع القصة المُحسَّنة فقط بدون أي تعليقات أو شرح:\n\n${content}`;
        break;

      case "expand_content":
        finalPrompt = `وسّع القصة التالية بإضافة تفاصيل ومشاهد ووصف أكثر، مع الحفاظ على الأحداث الأصلية. اجعلها أطول بحوالي 50% مع تحسين الجودة. أرجع القصة الموسّعة فقط:\n\n${content}`;
        break;

      case "fix_grammar":
        finalPrompt = `صحّح الأخطاء الإملائية واللغوية في النص التالي مع الحفاظ على الأسلوب واللهجة الأصلية. أرجع النص المُصحَّح فقط بدون أي تعليقات:\n\n${content}`;
        break;

      case "generate_story":
        finalPrompt = `اكتب قصة قصيرة كاملة (حوالي 300-500 كلمة) بناءً على الفكرة التالية. اجعلها مشوقة ومؤثرة، بأسلوب سردي جذاب. أرجع القصة فقط:\n\nالفكرة: ${prompt}\nالتصنيف المطلوب: ${category || "أي تصنيف مناسب"}`;
        break;

      case "suggest_category":
        finalPrompt = `اقرأ القصة التالية وحدد أنسب تصنيف لها من القائمة التالية فقط: drama, horror, kids, sci-fi, thriller, islamic, love. أرجع كلمة واحدة فقط (الـ ID بالإنجليزية) بدون أي شرح:\n\n${content}`;
        break;

      case "generate_image":
        useImageModel = true;
        finalPrompt = `Create a beautiful, artistic, high-quality illustration for an Arabic story. Story title: "${title}". Story excerpt: ${content.substring(0, 500)}. Style: cinematic, detailed, atmospheric, suitable as a story cover image. No text in the image.`;
        break;

      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: "action غير معروف" }) };
    }

    // استدعاء Gemini API
    const model = useImageModel 
      ? "gemini-2.5-flash-image-preview"   // Nano Banana
      : "gemini-2.0-flash-exp";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    const body = {
      contents: [{ parts: [{ text: finalPrompt }] }],
      generationConfig: useImageModel 
        ? { responseModalities: ["IMAGE", "TEXT"] }
        : { temperature: 0.8, maxOutputTokens: 2048 }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
      return { statusCode: response.status, headers, body: JSON.stringify({ error: data.error?.message || "خطأ من Gemini" }) };
    }

    // معالجة الرد
    const parts = data.candidates?.[0]?.content?.parts || [];
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
        image: imageBase64
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
