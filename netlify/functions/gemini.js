// Netlify Function: Gemini AI Proxy
// نظام هجين ذكي: يجرب الموديل الأقوى، لو الحصة خلصت يحوّل تلقائياً للموديل الأقل

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

    // تحذير لو القصة ضخمة جداً (قد تسبب timeout)
    if (content && content.length > 30000) {
      console.log(`[Warning] Large content: ${content.length} chars`);
    }

    // 🎯 استراتيجية الموديلات حسب المهمة
    // كل قيمة = مصفوفة موديلات بترتيب الأفضل → الأقل (fallback تلقائي)
    const MODEL_STRATEGY = {
      // مهام بسيطة: سريعة ومجانية
      suggest_titles: ["gemini-2.5-flash"],
      suggest_category: ["gemini-2.5-flash"],
      fix_grammar: ["gemini-2.5-flash"],
      
      // مهام متوسطة: Flash أولاً (سريع ومضمون)، ثم Pro لو عايز جودة أعلى
      improve_content: ["gemini-2.5-flash", "gemini-2.5-pro"],
      
      // ⚠️ مهم: للتطويل نستخدم Flash كأولوية لتجنب Netlify timeout (10s)
      // الموديلات البطيئة (3.1 Pro) بتسبب 502 Bad Gateway في الخطة المجانية
      expand_content: ["gemini-2.5-flash", "gemini-3-flash-preview"],
      continue_expand: ["gemini-2.5-flash", "gemini-3-flash-preview"],
      generate_story: ["gemini-2.5-flash", "gemini-3-flash-preview"],
    };

    // بناء الـ prompt حسب الـ action
    let finalPrompt = "";

    switch (action) {
      case "suggest_titles":
        finalPrompt = `اقرأ القصة التالية واقترح 3 عناوين جذابة وقصيرة (كل عنوان لا يزيد عن 7 كلمات) مناسبة لها. أرجع الـ 3 عناوين فقط، كل واحد في سطر منفصل، بدون ترقيم أو رموز أو شرح.\n\nالقصة:\n${content}`;
        break;

      case "improve_content":
        finalPrompt = `أعد صياغة القصة التالية بأسلوب أدبي رفيع وجذاب، مع الحفاظ على جميع الأحداث والشخصيات والتفاصيل. لا تقصّر القصة أبداً، بل حافظ على طولها الأصلي أو زده. أضف وصفاً أدق، حواراً داخلياً للشخصيات، ومشاعر أعمق. استخدم لغة أدبية راقية وتقنيات السرد الحديث. أرجع القصة المُحسَّنة كاملةً فقط بدون أي تعليقات:\n\n${content}`;
        break;

      case "expand_content":
        finalPrompt = `وسّع القصة التالية لتصبح قصة طويلة ومفصّلة جداً (بين 3000 و 5000 كلمة). أضف الكثير من التفاصيل والوصف الدقيق للأماكن والشخصيات والمشاعر، أضف حوارات داخلية وخارجية، مشاهد فرعية، وتطوير عميق للشخصيات. حافظ على الأحداث الأصلية وطوّرها برمزية وعمق. استخدم تقنيات الأدب الحديث: التوتر المتصاعد، الذروة، الحبكة الثانوية. اكتب بأسلوب أدبي راقٍ ومتدفق. أرجع القصة الموسّعة كاملةً فقط، بدون أي مقدمات أو تعليقات:\n\n${content}`;
        break;

      case "continue_expand":
        finalPrompt = `فيما يلي قصة طويلة. مهمتك: أكمل توسيعها وإضافة المزيد من التفاصيل والمشاهد والعمق لتصبح أطول وأغنى (أضف 3000-5000 كلمة جديدة على الأقل). 

قواعد مهمة:
1. لا تعيد كتابة القصة من البداية - أكمل من حيث انتهت أو أضف تفاصيل للمشاهد الموجودة
2. أضف: مشاهد فرعية جديدة، حوارات أعمق، وصف حسي مفصّل، شخصيات ثانوية، صراعات داخلية، ذكريات للشخصيات، وصف البيئة والأجواء
3. حافظ تماماً على نفس الأسلوب واللغة والشخصيات الموجودة
4. احرص على التماسك السردي - القصة الناتجة يجب أن تكون موحّدة ومتدفقة
5. لا تضع فواصل أو عناوين مثل "الفصل الثاني" إلا لو كانت موجودة أصلاً
6. أرجع القصة كاملة (الأصل + الإضافات الجديدة) بدون أي تعليقات أو شرح

القصة الحالية:
${content}`;
        break;

      case "fix_grammar":
        finalPrompt = `صحّح الأخطاء الإملائية واللغوية في النص التالي مع الحفاظ على الأسلوب واللهجة الأصلية. أرجع النص المُصحَّح فقط بدون أي تعليقات:\n\n${content}`;
        break;

      case "generate_story":
        finalPrompt = `اكتب قصة طويلة ومفصّلة (بين 3000 و 5000 كلمة) بناءً على الفكرة التالية. اجعلها مشوقة ومؤثرة، بأسلوب سردي جذاب مع وصف دقيق للشخصيات والأماكن والأحداث والحوارات. استخدم تقنيات الأدب الحديث من توتر وذروة وحبكة متصاعدة. أضف رمزية وعمقاً فلسفياً. أرجع القصة كاملةً فقط:\n\nالفكرة: ${prompt}\nالتصنيف المطلوب: ${category || "أي تصنيف مناسب"}`;
        break;

      case "suggest_category":
        finalPrompt = `اقرأ القصة التالية وحدد أنسب تصنيف لها من القائمة التالية فقط: drama, horror, kids, sci-fi, thriller, islamic, love. أرجع كلمة واحدة فقط (الـ ID بالإنجليزية) بدون أي شرح:\n\n${content}`;
        break;

      case "generate_image":
        return await handleImageGeneration(API_KEY, title, content, headers);

      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: "action غير معروف" }) };
    }

    // 🔄 نظام الـ Fallback الذكي
    const modelsToTry = MODEL_STRATEGY[action] || ["gemini-2.5-flash"];
    let lastError = null;
    let usedModel = null;

    for (const model of modelsToTry) {
      try {
        const result = await callGemini(API_KEY, model, finalPrompt);
        if (result.success) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              text: result.text,
              image: null,
              model: model // نرجع اسم الموديل المستخدم (للشفافية)
            })
          };
        }
        lastError = result.error;
        
        // لو الخطأ quota/rate limit → جرب الموديل اللي بعده
        if (isQuotaError(result.error)) {
          console.log(`[Quota] ${model} خلصت حصته، تحول للتالي...`);
          continue;
        }
        
        // لو الخطأ مش quota → ارجع الخطأ فوراً
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: result.error })
        };
      } catch (err) {
        lastError = err.message;
        if (isQuotaError(err.message)) continue;
        throw err;
      }
    }

    // لو كل الموديلات فشلت
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ 
        error: "فشلت كل الموديلات. آخر خطأ: " + (lastError || "غير معروف") + ". حاول بعد ساعة أو بكرة."
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

// 🔍 فحص لو الخطأ بسبب خلوص الحصة أو موديل غير موجود
function isRetryableError(errorMsg) {
  if (!errorMsg) return false;
  const msg = errorMsg.toLowerCase();
  return msg.includes("quota") || 
         msg.includes("rate limit") || 
         msg.includes("resource exhausted") ||
         msg.includes("429") ||
         msg.includes("exceeded") ||
         msg.includes("not found") ||
         msg.includes("is not supported") ||
         msg.includes("404") ||
         msg.includes("not available") ||
         msg.includes("deprecated");
}

// (alias للإصدار القديم)
function isQuotaError(errorMsg) {
  return isRetryableError(errorMsg);
}

// 📞 استدعاء Gemini API مع timeout
async function callGemini(apiKey, model, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 6144 // 6K tokens ≈ 3000-4000 كلمة عربي، يحصل خلال 5-7 ثواني
    }
  };

  // timeout بعد 8 ثواني (Netlify free tier حده 10 ثواني)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // محاولة قراءة الـ response
    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      return { 
        success: false, 
        error: `فشل قراءة الرد من ${model}: ${parseErr.message}` 
      };
    }

    if (!response.ok) {
      const errMsg = data.error?.message || `HTTP ${response.status}`;
      console.log(`[${model}] Error: ${errMsg}`);
      return { 
        success: false, 
        error: errMsg
      };
    }

    const parts = data.candidates?.[0]?.content?.parts || [];
    let textResult = "";
    for (const part of parts) {
      if (part.text) textResult += part.text;
    }

    // لو الرد فاضي
    if (!textResult.trim()) {
      const finishReason = data.candidates?.[0]?.finishReason || "UNKNOWN";
      return { 
        success: false, 
        error: `رد فاضي من ${model}. السبب: ${finishReason}. قد تكون القصة طويلة جداً.` 
      };
    }

    console.log(`[${model}] Success: ${textResult.length} chars`);
    return { success: true, text: textResult.trim() };

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { 
        success: false, 
        error: `timeout - ${model} أخد أكثر من 25 ثانية. القصة طويلة جداً.` 
      };
    }
    return { success: false, error: err.message };
  }
}

// 🎨 توليد الصور عبر Pollinations (مجاني)
async function handleImageGeneration(apiKey, title, content, headers) {
  try {
    // الخطوة 1: توليد prompt ذكي بـ Gemini
    const promptGenResult = await callGemini(
      apiKey,
      "gemini-2.5-flash",
      `Create a detailed English image generation prompt (max 200 characters) for an illustration of an Arabic story. Story title: "${title}". Story excerpt: ${content.substring(0, 400)}. The prompt should describe the scene, mood, and art style (cinematic, detailed, atmospheric). Return only the prompt, no explanations.`
    );

    const imagePrompt = promptGenResult.success 
      ? promptGenResult.text 
      : `Beautiful artistic illustration for story: ${title}`;

    // الخطوة 2: جلب الصورة من Pollinations (مجاني بالكامل)
    const encodedPrompt = encodeURIComponent(imagePrompt);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=768&nologo=true&seed=${Date.now()}`;

    const imgRes = await fetch(pollinationsUrl);
    if (!imgRes.ok) throw new Error("فشل توليد الصورة من Pollinations");

    const imgBuffer = await imgRes.arrayBuffer();
    const imgBase64 = Buffer.from(imgBuffer).toString('base64');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        text: imagePrompt,
        image: imgBase64,
        model: "pollinations.ai"
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "خطأ في توليد الصورة: " + err.message })
    };
  }
}
