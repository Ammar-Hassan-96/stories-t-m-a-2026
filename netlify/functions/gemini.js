// Netlify Function: Gemini AI Proxy - النسخة النهائية
// ✅ تجنب Netlify 10s timeout
// ✅ توليد صور ذكي مرتبط بمحتوى القصة
// ✅ Fallback ذكي

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { action, prompt, content, title, category } = JSON.parse(event.body);
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "GEMINI_API_KEY غير مُعدّ في Netlify" }) };
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
        finalPrompt = `اقرأ القصة التالية واقترح 3 عناوين جذابة وقصيرة (كل عنوان لا يزيد عن 7 كلمات) مناسبة لها. أرجع الـ 3 عناوين فقط، كل واحد في سطر منفصل، بدون ترقيم أو رموز أو شرح.\n\nالقصة:\n${content}`;
        break;
      case "improve_content":
        finalPrompt = `أعد صياغة القصة التالية بأسلوب أدبي جذاب، مع الحفاظ على جميع الأحداث والشخصيات. لا تقصّر القصة. اجعلها أكثر تشويقاً. أرجع القصة المُحسَّنة فقط:\n\n${content}`;
        break;
      case "expand_content":
        finalPrompt = `وسّع القصة التالية لتصبح طويلة ومفصّلة (3000-4000 كلمة). أضف تفاصيل ووصف ومشاهد وحوارات، مع الحفاظ على الأحداث الأصلية. أرجع القصة الموسّعة فقط:\n\n${content}`;
        break;
      case "continue_expand":
        finalPrompt = `أكمل توسيع القصة التالية بإضافة 2000-3000 كلمة جديدة. أضف مشاهد فرعية، حوارات، ووصف حسي. حافظ على نفس الأسلوب. أرجع القصة كاملة (الأصل + الإضافات):\n\n${content}`;
        break;
      case "fix_grammar":
        finalPrompt = `صحّح الأخطاء الإملائية واللغوية في النص مع الحفاظ على الأسلوب. أرجع النص المُصحَّح فقط:\n\n${content}`;
        break;
      case "generate_story":
        finalPrompt = `اكتب قصة طويلة ومفصّلة (3000-4000 كلمة) بناءً على الفكرة التالية. اجعلها مشوقة بأسلوب سردي جذاب. أرجع القصة فقط:\n\nالفكرة: ${prompt}\nالتصنيف: ${category || "أي تصنيف مناسب"}`;
        break;
      case "suggest_category":
        finalPrompt = `اقرأ القصة وحدد أنسب تصنيف من: drama, horror, kids, sci-fi, thriller, islamic, love. أرجع كلمة واحدة فقط:\n\n${content}`;
        break;
      case "generate_image":
        return await handleImageGeneration(API_KEY, title, content, category, headers);
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: "action غير معروف" }) };
    }

    const modelsToTry = MODEL_STRATEGY[action] || ["gemini-2.5-flash"];
    let lastError = null;

    for (const model of modelsToTry) {
      const result = await callGemini(API_KEY, model, finalPrompt);
      if (result.success) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, text: result.text, image: null, model })
        };
      }
      lastError = result.error;
      if (!isRetryableError(result.error)) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: result.error }) };
      }
    }

    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: "فشلت كل الموديلات. " + (lastError || "") })
    };

  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};

function isRetryableError(errorMsg) {
  if (!errorMsg) return false;
  const msg = errorMsg.toLowerCase();
  return msg.includes("quota") || msg.includes("rate limit") || 
         msg.includes("exhausted") || msg.includes("429") ||
         msg.includes("exceeded") || msg.includes("not found") ||
         msg.includes("not supported") || msg.includes("404") ||
         msg.includes("not available") || msg.includes("deprecated") ||
         msg.includes("timeout") || msg.includes("aborted");
}

async function callGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 4096 }
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8500);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    let data;
    try { data = await response.json(); }
    catch { return { success: false, error: `فشل قراءة الرد من ${model}` }; }

    if (!response.ok) {
      return { success: false, error: data.error?.message || `HTTP ${response.status}` };
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    let textResult = "";
    for (const part of parts) if (part.text) textResult += part.text;

    if (!textResult.trim()) {
      const finishReason = data.candidates?.[0]?.finishReason || "UNKNOWN";
      return { success: false, error: `رد فاضي من ${model}. السبب: ${finishReason}` };
    }

    return { success: true, text: textResult.trim() };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { success: false, error: `timeout - ${model} أخد أكثر من 8 ثواني` };
    }
    return { success: false, error: err.message };
  }
}

async function getRealImages(query) {
  const accessKey = "YOUR_UNSPLASH_KEY";

  const response = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=3`,
    {
      headers: {
        Authorization: `Client-ID ${accessKey}`,
      },
    }
  );

  const data = await response.json();

  return data.results.map(img => ({
    url: img.urls.regular,
    alt: img.alt_description
  }));
}
    const styleHint = categoryMap[category] || "cinematic artistic detailed";

    // الخطوة 1: نطلب من Gemini prompt إنجليزي دقيق يصف القصة
    const translationPrompt = `You will receive an Arabic story. Create a detailed English image generation prompt (max 250 chars) that visualizes the MAIN scene or key moment.

Requirements:
- Focus on specific characters, setting, and key visual elements
- Mood: ${styleHint}
- Style: highly detailed digital illustration, cinematic lighting, professional book cover quality
- NO text, NO words, NO letters in image
- Be specific about what's happening, who is there, where

Story title: "${title}"
Story: ${content.substring(0, 1200)}

Return ONLY the English prompt, nothing else.`;

    const promptGenResult = await callGemini(apiKey, "gemini-2.5-flash", translationPrompt);

    let imagePrompt;
    if (promptGenResult.success && promptGenResult.text.length > 20) {
      imagePrompt = promptGenResult.text
        .replace(/^["']|["']$/g, '')
        .replace(/\n/g, ' ')
        .trim();
    } else {
      imagePrompt = `${styleHint} illustration, detailed cinematic artwork, professional book cover, no text`;
    }

    console.log("[Image] Prompt:", imagePrompt.substring(0, 150));

    // الخطوة 2: seed ثابت من العنوان لضمان نفس الصور مع نفس العنوان
    const seed = Math.abs(title.split('').reduce((a, c) => ((a << 5) - a) + c.charCodeAt(0), 0)) & 0x7FFFFFFF;
    const encodedPrompt = encodeURIComponent(imagePrompt);
    // استخدام flux model - أحدث وأدق من Pollinations
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=768&nologo=true&seed=${seed}&model=flux&enhance=true`;

    const imgController = new AbortController();
    const imgTimeout = setTimeout(() => imgController.abort(), 8000);

    try {
      const imgRes = await fetch(pollinationsUrl, { signal: imgController.signal });
      clearTimeout(imgTimeout);
      if (!imgRes.ok) throw new Error(`Pollinations: ${imgRes.status}`);

      const imgBuffer = await imgRes.arrayBuffer();
      const imgBase64 = Buffer.from(imgBuffer).toString('base64');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          text: imagePrompt,
          image: imgBase64,
          model: "pollinations/flux"
        })
      };
    } catch (imgErr) {
      clearTimeout(imgTimeout);
      throw imgErr;
    }
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "خطأ في توليد الصورة: " + err.message }) };
  }
}
