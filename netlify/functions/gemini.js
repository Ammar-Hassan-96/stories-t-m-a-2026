// Netlify Function: Gemini AI Proxy - Production Ready (Team Leader Edition)
// Architecture: Modular, Fail-safe, Optimized for 10s execution limit, Hyper-realistic Image Gen.

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  // Handle CORS Preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const bodyParams = JSON.parse(event.body);
    const { action, prompt, content, title, category } = bodyParams;
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
      console.error("[Config Error] GEMINI_API_KEY is missing.");
      return { statusCode: 500, headers, body: JSON.stringify({ error: "إعدادات الخادم غير مكتملة (Missing API Key)" }) };
    }

    const MODEL_STRATEGY = {
      suggest_titles: ["gemini-2.5-flash"],
      suggest_category: ["gemini-2.5-flash"],
      fix_grammar: ["gemini-2.5-flash"],
      improve_content: ["gemini-2.5-flash", "gemini-3-flash-preview"],
      expand_content: ["gemini-2.5-flash", "gemini-3-flash-preview"],
      continue_expand: ["gemini-2.5-flash", "gemini-3-flash-preview"],
      generate_story: ["gemini-2.5-flash", "gemini-3-flash-preview"],
    };

    let finalPrompt = "";

    switch (action) {
      case "suggest_titles":
        finalPrompt = `اقرأ القصة التالية واقترح 3 عناوين جذابة وقصيرة (كل عنوان لا يزيد عن 7 كلمات) مناسبة لها. أرجع الـ 3 عناوين فقط، كل واحد في سطر منفصل، بدون أي ترقيم، أو رموز، أو شرح إضافي.\n\nالقصة:\n${content}`;
        break;
      case "improve_content":
        finalPrompt = `أعد صياغة القصة التالية بأسلوب أدبي جذاب واحترافي، مع الحفاظ على جميع الأحداث والشخصيات. اجعلها أكثر تشويقاً وتماسكاً. أرجع النص المُحسَّن فقط بدون أي مقدمات:\n\n${content}`;
        break;
      case "expand_content":
        finalPrompt = `وسّع القصة التالية لتصبح تفصيلية وعميقة. أضف تفاصيل دقيقة، وصفاً مكانياً وحسياً، ومشاهد وحوارات تخدم الحبكة، مع الحفاظ على المسار الأصلي للأحداث. أرجع القصة الموسّعة فقط:\n\n${content}`;
        break;
      case "continue_expand":
        finalPrompt = `أكمل القصة التالية بإضافة مشاهد فرعية جديدة، تطورات مفاجئة، وحوارات تزيد من التشويق. حافظ على نفس النبرة والأسلوب. أرجع القصة كاملة (الجزء الأصلي + التكملة) كنص واحد متصل:\n\n${content}`;
        break;
      case "fix_grammar":
        finalPrompt = `أنت مدقق لغوي محترف. صحّح كافة الأخطاء الإملائية والنحوية وعلامات الترقيم في النص التالي مع الحفاظ على روح الأسلوب الأصلي. أرجع النص المُصحَّح فقط بدون أي تعليقات:\n\n${content}`;
        break;
      case "generate_story":
        finalPrompt = `اكتب قصة احترافية، مشوقة، ومفصّلة بناءً على الفكرة التالية. استخدم أسلوباً سردياً يشد الانتباه مع بناء جيد للشخصيات. أرجع نص القصة فقط:\n\nالفكرة: ${prompt}\nالتصنيف: ${category || "تصنيف عام"}`;
        break;
      case "suggest_category":
        finalPrompt = `اقرأ القصة التالية وحدد أنسب تصنيف لها من هذه القائمة فقط: (drama, horror, kids, sci-fi, thriller, islamic, love). أرجع الكلمة الإنجليزية المعبرة عن التصنيف فقط، بدون أي إضافات:\n\n${content}`;
        break;
      case "generate_image":
        return await handleImageGeneration(API_KEY, title, content, category, headers);
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: "الإجراء (action) المطلوب غير معروف." }) };
    }

    const modelsToTry = MODEL_STRATEGY[action] || ["gemini-2.5-flash"];
    let lastError = null;

    for (const model of modelsToTry) {
      // 8 seconds timeout for text generation to stay within Netlify limits
      const result = await callGemini(API_KEY, model, finalPrompt, 8000, 4000); 
      
      if (result.success) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, text: result.text, image: null, model })
        };
      }
      
      lastError = result.error;
      console.warn(`[Model Fallback] ${model} failed:`, result.error);
      
      if (!isRetryableError(result.error)) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: result.error }) };
      }
    }

    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: "فشلت جميع المحاولات للاتصال بنماذج الذكاء الاصطناعي. السبب الأخير: " + (lastError || "") })
    };

  } catch (error) {
    console.error("[Main Handler Error]:", error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || "حدث خطأ غير متوقع في الخادم." }) };
  }
};

// --- Helper Functions ---

function isRetryableError(errorMsg) {
  if (!errorMsg) return false;
  const msg = errorMsg.toLowerCase();
  return msg.includes("quota") || msg.includes("rate limit") || 
         msg.includes("exhausted") || msg.includes("429") ||
         msg.includes("exceeded") || msg.includes("not found") ||
         msg.includes("not supported") || msg.includes("404") ||
         msg.includes("not available") || msg.includes("deprecated") ||
         msg.includes("timeout") || msg.includes("aborted") || msg.includes("fetch");
}

async function callGemini(apiKey, model, prompt, timeoutMs = 8000, maxTokens = 4000) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: maxTokens }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    let data;
    try { 
      data = await response.json(); 
    } catch { 
      return { success: false, error: `فشل تحليل استجابة JSON من النموذج ${model}` }; 
    }

    if (!response.ok) {
      return { success: false, error: data.error?.message || `HTTP Error: ${response.status}` };
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    let textResult = "";
    for (const part of parts) {
      if (part.text) textResult += part.text;
    }

    if (!textResult.trim()) {
      const finishReason = data.candidates?.[0]?.finishReason || "UNKNOWN";
      return { success: false, error: `الرد من ${model} كان فارغاً. سبب الإنهاء: ${finishReason}` };
    }

    return { success: true, text: textResult.trim() };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, error: `Timeout: استغرق ${model} أكثر من ${timeoutMs / 1000} ثوانٍ.` };
    }
    return { success: false, error: err.message };
  }
}

// 🎨 توليد صور ذكي وموجه للحصول على واقعية مطلقة (Hyper-Realistic)
async function handleImageGeneration(apiKey, title, content, category, headers) {
  try {
    const categoryMap = {
      horror: "dark horror, terrifying, eerie atmosphere, shadows, cinematic lighting, photorealistic",
      drama: "emotional, highly detailed, dramatic lighting, cinematic storytelling, sharp focus",
      kids: "vibrant colors, 3D Pixar style, high quality render, cheerful, highly detailed",
      "sci-fi": "futuristic, cyberpunk, epic scale, unreal engine 5 render, hyper-realistic, 8k resolution",
      thriller: "suspenseful, mysterious, high contrast noir, cinematic mood, ultra detailed",
      islamic: "majestic islamic architecture, beautiful soft lighting, highly detailed, serene",
      love: "romantic, warm golden hour lighting, cinematic, soft focus, highly emotional"
    };
    const styleHint = categoryMap[category] || "hyper-realistic, highly detailed, photorealistic, cinematic lighting, 8k resolution";

    // الخطوة 1: توليد Prompt احترافي (العمل كمخرج فني) - سرعة عالية
    const translationPrompt = `Act as an expert Art Director. Read this Arabic story and write a highly detailed, hyper-realistic English image generation prompt (max 40 words) that visualizes the MAIN scene.
Requirements:
- Emphasize hyper-realism, photorealistic details, and cinematic lighting.
- Mood/Style keywords: ${styleHint}
- STRICTLY NO text, NO words, NO typography in the image.
- Focus on what is physically visible.
Story: ${content.substring(0, 800)}
Return ONLY the English prompt. No introductions.`;

    // استخدام مهلة قصيرة (2.5 ثانية) وعدد توكنز قليل لضمان السرعة الفائقة
    const promptGenResult = await callGemini(apiKey, "gemini-2.5-flash", translationPrompt, 2500, 150);

    let imagePrompt;
    if (promptGenResult.success && promptGenResult.text.length > 15) {
      imagePrompt = promptGenResult.text.replace(/^["']|["']$/g, '').replace(/\n/g, ' ').trim();
    } else {
      imagePrompt = `A hyper-realistic cinematic scene representing: ${title}. ${styleHint}. Masterpiece, 8k, highly detailed, no text.`;
    }

    console.log("[Image Gen] Flux Prompt:", imagePrompt);

    // الخطوة 2: استدعاء Flux عبر Pollinations بمهلة 6.5 ثانية
    // توليد Seed عشوائي ذكي لضمان تنوع الصور إذا تم طلبها لنفس القصة لاحقاً
    const seed = Math.floor(Math.random() * 1000000); 
    const encodedPrompt = encodeURIComponent(imagePrompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=768&nologo=true&seed=${seed}&model=flux&enhance=false`; // enhance=false لأننا كتبنا Prompt احترافي بالفعل

    const imgController = new AbortController();
    const imgTimeout = setTimeout(() => imgController.abort(), 6500);

    try {
      const imgRes = await fetch(pollinationsUrl, { signal: imgController.signal });
      clearTimeout(imgTimeout);
      
      if (!imgRes.ok) throw new Error(`Pollinations API Error: HTTP ${imgRes.status}`);

      const imgBuffer = await imgRes.arrayBuffer();
      const imgBase64 = Buffer.from(imgBuffer).toString('base64');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          text: imagePrompt,
          image: imgBase64,
          model: "pollinations/flux (Hyper-Realistic Configuration)"
        })
      };
    } catch (imgErr) {
      clearTimeout(imgTimeout);
      console.error("[Image Fetch Error]:", imgErr);
      throw new Error(imgErr.name === 'AbortError' ? "Timeout: فشل جلب الصورة خلال الوقت المسموح." : imgErr.message);
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "خطأ في معالجة وتوليد الصورة: " + err.message }) };
  }
}
