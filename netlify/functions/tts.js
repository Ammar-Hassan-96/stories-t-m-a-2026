/**
 * 🎙️ Edge TTS Proxy - Text-to-Speech
 * Microsoft Edge Read Aloud (مجاني 100% بدون API Key)
 * 
 * الأصوات المدعومة:
 * - ar-EG-SalmaNeural (مصري - سلمى)
 * - ar-EG-ShakirNeural (مصري - شاكر)
 * - ar-SA-ZariyahNeural (سعودي - زارية)
 * - ar-SA-HamedNeural (سعودي - حامد)
 * - ar-SY-AmanyNeural (سوري - أماني)
 * - ar-SY-LaithNeural (سوري - ليث)
 */

const crypto = require('crypto');

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  try {
    const { text, voice = "ar-EG-SalmaNeural", rate = "+0%", pitch = "+0Hz" } = JSON.parse(event.body);

    if (!text || !text.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "النص فارغ" }) };
    }

    const cleanText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      .trim();

    // Netlify timeout: 10s → حد عملي 4000 حرف لكل chunk
    const maxChars = 4000;
    if (cleanText.length > maxChars) {
      return { 
        statusCode: 413, 
        headers, 
        body: JSON.stringify({ 
          error: `النص طويل جداً (${cleanText.length} حرف). الحد الأقصى ${maxChars} حرف للطلب الواحد.`,
          needsChunking: true,
          maxChars,
          actualLength: cleanText.length
        }) 
      };
    }

    const audioBase64 = await synthesizeSpeech(cleanText, voice, rate, pitch);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        audio: audioBase64,
        voice,
        length: cleanText.length
      })
    };

  } catch (error) {
    console.error("[TTS Error]", error);
    return { 
      statusCode: 500, 
      headers, 
      body: JSON.stringify({ error: "فشل التحويل الصوتي: " + error.message }) 
    };
  }
};

function synthesizeSpeech(text, voice, rate, pitch) {
  const WebSocket = require('ws');
  const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
  const WSS_URL = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WSS_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
        "Origin": "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"
      }
    });

    const audioChunks = [];
    const requestId = crypto.randomUUID().replace(/-/g, '');
    let resolved = false;

    const finish = (err, result) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      try { ws.close(); } catch {}
      if (err) reject(err);
      else resolve(result);
    };

    const timeoutId = setTimeout(() => finish(new Error("Edge TTS timeout - 8.5s")), 8500);

    ws.on('open', () => {
      const configMsg = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify({
        context: {
          synthesis: {
            audio: {
              metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
              outputFormat: "audio-24khz-48kbitrate-mono-mp3"
            }
          }
        }
      })}`;
      ws.send(configMsg);

      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ar-EG'><voice name='${voice}'><prosody rate='${rate}' pitch='${pitch}'>${text}</prosody></voice></speak>`;
      const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${new Date().toISOString()}Z\r\nPath:ssml\r\n\r\n${ssml}`;
      ws.send(ssmlMsg);
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const headerLength = data.readUInt16BE(0);
        const audioData = data.slice(2 + headerLength);
        if (audioData.length > 0) audioChunks.push(audioData);
      } else {
        const str = data.toString();
        if (str.includes("Path:turn.end")) {
          const fullAudio = Buffer.concat(audioChunks);
          if (fullAudio.length === 0) {
            finish(new Error("لم يتم توليد صوت - النص قد يكون غير مدعوم"));
          } else {
            finish(null, fullAudio.toString('base64'));
          }
        }
      }
    });

    ws.on('error', (err) => finish(new Error("WebSocket error: " + err.message)));
    ws.on('close', () => {
      if (audioChunks.length === 0 && !resolved) {
        finish(new Error("WebSocket closed without audio"));
      }
    });
  });
}
