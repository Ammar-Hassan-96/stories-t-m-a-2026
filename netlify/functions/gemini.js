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
        finalPrompt = `أعد صياغة القصة التالية بأسلوب أدبي جذاب وممتع، مع الحفاظ على جميع الأحداث والشخصيات والتفاصيل. لا تقصّر القصة أبداً، بل حافظ على طولها الأصلي أو زده. اجعلها أكثر تشويقاً وحيوية بإضافة وصف أدق ومشاعر أعمق. أرجع القصة المُحسَّنة كاملةً فقط:\n\n${content}`;

      case "expand_content":
        finalPrompt = `وسّع القصة التالية لتصبح قصة طويلة ومفصّلة بين 3000 و 5000 كلمة. أضف الكثير من التفاصيل والوصف الدقيق للأماكن والشخصيات والمشاعر والحوارات والمشاهد، مع الحفاظ على الأحداث الأصلية وتطويرها. اجعل القصة غنية بالتفاصيل الحسية والحوارات الداخلية للشخصيات. اكتب بأسلوب أدبي جذاب ومتدفق. أرجع القصة الموسّعة كاملةً فقط، بدون أي مقدمات أو تعليقات:\n\n${content}`;

      case "fix_grammar":
        finalPrompt = `صحّح الأخطاء الإملائية واللغوية في النص التالي مع الحفاظ على الأسلوب واللهجة الأصلية. أرجع النص المُصحَّح فقط بدون أي تعليقات:\n\n${content}`;
        break;

      case "generate_story":
        finalPrompt = `اكتب قصة طويلة ومفصّلة (بين 3000 و 5000 كلمة) بناءً على الفكرة التالية. اجعلها مشوقة ومؤثرة، بأسلوب سردي جذاب مع وصف دقيق للشخصيات والأماكن والأحداث والحوارات. استخدم تقنيات الأدب الحديث من توتر وذروة وحبكة متصاعدة. أرجع القصة كاملةً فقط:\n\nالفكرة: ${prompt}\nالتصنيف المطلوب: ${category || "أي تصنيف مناسب"}`;

      case "suggest_category":
        finalPrompt = `اقرأ القصة التالية وحدد أنسب تصنيف لها من القائمة التالية فقط: drama, horror, kids, sci-fi, thriller, islamic, love. أرجع كلمة واحدة فقط (الـ ID بالإنجليزية) بدون أي شرح:\n\n${content}`;
        break;

      case "generate_image":
        // استخدام Pollinations.ai - مجاني بالكامل
        try {
          // توليد prompt ذكي بـ Gemini الأول (مجاني)
          const promptResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{
                  parts: [{
                    text: `Create a detailed English image generation prompt (max 200 characters) for an illustration of an Arabic story. Story title: "${title}". Story excerpt: ${content.substring(0, 400)}. The prompt should describe the scene, mood, and art style (cinematic, detailed). Return only the prompt, no explanations.`
                  }]
                }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
              })
            }
          );
          const promptData = await promptResponse.json();
          const imagePrompt = promptData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 
            `Beautiful artistic illustration for story "${title}"`;
          
          // جلب الصورة من Pollinations (مجاني)
          const encodedPrompt = encodeURIComponent(imagePrompt);
          const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=768&nologo=true&seed=${Date.now()}`;
          
          const imgRes = await fetch(pollinationsUrl);
          if (!imgRes.ok) throw new Error("فشل توليد الصورة");
          
          const imgBuffer = await imgRes.arrayBuffer();
          const imgBase64 = Buffer.from(imgBuffer).toString('base64');
          
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              text: imagePrompt,
              image: imgBase64
            })
          };
        } catch (err) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "خطأ في توليد الصورة: " + err.message })
          };
        }

      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: "action غير معروف" }) };
    }

    // استدعاء Gemini API
    const model = useImageModel 
      ? "gemini-2.5-flash-image"   // Nano Banana
      : "gemini-2.5-flash";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    const body = {
      contents: [{ parts: [{ text: finalPrompt }] }],
      generationConfig: useImageModel 
        ? { responseModalities: ["IMAGE", "TEXT"] }
        : { temperature: 0.8, maxOutputTokens: 8192 }
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
