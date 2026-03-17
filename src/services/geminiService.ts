import { GoogleGenAI, Modality, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const LANGUAGES = [
  { code: 'en-US', name: 'English' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'zh-CN', name: 'Chinese' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'hi-IN', name: 'Hindi' },
  { code: 'ar-SA', name: 'Arabic' },
  { code: 'tr-TR', name: 'Turkish' },
  { code: 'nl-NL', name: 'Dutch' },
  { code: 'pl-PL', name: 'Polish' },
  { code: 'vi-VN', name: 'Vietnamese' },
  { code: 'th-TH', name: 'Thai' },
  { code: 'te-IN', name: 'Telugu' },
];

export interface TranslationResult {
  translation: string;
  pronunciation: string;
}

export async function translateText(text: string, sourceLang: string, targetLang: string, retries = 3): Promise<TranslationResult> {
  if (!text.trim()) return { translation: "", pronunciation: "" };

  const prompt = `Translate the following text from ${sourceLang} to ${targetLang}. 
  Provide the translation and a simplified phonetic pronunciation guide (using Latin characters) for the target language.
  
  Text: ${text}`;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          systemInstruction: "You are an expert polyglot and linguist. Your goal is to provide highly accurate translations and precise phonetic pronunciation guides. Emphasize capturing specific language nuances, such as tones in tonal languages or rolled 'R's in languages like Spanish, to ensure the guide is as close to the actual spoken word as possible. Prefer simplified Latin characters that are intuitive for an English speaker to read over technical IPA symbols.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              translation: {
                type: Type.STRING,
                description: "The translated text.",
              },
              pronunciation: {
                type: Type.STRING,
                description: "A phonetic pronunciation guide for the translated text.",
              },
            },
            required: ["translation", "pronunciation"],
          },
        },
      });

      const responseText = response.text || "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonToParse = jsonMatch ? jsonMatch[0] : responseText;
      
      const result = JSON.parse(jsonToParse) as TranslationResult;
      
      return {
        translation: result.translation || "Translation failed.",
        pronunciation: result.pronunciation || "Pronunciation unavailable"
      };
    } catch (e: any) {
      const isRateLimit = e?.message?.includes('429') || e?.status === 429 || JSON.stringify(e).includes('429');
      if (isRateLimit && i < retries - 1) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      console.error("Translation error:", e);
      if (i === retries - 1) {
        return { 
          translation: "Translation service is busy. Please try again in a moment.", 
          pronunciation: "Unavailable" 
        };
      }
    }
  }

  return { translation: "Translation failed.", pronunciation: "Unavailable" };
}

function pcmToWav(pcmBase64: string, sampleRate: number = 24000): string {
  const binaryString = window.atob(pcmBase64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const buffer = new ArrayBuffer(44 + bytes.length);
  const view = new DataView(buffer);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false);
  // file length
  view.setUint32(4, 36 + bytes.length, true);
  // RIFF type
  view.setUint32(8, 0x57415645, false);
  // format chunk identifier
  view.setUint32(12, 0x666d7420, false);
  // format chunk length
  view.setUint16(16, 16, true);
  // sample format (1 is PCM)
  view.setUint16(20, 1, true);
  // channel count (1 for mono)
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  view.setUint32(36, 0x64617461, false);
  // data chunk length
  view.setUint32(40, bytes.length, true);

  const wavBytes = new Uint8Array(buffer);
  wavBytes.set(bytes, 44);

  let binary = '';
  const wavLen = wavBytes.byteLength;
  for (let i = 0; i < wavLen; i++) {
    binary += String.fromCharCode(wavBytes[i]);
  }
  return window.btoa(binary);
}

export async function generateSpeech(text: string, language: string, gender: 'male' | 'female' = 'female', rate: 'slow' | 'medium' | 'fast' = 'medium') {
  if (typeof text !== 'string' || !text.trim()) return null;

  const voiceName = gender === 'male' ? 'Puck' : 'Kore';
  const speedInstruction = rate === 'slow' ? 'slowly' : rate === 'fast' ? 'quickly' : 'at a normal pace';

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Speak this ${speedInstruction} in ${language}: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (base64Audio) {
    try {
      const wavBase64 = pcmToWav(base64Audio);
      return `data:audio/wav;base64,${wavBase64}`;
    } catch (e) {
      console.error("Error processing audio data:", e);
      return `data:audio/mp3;base64,${base64Audio}`; // Fallback
    }
  }
  return null;
}
