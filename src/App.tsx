import React, { useState, useEffect, useRef } from 'react';
import { 
  Languages, 
  ArrowRightLeft, 
  Copy, 
  Volume2, 
  Loader2, 
  Check, 
  Trash2,
  Sparkles,
  Mic,
  MicOff,
  AlertCircle,
  X,
  Zap,
  Layout
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translateText, generateSpeech, LANGUAGES } from './services/geminiService';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Speech Recognition Type Definitions
interface SpeechRecognitionResult {
  isFinal: boolean;
  [key: number]: {
    transcript: string;
    confidence: number;
  };
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: any) => void;
  onend: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export default function App() {
  const [inputText, setInputText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [pronunciation, setPronunciation] = useState('');
  const [sourceLang, setSourceLang] = useState('English');
  const [targetLang, setTargetLang] = useState('Spanish');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [pronunciationError, setPronunciationError] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [voiceGender, setVoiceGender] = useState<'male' | 'female'>('female');
  const [speechRate, setSpeechRate] = useState<'slow' | 'medium' | 'fast'>('medium');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const handleTranslate = async () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setPronunciationError(null);
    try {
      const result = await translateText(inputText, sourceLang, targetLang);
      setTranslatedText(result.translation);
      
      if (result.pronunciation === "Pronunciation unavailable") {
        setPronunciationError("Pronunciation guide currently unavailable for this translation.");
        setPronunciation('');
      } else {
        setPronunciation(result.pronunciation);
      }

      if (autoSpeak && result.translation) {
        handleSpeak(result.translation);
      }
    } catch (error) {
      console.error('Translation error:', error);
      setTranslatedText('Error: Could not translate text. Please check your connection.');
      setPronunciation('');
      setPronunciationError(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-translate with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (inputText.trim()) {
        handleTranslate();
      } else {
        setTranslatedText('');
        setPronunciation('');
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [inputText, sourceLang, targetLang]);

  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setInputText(translatedText);
    setTranslatedText(inputText);
    setPronunciation(''); // Clear pronunciation on swap as it's now the source
  };

  const handleCopy = () => {
    if (!translatedText) return;
    navigator.clipboard.writeText(translatedText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSpeak = async (textToSpeak?: string | any) => {
    const text = (typeof textToSpeak === 'string' ? textToSpeak : null) || translatedText;
    if (!text || isSpeaking) return;
    setIsSpeaking(true);
    try {
      const audioUrl = await generateSpeech(text, targetLang, voiceGender, speechRate);
      if (audioUrl) {
        if (audioRef.current) {
          audioRef.current.src = audioUrl;
          audioRef.current.play();
        } else {
          const audio = new Audio(audioUrl);
          audioRef.current = audio;
          audio.onended = () => setIsSpeaking(false);
          audio.onerror = () => {
            setIsSpeaking(false);
            alert("Failed to play audio. Please try again.");
          };
          audio.play();
        }
      } else {
        setIsSpeaking(false);
        alert("Audio generation failed for this language.");
      }
    } catch (error) {
      console.error('TTS error:', error);
      setIsSpeaking(false);
      alert("An error occurred while generating audio.");
    }
  };

  const handleClear = () => {
    setInputText('');
    setTranslatedText('');
    setPronunciation('');
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    setSpeechError(null);
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    // Map language name to code for recognition
    const langObj = LANGUAGES.find(l => l.name === sourceLang);
    recognition.lang = langObj?.code || 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          setInputText(prev => {
            const base = prev.trim();
            return base ? `${base} ${transcript.trim()}` : transcript.trim();
          });
        } else {
          currentTranscript += transcript;
        }
      }
      // We could show interim results in a separate UI, but for now we just wait for final
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        setSpeechError('No speech detected. Please try again.');
      } else if (event.error === 'not-allowed') {
        setSpeechError('Microphone access denied. Please enable it in your browser settings.');
      } else if (event.error === 'network') {
        setSpeechError('Network error occurred during recognition.');
      } else {
        setSpeechError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans selection:bg-indigo-100">
      {/* Header */}
      <header className="max-w-5xl mx-auto pt-12 pb-8 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
            <Languages className="text-white w-6 h-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Linguist AI</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] gap-4 items-start">
          
          {/* Source Panel */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[400px]"
          >
            <div className="p-4 border-bottom border-gray-50 flex items-center justify-between bg-gray-50/50">
              <select 
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                className="bg-transparent font-medium focus:outline-none cursor-pointer hover:text-indigo-600 transition-colors px-2"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.name}>{lang.name}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <button 
                  onClick={toggleListening}
                  className={cn(
                    "p-2 rounded-full transition-all relative",
                    isListening ? "bg-red-50 text-red-500" : "hover:bg-gray-100 text-gray-400 hover:text-indigo-600"
                  )}
                  title={isListening ? "Stop listening" : "Start voice input"}
                >
                  {isListening ? (
                    <div className="relative flex items-center justify-center">
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                        className="relative z-10"
                      >
                        <MicOff className="w-4 h-4" />
                      </motion.div>
                      
                      {/* Multiple pulsating rings */}
                      {[1, 2, 3].map((i) => (
                        <motion.div
                          key={i}
                          className="absolute inset-0 bg-red-500/30 rounded-full"
                          initial={{ scale: 1, opacity: 0.5 }}
                          animate={{ 
                            scale: [1, 2.5], 
                            opacity: [0.5, 0] 
                          }}
                          transition={{ 
                            duration: 2, 
                            repeat: Infinity, 
                            delay: (i - 1) * 0.6,
                            ease: "easeOut" 
                          }}
                        />
                      ))}
                      
                      {/* Inner glow */}
                      <motion.div 
                        className="absolute inset-0 bg-red-500/10 rounded-full blur-sm"
                        animate={{ opacity: [0.2, 0.5, 0.2] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      />
                    </div>
                  ) : (
                    <Mic className="w-4 h-4" />
                  )}
                </button>
                {inputText && (
                  <button 
                    onClick={handleClear}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-red-500"
                    title="Clear text"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
            <div className="relative flex-1 flex flex-col">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={isListening ? "Listening..." : "Enter text to translate..."}
                className="flex-1 p-6 text-lg resize-none focus:outline-none placeholder:text-gray-300 leading-relaxed"
              />
              
              <AnimatePresence>
                {speechError && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute bottom-4 left-4 right-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center gap-2 z-10"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{speechError}</span>
                    <button 
                      onClick={() => setSpeechError(null)}
                      className="ml-auto hover:bg-red-100 p-1 rounded-full transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="p-4 text-xs text-gray-400 flex justify-end">
              {inputText.length} characters
            </div>
          </motion.div>

          {/* Swap Button */}
          <div className="flex md:flex-col items-center justify-center py-4 md:py-12">
            <button 
              onClick={handleSwapLanguages}
              className="p-3 bg-white rounded-full shadow-md border border-gray-100 hover:shadow-lg hover:scale-110 transition-all text-gray-600 hover:text-indigo-600 active:scale-95"
            >
              <ArrowRightLeft className="w-5 h-5 md:rotate-0 rotate-90" />
            </button>
          </div>

          {/* Target Panel */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[400px] relative"
          >
            <div className="p-4 border-bottom border-gray-50 flex items-center justify-between bg-gray-50/50">
              <select 
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="bg-transparent font-medium focus:outline-none cursor-pointer hover:text-indigo-600 transition-colors px-2"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.code} value={lang.name}>{lang.name}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <div className="hidden sm:flex items-center gap-2 mr-2 px-3 py-1 bg-gray-100 rounded-full border border-gray-200">
                  <div className="flex items-center gap-1 border-r border-gray-300 pr-2">
                    <button 
                      onClick={() => setVoiceGender('female')}
                      className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors",
                        voiceGender === 'female' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                      )}
                    >
                      F
                    </button>
                    <button 
                      onClick={() => setVoiceGender('male')}
                      className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors",
                        voiceGender === 'male' ? "bg-white text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                      )}
                    >
                      M
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    {(['slow', 'medium', 'fast'] as const).map((rate) => (
                      <button 
                        key={rate}
                        onClick={() => setSpeechRate(rate)}
                        className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors capitalize",
                          speechRate === rate ? "bg-white text-indigo-600 shadow-sm" : "text-gray-400 hover:text-gray-600"
                        )}
                      >
                        {rate[0]}
                      </button>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={() => setAutoSpeak(!autoSpeak)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-full transition-all text-[10px] font-bold uppercase tracking-wider",
                    autoSpeak 
                      ? "bg-indigo-100 text-indigo-600 border border-indigo-200" 
                      : "bg-gray-100 text-gray-400 border border-gray-200 hover:text-gray-600"
                  )}
                  title={autoSpeak ? "Auto-speak enabled" : "Auto-speak disabled"}
                >
                  <Zap className={cn("w-3 h-3", autoSpeak && "fill-current")} />
                  <span className="hidden sm:inline">Auto</span>
                </button>
                <button 
                  onClick={handleCopy}
                  disabled={!translatedText}
                  className={cn(
                    "p-2 rounded-full transition-all",
                    translatedText ? "hover:bg-gray-100 text-gray-600" : "text-gray-200 cursor-not-allowed"
                  )}
                  title="Copy to clipboard"
                >
                  {isCopied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => handleSpeak()}
                  disabled={!translatedText || isSpeaking}
                  className={cn(
                    "p-2 rounded-full transition-all",
                    translatedText && !isSpeaking ? "hover:bg-gray-100 text-gray-600" : "text-gray-200 cursor-not-allowed",
                    isSpeaking && "animate-pulse text-indigo-500"
                  )}
                  title="Listen"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 p-6 text-lg leading-relaxed relative">
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div 
                    key="loader"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[1px]"
                  >
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="text"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col gap-4"
                  >
                    <div className={cn(
                      "whitespace-pre-wrap",
                      !translatedText && "text-gray-300 italic"
                    )}>
                      {translatedText || "Translation will appear here..."}
                    </div>
                    
                    {pronunciation && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-sm font-medium px-3 py-1.5 rounded-lg border w-fit flex items-center gap-2 text-indigo-500 bg-indigo-50/50 border-indigo-100/50"
                      >
                        <span className="text-[10px] uppercase tracking-wider opacity-60">
                          Pronunciation:
                        </span>
                        {pronunciation}
                      </motion.div>
                    )}

                    {pronunciationError && translatedText && !translatedText.startsWith('Error:') && (
                      <motion.div 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg border w-fit flex items-center gap-2 text-amber-600 bg-amber-50 border-amber-100"
                      >
                        <span className="text-[10px] uppercase tracking-wider opacity-60">
                          Note:
                        </span>
                        {pronunciationError}
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </div>

        {/* Features Info */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div className="flex flex-col gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-blue-600" />
            </div>
            <h3 className="font-semibold">Natural Speech</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Listen to your translations with high-quality text-to-speech generation.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center">
              <ArrowRightLeft className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="font-semibold">Smart Swap</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Easily switch between source and target languages with a single click.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <div className="w-10 h-10 bg-purple-50 rounded-full flex items-center justify-center">
              <Layout className="w-5 h-5 text-purple-600" />
            </div>
            <h3 className="font-semibold">User Friendly</h3>
            <p className="text-sm text-gray-500 leading-relaxed">
              Clean, intuitive dashboard designed for a seamless translation experience.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-6 text-center text-sm text-gray-400">
        &copy; {new Date().getFullYear()} Linguist AI. All rights reserved.
      </footer>
    </div>
  );
}
