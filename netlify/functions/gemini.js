// Netlify Function: Gemini AI Proxy
// Production-ready: Auto-detect models + Smart routing + Retry + Timeout + Fallback

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const TIMEOUT_MS = 20000;

let cachedModels = null;
let cachedAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const safeParseJSON = (value) => {
  try {
    return JSON.parse(value || "{}");
  } catch {
    return null;
  }
};

const buildResponse = (statusCode, body) => ({
  statusCode,
  headers: HEADERS,
  body: JSON.stringify(body),
});

const validateInput = ({ action, prompt, content, title }) => {
  if (!action) return "Missing action";

  const actionsNeedContent = [
    "suggest_titles",
    "improve_content",
    "expand_content",
    "fix_grammar",
    "suggest_category",
    "generate_image",
  ];

  if (actionsNeedContent.includes(action) && !content) {
    return "Missing content";
  }

  if (action === "generate_story" && !prompt) {
    return "Missing prompt";
  }

  if (action === "generate_image" && !title) {
    return "Missing title";
  }

  return null;
};

const buildPrompt = ({ action, prompt, content, title, category }) => {
  switch (action) {
    case "suggest_titles":
      return `اقرأ القصة التالية واقترح 3 عناوين جذابة وقصيرة (كل عنوان لا يزيد عن 7 كلمات) مناسبة لها. أرجع الـ 3 عناوين فقط، كل واحد في سطر منفصل، بدون ترقيم أو رموز أو شرح.

القصة:
${content}`;

    case "improve_content":
      return `أعد صياغة القصة التالية بأسلوب أدبي جذاب وممتع، مع الحفاظ على جميع الأحداث والشخصيات والتفاصيل. لا تقصّر القصة أبداً، بل حافظ على طولها الأصلي أو زده. اجعلها أكثر تشويقاً وحيوية بإضافة وصف أدق ومشاعر أعمق. أرجع القصة المُحسَّنة كاملةً فقط:

${content}`;

    case "expand_content":
      return `وسّع القصة التالية لتصبح قصة طويلة ومفصّلة بين 3000 و 5000 كلمة. أضف الكثير من التفاصيل والوصف الدقيق للأماكن والشخصيات والمشاعر والحوارات والمشاهد، مع الحفاظ على الأحداث الأصلية وتطويرها. اجعل القصة غنية بالتفاصيل الحسية والحوارات الداخلية للشخصيات. اكتب بأسلوب أدبي جذاب ومتدفق. أرجع القصة الموسّعة كاملةً فقط، بدون أي مقدمات أو تعليقات:

${content}`;

    case "fix_grammar":
      return `صحّح الأخطاء الإملائية واللغوية في النص التالي مع الحفاظ على الأسلوب واللهجة الأصلية. أرجع النص المُصحَّح فقط بدون أي تعليقات:

${content}`;

    case "generate_story":
      return `اكتب قصة طويلة ومفصّلة (بين 3000 و 5000 كلمة) بناءً على الفكرة التالية. اجعلها مشوقة ومؤثرة، بأسلوب سردي جذاب مع وصف دقيق للشخصيات والأماكن والأحداث والحوارات. استخدم تقنيات الأدب الحديث من توتر وذروة وحبكة متصاعدة. أرجع القصة كاملةً فقط:

الفكرة: ${prompt}
التصنيف المطلوب: ${category || "أي تصنيف مناسب"}`;

    case "suggest_category":
      return `اقرأ القصة التالية وحدد أنسب تصنيف لها من القائمة التالية فقط: drama, horror, kids, sci-fi, thriller, islamic, love. أرجع كلمة واحدة فقط (الـ ID بالإنجليزية) بدون أي شرح:

${content}`;

    default:
      return null;
  }
};

const scoreModel = (modelName) => {
  const name = modelName.toLowerCase();

  let score = 0;

  if (name.includes("2.5")) score += 100;
  else if (name.includes("2.0")) score += 70;
  else if (name.includes("1.5")) score += 40;

  if (name.includes("flash")) score += 20;
  if (name.includes("lite")) score -= 10;
  if (name.includes("thinking")) score -= 20;
  if (name.includes("image")) score -= 1000;

  return score;
};

const fetchAvailableModels = async (apiKey) => {
  const now = Date.now();

  if (cachedModels && now - cachedAt < MODEL_CACHE_TTL) {
    return cachedModels;
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error?.message || "Failed to fetch models");
  }

  const models = (data.models || [])
    .filter((model) => {
      const methods = model.supportedGenerationMethods || [];
      return methods.includes("generateContent");
    })
    .map((model) => model.name.replace(/^models\//, ""))
    .filter((name) => !name.toLowerCase().includes("image"))
    .sort((a, b) => scoreModel(b) - scoreModel(a));

  if (!models.length) {
    throw new Error("No supported text models found");
  }

  cachedModels = models;
  cachedAt = now;

  return models;
};

const chooseBestModels = (models, action) => {
  const lower = models.map((m) => m.toLowerCase());

  const pickBy = (predicate) =>
    models.filter((model, index) => predicate(lower[index]));

  let preferred = [];

  if (action === "generate_story" || action === "expand_content") {
    preferred = pickBy((name) => name.includes("2.5") && !name.includes("lite"));
  } else if (
    action === "fix_grammar" ||
    action === "suggest_titles" ||
    action === "suggest_category"
  ) {
    preferred = pickBy((name) => name.includes("flash"));
  } else if (action === "improve_content") {
    preferred = pickBy((name) => name.includes("2.5") || name.includes("flash"));
  }

  const merged = [...preferred, ...models];
  return [...new Set(merged)];
};

const callGeminiWithRetry = async (url, requestBody) => {
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data?.error?.message || "Gemini API error";
        const lowerMessage = message.toLowerCase();

        if (
          lowerMessage.includes("high demand") ||
          lowerMessage.includes("overloaded") ||
          lowerMessage.includes("resource exhausted") ||
          response.status === 429 ||
          response.status === 503
        ) {
          lastError = new Error(message);
          if (attempt < MAX_RETRIES - 1) {
            await sleep(1200 * (attempt + 1));
            continue;
          }
        }

        if (
          lowerMessage.includes("not found") ||
          lowerMessage.includes("not supported")
        ) {
          const err = new Error("MODEL_UNAVAILABLE");
          err.originalMessage = message;
          throw err;
        }

        throw new Error(message);
      }

      return data;
    } catch (error) {
      lastError = error;

      if (error.name === "AbortError") {
        lastError = new Error("Request timeout");
      }

      if (error.message === "MODEL_UNAVAILABLE") {
        throw error;
      }

      if (attempt < MAX_RETRIES - 1) {
        await sleep(1200 * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError || new Error("Unknown Gemini error");
};

const generateSmart = async (apiKey, requestBody, action) => {
  const availableModels = await fetchAvailableModels(apiKey);
  const candidateModels = chooseBestModels(availableModels, action);

  let lastError = null;

  for (const model of candidateModels) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const data = await callGeminiWithRetry(url, requestBody);
      return { data, model };
    } catch (error) {
      lastError = error;

      if (error.message === "MODEL_UNAVAILABLE") {
        continue;
      }
    }
  }

  throw lastError || new Error("All models failed");
};

const buildImagePrompt = async (apiKey, title, content) => {
  const fallbackPrompt = `Beautiful cinematic illustration for the Arabic story "${title}"`;

  try {
    const availableModels = await fetchAvailableModels(apiKey);
    const textModel =
      availableModels.find((model) => model.toLowerCase().includes("flash")) ||
      availableModels[0];

    if (!textModel) return fallbackPrompt;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: `Create a detailed English image generation prompt, maximum 200 characters, for an illustration of an Arabic story. Story title: "${title}". Story excerpt: ${String(content).slice(0, 400)}. The prompt should describe the scene, mood, and art style. Return only the prompt.`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 120,
      },
    };

    const data = await callGeminiWithRetry(url, requestBody);
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts.map((part) => part.text || "").join("").trim();

    return text || fallbackPrompt;
  } catch {
    return fallbackPrompt;
  }
};

const generateImage = async (apiKey, title, content) => {
  const imagePrompt = await buildImagePrompt(apiKey, title, content);
  const encodedPrompt = encodeURIComponent(imagePrompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=768&nologo=true&seed=${Date.now()}`;

  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error("Image generation failed");
  }

  const buffer = await response.arrayBuffer();
  const imageBase64 = Buffer.from(buffer).toString("base64");

  return {
    text: imagePrompt,
    image: imageBase64,
  };
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return buildResponse(405, { error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return buildResponse(500, {
      error: "GEMINI_API_KEY is not configured",
    });
  }

  const parsedBody = safeParseJSON(event.body);

  if (!parsedBody) {
    return buildResponse(400, { error: "Invalid JSON body" });
  }

  const validationError = validateInput(parsedBody);
  if (validationError) {
    return buildResponse(400, { error: validationError });
  }

  const { action, prompt, content, title, category } = parsedBody;

  try {
    if (action === "generate_image") {
      const result = await generateImage(apiKey, title, content);

      return buildResponse(200, {
        success: true,
        text: result.text,
        image: result.image,
      });
    }

    const finalPrompt = buildPrompt({
      action,
      prompt,
      content,
      title,
      category,
    });

    if (!finalPrompt) {
      return buildResponse(400, { error: "Unknown action" });
    }

    const requestBody = {
      contents: [{ parts: [{ text: finalPrompt }] }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens:
          action === "generate_story" || action === "expand_content"
            ? 8192
            : 2048,
      },
    };

    const { data, model } = await generateSmart(apiKey, requestBody, action);

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const textResult = parts
      .map((part) => part.text || "")
      .join("")
      .trim();

    return buildResponse(200, {
      success: true,
      model,
      text: textResult,
      image: null,
    });
  } catch (error) {
    const message = error?.message || "Internal Server Error";
    const lowerMessage = message.toLowerCase();

    if (
      lowerMessage.includes("high demand") ||
      lowerMessage.includes("overloaded") ||
      lowerMessage.includes("resource exhausted")
    ) {
      return buildResponse(503, {
        error: "السيرفر مشغول حالياً، حاول مرة أخرى بعد قليل",
      });
    }

    if (lowerMessage.includes("timeout")) {
      return buildResponse(504, {
        error: "انتهت مهلة الطلب، حاول مرة أخرى",
      });
    }

    return buildResponse(500, {
      error: message,
    });
  }
};
