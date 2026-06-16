import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Paperclip, Send, Mic, X, Check, FileText, Image as ImageIcon, AlertCircle, Sparkles, BookOpen, PenTool, BarChart3, PanelLeft, Volume2, VolumeX, Headphones, Trash2, Settings, Copy, Globe, Code, Lightbulb, Compass, MessageSquare } from 'lucide-react';
import { Message, Attachment, ModelType } from '../types';
import ModelSelector from './ModelSelector';
import CodeBlock from './CodeBlock';

interface ChatBoxProps {
  messages: Message[];
  onSendMessage: (text: string, attachments: Attachment[]) => void;
  isStreaming: boolean;
  toolStatus?: string | null;
  onSuggestionClick: (text: string) => void;
  selectedModel: ModelType;
  onModelChange: (model: ModelType) => void;
  searchGrounding: boolean;
  onSearchGroundingChange: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  userEmail: string;
  onOpenSettings: () => void;
  onStopStreaming: () => void;
  hasActiveSession: boolean;
  onDeleteActiveSession: () => void;
}

export default function ChatBox({
  messages,
  onSendMessage,
  isStreaming,
  toolStatus,
  onSuggestionClick,
  selectedModel,
  onModelChange,
  searchGrounding,
  onSearchGroundingChange,
  sidebarOpen,
  onToggleSidebar,
  userEmail,
  onOpenSettings,
  onStopStreaming,
  hasActiveSession,
  onDeleteActiveSession,
}: ChatBoxProps) {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedMessageId(id);
      playSound('/audio/rounded.ogg');
      setTimeout(() => {
        setCopiedMessageId(null);
      }, 2000);
    }).catch(err => {
      console.error("Failed to copy text: ", err);
    });
  };

  const handleReadAloud = (messageId: string, text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    playSound('/audio/rounded.ogg');

    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    try {
      window.speechSynthesis.cancel();

      // Clean text by stripping markdown formatting and code blocks for neat pronunciation
      const cleanText = text
        .replace(/```[\s\S]*?```/g, '[code snippet skipped]')
        .replace(/\*\*|__/g, '')
        .replace(/#+\s+/g, '')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;

      utterance.onend = () => {
        setSpeakingMessageId(null);
      };

      utterance.onerror = () => {
        setSpeakingMessageId(null);
      };

      setSpeakingMessageId(messageId);

      // Delay call to speak() after cancel() to ensure clean state change on mobile devices
      setTimeout(() => {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          window.speechSynthesis.speak(utterance);
        }
      }, 100);
    } catch (e) {
      console.error("Speech synthesis failed: ", e);
      setSpeakingMessageId(null);
    }
  };

  // Turn off speech on unmount & configure Mobile user gesture TTS activation
  useEffect(() => {
    const unlockTTS = () => {
      try {
        if (typeof window !== 'undefined' && window.speechSynthesis) {
          // Play an empty, zero-duration/silent speak request on user touch/click to unlock TTS engine
          const emptyUtterance = new SpeechSynthesisUtterance('');
          emptyUtterance.volume = 0;
          window.speechSynthesis.speak(emptyUtterance);
          
          // Clear standard touch listeners once unlocked
          window.removeEventListener('click', unlockTTS);
          window.removeEventListener('touchstart', unlockTTS);
        }
      } catch (err) {
        console.warn("Mobile speech activation skipped/failed:", err);
      }
    };

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.addEventListener('click', unlockTTS);
      window.addEventListener('touchstart', unlockTTS);
    }

    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        window.removeEventListener('click', unlockTTS);
        window.removeEventListener('touchstart', unlockTTS);
      }
    };
  }, []);

  const [soundsEnabled, setSoundsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('claude_sounds_enabled') !== 'false';
  });

  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    return localStorage.getItem('claude_voice_enabled') === 'true';
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // Handle textarea autosize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [inputText]);

  // Sync settings to localStorage and listen for updates
  useEffect(() => {
    localStorage.setItem('claude_sounds_enabled', String(soundsEnabled));
  }, [soundsEnabled]);

  useEffect(() => {
    localStorage.setItem('claude_voice_enabled', String(voiceEnabled));
    if (!voiceEnabled && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, [voiceEnabled]);

  useEffect(() => {
    const handleSync = () => {
      setSoundsEnabled(localStorage.getItem('claude_sounds_enabled') !== 'false');
      setVoiceEnabled(localStorage.getItem('claude_voice_enabled') === 'true');
    };
    window.addEventListener('storage', handleSync);
    window.addEventListener('claude_settings_updated', handleSync);
    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('claude_settings_updated', handleSync);
    };
  }, []);

  // Speak the last completed message if TTS is enabled and no streaming is happening
  useEffect(() => {
    if (!voiceEnabled || messages.length === 0 || isStreaming) {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant' && lastMessage.text) {
      // Remove code blocks and markdown symbols before TTS speaking
      const cleanText = lastMessage.text
        .replace(/```[\s\S]*?```/g, '[code snippet skipped]')
        .replace(/\*\*|__/g, '')
        .replace(/[*#-]/g, '');

      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        
        // Delay speaking by 100ms after cancel() to guarantee state alignment on iOS/Android
        setTimeout(() => {
          if (typeof window !== 'undefined' && window.speechSynthesis && voiceEnabled && !isStreaming) {
            window.speechSynthesis.speak(utterance);
          }
        }, 100);
      }
    }
  }, [messages, isStreaming, voiceEnabled]);

  const playSound = (soundFile: string) => {
    if (!soundsEnabled) return;
    try {
      const isHeadless = typeof navigator !== 'undefined' && 
        (navigator.webdriver || /HeadlessChrome|Headless|jsdom/i.test(navigator.userAgent));
      if (isHeadless) return;

      const audio = new Audio();
      audio.onerror = (e) => {
        try {
          if (typeof e === 'object' && e && 'preventDefault' in e) {
            (e as any).preventDefault();
          }
        } catch {}
      };

      if (audio.canPlayType && audio.canPlayType('audio/ogg') === '') {
        return; // Browser does not support ogg format
      }
      audio.src = soundFile;
      audio.volume = 0.35;
      audio.play().catch(() => {});
    } catch (e) {}
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value);
  };

  const processFile = (file: File) => {
    setErrorMessage(null);
    const LIMIT_30MB = 30 * 1024 * 1024;

    if (file.size > LIMIT_30MB) {
      playSound('/audio/exit.ogg');
      setErrorMessage(`File "${file.name}" exceeds the 30 MB limit.`);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string).split(',')[1];
      const newAttachment: Attachment = {
        id: Math.random().toString(36).substring(7),
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        base64: base64String,
        url: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      };

      setAttachments(prev => [...prev, newAttachment]);
      playSound('/audio/rounded.ogg');
    };
    reader.onerror = () => {
      setErrorMessage(`Failed to read file ${file.name}`);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(processFile);
      e.target.value = '';
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const target = prev.find(a => a.id === id);
      if (target?.url) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter(a => a.id !== id);
    });
    playSound('/audio/user_input_end.ogg');
  };

  const recognitionRef = useRef<any>(null);

  const startVoiceInput = () => {
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = 'en-US';
        recognitionRef.current = rec;

        rec.onstart = () => {
          setIsListening(true);
          playSound('/audio/user_input_end.ogg');
        };
        
        rec.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInputText(prev => (prev ? prev + ' ' : '') + transcript);
        };

        rec.onerror = (e: any) => {
          console.error("Speech recognition error", e);
          setIsListening(false);
          if (e.error === 'not-allowed') {
            setErrorMessage("Microphone access is blocked inside iframe preview sandbox. Open app in a new tab if issues persist!");
          } else {
            setErrorMessage(`Speech recognition error: ${e.error || 'Check browser microphone permissions!'}`);
          }
        };

        rec.onend = () => {
          setIsListening(false);
          playSound('/audio/enter.ogg');
        };

        rec.start();
      } catch (err: any) {
        console.error("Speech recognition start failed", err);
        setErrorMessage("Could not start speech recognition: " + err.message);
        setIsListening(false);
      }
    } else {
      setIsListening(true);
      setErrorMessage("Speech recognition not supported in this browser. Simulating voice...");
      setTimeout(() => {
        setIsListening(false);
        setInputText(prev => (prev ? prev + ' ' : '') + 'Explain quantum computing in simple terms.');
        playSound('/audio/enter.ogg');
        setErrorMessage(null);
      }, 2000);
    }
  };

  const handleSend = () => {
    if (!inputText.trim() && attachments.length === 0) return;
    if (isStreaming) return;

    onSendMessage(inputText, attachments);
    setInputText('');
    setAttachments([]);
    setErrorMessage(null);
    playSound('/audio/enter.ogg');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(processFile);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const renderMessageContent = (text: string) => {
    if (!text) return null;

    const parts = text.split(/(```[\s\S]*?```)/g);

    return parts.map((part, index) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        const language = lines[0] && !lines[0].includes(' ') ? lines[0] : '';
        const code = language ? lines.slice(1).join('\n') : lines.join('\n');

        return (
          <CodeBlock key={index} code={code} language={language} />
        );
      }

      return (
        <span key={index} className="whitespace-pre-wrap leading-relaxed text-[15px]/[24px] font-normal select-text">
          {part.split('\n').map((line, lIdx) => {
            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
              return (
                <span key={lIdx} className="block pl-5 relative my-1.5">
                  <span className="absolute left-1.5 top-2.5 w-1.5 h-1.5 rounded-full bg-claude-accent" />
                  {line.slice(2)}
                </span>
              );
            }
            const boldParts = line.split(/(\*\*.*?\*\*)/g);
            return (
              <span key={lIdx} className="block min-h-[1.2em] my-1">
                {boldParts.map((bp, bpIdx) => {
                  if (bp.startsWith('**') && bp.endsWith('**')) {
                    return <strong key={bpIdx} className="font-bold text-claude-text">{bp.slice(2, -2)}</strong>;
                  }
                  return bp;
                })}
              </span>
            );
          })}
        </span>
      );
    });
  };

  const getGreeting = () => {
    const hours = new Date().getHours();
    if (hours < 12) return `Good morning`;
    if (hours < 18) return `Good afternoon`;
    return `Good evening`;
  };

  const ALL_SUGGESTIONS = useMemo(() => [
    { icon: BookOpen, title: 'Explain concepts', text: 'Explain quantum computing in simple terms for a beginner.', color: 'text-amber-600 bg-amber-50 border-amber-100' },
    { icon: PenTool, title: 'Draft or write', text: 'Write a persuasive email proposing a remote work schedule.', color: 'text-purple-600 bg-purple-50 border-purple-100' },
    { icon: BarChart3, title: 'Analyze & solve', text: 'Calculate the return on investment for solar panels on a home.', color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
    { icon: Code, title: 'Code & Debug', text: 'Write a Python script to scrape data from a website.', color: 'text-blue-600 bg-blue-50 border-blue-100' },
    { icon: Lightbulb, title: 'Brainstorm ideas', text: 'Give me 5 unique marketing ideas for a new coffee shop.', color: 'text-yellow-600 bg-yellow-50 border-yellow-100' },
    { icon: Compass, title: 'Travel planning', text: 'Plan a 3-day itinerary for a trip to Tokyo.', color: 'text-rose-600 bg-rose-50 border-rose-100' },
    { icon: MessageSquare, title: 'Interview prep', text: 'What are common behavioral interview questions?', color: 'text-cyan-600 bg-cyan-50 border-cyan-100' },
    { icon: Sparkles, title: 'Creative writing', text: 'Write a short sci-fi story about a time traveler.', color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
  ], []);

  const currentSuggestions = useMemo(() => {
    const shuffled = [...ALL_SUGGESTIONS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }, [ALL_SUGGESTIONS]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-claude-bg transition-all duration-150 ${
        isDragOver ? 'ring-4 ring-claude-accent/20 bg-claude-card/10' : ''
      }`}
      id="chatbox-wrapper"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        id="hidden-file-input"
      />

      {/* Header bar */}
      <header className="h-16 px-4 md:px-6 flex items-center justify-between border-b border-[#E6E1DA]/10 shrink-0 select-none bg-claude-bg">
        <div className="flex items-center gap-3">
          {!sidebarOpen && (
            <button
              onClick={() => {
                onToggleSidebar();
                playSound('/audio/glassy.ogg');
              }}
              className="p-1.5 hover:bg-claude-card rounded-lg transition-colors text-claude-secondary hover:text-claude-text cursor-pointer"
              title="Open sidebar"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
          )}
          <ModelSelector selectedModel={selectedModel} onChange={onModelChange} searchGrounding={searchGrounding} />

          {/* Premium Google Search Grounding toggle */}
          <button
            onClick={onSearchGroundingChange}
            className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-200 cursor-pointer select-none ${
              searchGrounding
                ? 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700 shadow-xs'
                : 'bg-claude-card hover:bg-claude-border border-claude-border text-claude-text'
            }`}
            title="Toggle Google Search Grounding (forces gemini-3.5-flash)"
            id="google-search-grounding-toggle"
          >
            <Globe className={`w-3.5 h-3.5 ${searchGrounding ? 'text-amber-600 animate-pulse' : 'text-claude-secondary'}`} />
            <div className={`w-5.5 h-3 rounded-full p-0.5 transition-colors duration-200 ease-in-out flex items-center ${searchGrounding ? 'bg-amber-600' : 'bg-gray-300'}`}>
              <div className={`bg-white w-2 h-2 rounded-full shadow-xs transform duration-200 ease-in-out ${searchGrounding ? 'translate-x-2' : 'translate-x-0'}`} />
            </div>
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs font-semibold text-claude-secondary font-mono flex items-center gap-1.5 text-right">
            {isStreaming ? (
              <div className="flex items-center gap-2">
                <span className="text-amber-600 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                  Claude is responding...
                </span>
                <button
                  onClick={onStopStreaming}
                  className="px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-650 text-[10px] font-bold rounded-lg cursor-pointer transition-colors flex items-center gap-1 shrink-0"
                  title="Stop generating text stream"
                  id="header-stop-stream-btn"
                >
                  <div className="w-2 h-2 bg-red-650 rounded-xs animate-pulse" />
                  <span>STOP</span>
                </button>
              </div>
            ) : (
              <span className="hidden sm:inline">Ready</span>
            )}
          </div>
        </div>
      </header>

      {/* Main chat messages feed */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden w-full px-4 md:px-6 py-6" id="messages-scroller">
        {messages.length === 0 ? (
          /* Onboarding / Prompt suggestions */
          <div className="max-w-2xl mx-auto py-6 md:py-10 flex flex-col justify-center min-h-full" id="intro-suggestions-banner">
            <h1 className="text-3xl md:text-4xl font-serif font-medium tracking-tight text-claude-text mb-2 text-center animate-fade-in">
              {getGreeting()}
            </h1>
            <p className="text-sm text-claude-secondary text-center max-w-md mx-auto leading-relaxed mb-6 md:mb-8">
              Select a suggestion or type below to start chatting with Claude.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4" id="intro-suggestions-grid">
              {currentSuggestions.map((sug, idx) => {
                const Icon = sug.icon;
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      onSuggestionClick(sug.text);
                      playSound('/audio/rounded.ogg');
                    }}
                    className="flex flex-col items-start p-5 rounded-2xl border border-claude-border bg-claude-bg hover:bg-claude-card hover:border-claude-accent/30 hover:-translate-y-0.5 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer text-left select-none"
                  >
                    <div className={`p-2 rounded-xl border mb-4 ${sug.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-bold text-claude-text mb-1 uppercase tracking-wider block">
                      {sug.title}
                    </span>
                    <span className="text-xs text-claude-secondary leading-relaxed font-normal block">
                      "{sug.text}"
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6 pb-2 w-full min-w-0" id="chat-feed">
            {messages.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m.id}
                  className={`flex flex-col w-full min-w-0 ${isUser ? 'items-end' : 'items-start'}`}
                  id={`chat-bubble-${m.id}`}
                >
                  <div
                    className={`w-fit max-w-[88%] sm:max-w-[85%] rounded-2xl px-3.5 py-3 sm:px-4.5 sm:py-3.5 border min-w-0 break-words ${
                      isUser
                        ? 'bg-claude-bubble-user text-claude-text border-claude-border/80'
                        : 'bg-claude-bubble-ai text-claude-text border-claude-border/50 shadow-xs'
                    }`}
                  >
                    {/* Render message attachments */}
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="flex flex-col gap-2 mb-3">
                        {m.attachments.map(att => (
                          <div
                            key={att.id}
                            className="flex items-center gap-2.5 p-2 rounded-xl bg-black/5 border border-black/5 text-xs max-w-full"
                          >
                            {att.mimeType.startsWith('image/') ? (
                              att.url ? (
                                <img
                                  src={att.url}
                                  alt={att.name}
                                  referrerPolicy="no-referrer"
                                  className="w-10 h-10 object-cover rounded-lg border border-black/10 shrink-0"
                                />
                              ) : (
                                <ImageIcon className="w-8 h-8 text-claude-secondary p-1 bg-black/5 rounded" />
                              )
                            ) : (
                              <FileText className="w-8 h-8 text-claude-secondary p-1 bg-black/5 rounded animate-pulse" />
                            )}
                            <div className="min-w-0 flex-1 leading-normal">
                              <span className="block truncate font-medium text-claude-text">
                                {att.name}
                              </span>
                              <span className="block text-[10px] text-claude-secondary">
                                {formatSize(att.size)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Speech / Text content */}
                    <div className="text-sm tracking-normal whitespace-pre-wrap leading-normal prose truncate-none font-sans w-full min-w-0 break-words">
                      {renderMessageContent(m.text)}
                    </div>

                    {/* Render grounding sources if present */}
                    {!isUser && m.groundingSources && m.groundingSources.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-claude-border/30" id={`grounding-sources-${m.id}`}>
                        <span className="text-[10px] font-bold text-claude-accent uppercase tracking-wider block mb-1.5 flex items-center gap-1 select-none">
                          <Globe className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                          Google Search Sources:
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {m.groundingSources.map((src, idx) => (
                            <a
                              key={`source-${idx}`}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-100 text-[10px] font-semibold text-amber-800 transition-all duration-200 hover:scale-103 shadow-xs"
                              title={src.title}
                            >
                              <span className="max-w-[130px] truncate">{src.title}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Status checklist timestamp — hide while this AI message is still loading (empty text + streaming) */}
                  {!(isStreaming && !isUser && !m.text) && (
                    <div className="flex items-center gap-1.5 mt-1.5 px-1.5 text-[10px] font-semibold text-claude-secondary select-none">
                      <span>
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isUser ? (
                        <div className="flex items-center gap-0.5">
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Sent</span>
                        </div>
                       ) : (
                        <>
                          <span className="text-claude-secondary/40">•</span>
                          <button
                            onClick={() => handleCopyText(m.id, m.text)}
                            className="flex items-center gap-1 hover:text-claude-text hover:bg-claude-border/30 px-1.5 py-0.5 rounded-md transition-all duration-150 cursor-pointer text-claude-secondary active:scale-95"
                            title="Copy message to clipboard"
                            id={`copy-btn-${m.id}`}
                          >
                            {copiedMessageId === m.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-600 text-[10px]">Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-claude-accent" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>

                          <span className="text-claude-secondary/40">•</span>
                          <button
                            onClick={() => handleReadAloud(m.id, m.text)}
                            className={`flex items-center gap-1 hover:text-claude-text hover:bg-claude-border/30 px-1.5 py-0.5 rounded-md transition-all duration-150 cursor-pointer active:scale-95 text-claude-secondary ${
                              speakingMessageId === m.id ? 'bg-amber-500/10 text-amber-600 border border-amber-500/10' : ''
                            }`}
                            title={speakingMessageId === m.id ? "Stop Reading Aloud" : "Read message aloud"}
                          >
                            {speakingMessageId === m.id ? (
                              <>
                                <VolumeX className="w-3 h-3 text-amber-500 animate-pulse" />
                                <span className="text-amber-500 font-semibold">Stop</span>
                              </>
                            ) : (
                              <>
                                <Volume2 className="w-3 h-3 text-claude-accent" />
                                <span>Read Aloud</span>
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* SSE typing loader & Tool Status */}
            {(isStreaming || toolStatus) && (
              <div className="flex flex-col items-start" id="ai-typing-loader">
                {toolStatus ? (
                  <div className="max-w-[85%] rounded-2xl px-3.5 py-2.5 bg-amber-500/5 text-claude-text border border-amber-500/20 flex items-center gap-2 shadow-sm mb-2">
                    <Sparkles className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                    <span className="text-sm font-medium text-amber-600/90 italic">{toolStatus}</span>
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-claude-bubble-ai text-claude-text border border-claude-border/50 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-claude-accent animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-claude-accent animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-claude-accent animate-bounce [animation-delay:0.4s]" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input textbox tray */}
      <div className="p-2 sm:p-3 md:py-3.5 pb-4 md:pb-5 bg-transparent border-t border-transparent select-none" id="input-tray-area">
        <div className="max-w-3xl mx-auto flex flex-col gap-2.5">
          
          {/* File limits indicator */}
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 p-3 rounded-xl bg-red-50 text-red-800 border border-red-100 text-xs font-semibold leading-relaxed"
              id="upload-error-indicator"
            >
              <AlertCircle className="w-4 h-4 text-red-650 shrink-0" />
              <span>{errorMessage}</span>
              <button
                onClick={() => setErrorMessage(null)}
                className="ml-auto p-0.5 hover:bg-red-100 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}

          {/* Draft attachment status previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 py-1" id="attachments-tray">
              {attachments.map(att => (
                <div
                  key={att.id}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-claude-card border border-claude-border text-xs leading-normal select-none relative group shadow-sm"
                >
                  {att.mimeType.startsWith('image/') ? (
                    att.url ? (
                      <img
                        src={att.url}
                        alt={att.name}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 object-cover rounded-lg border border-black/5"
                      />
                    ) : (
                      <ImageIcon className="w-4 h-4 text-claude-accent" />
                    )
                  ) : (
                    <FileText className="w-4 h-4 text-claude-accent" />
                  )}
                  <div className="min-w-0 max-w-[120px]">
                    <span className="block truncate font-medium text-claude-text">
                      {att.name}
                    </span>
                    <span className="block text-[9px] text-claude-secondary font-mono leading-none">
                      {formatSize(att.size)}
                    </span>
                  </div>
                  <button
                    onClick={() => removeAttachment(att.id)}
                    className="p-1 hover:bg-claude-border rounded-full text-claude-secondary transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Active Search Grounding Banner */}
          {searchGrounding && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50/70 text-amber-800 border border-amber-100 text-xs font-semibold select-none flex-wrap leading-normal" id="search-grounding-status-banner">
              <Globe className="w-3.5 h-3.5 text-amber-600 animate-pulse shrink-0" />
              <span>Google Search Grounding is active. Responses will fetch and integrate real-time web references.</span>
              <button 
                onClick={onSearchGroundingChange}
                className="text-amber-700 underline hover:text-amber-800 font-bold ml-auto text-xs cursor-pointer"
              >
                Disable
              </button>
            </div>
          )}

          {/* Prompt panel textbox controls container */}
          <div
            className="flex items-end gap-3 p-3 mx-1 sm:mx-0 rounded-2xl bg-white border border-claude-border shadow-sm focus-within:ring-1 focus-within:ring-claude-secondary focus-within:border-claude-secondary transition-all"
            id="chat-input-controls-box"
          >
            <button
               onClick={triggerFileSelect}
               className="p-2.5 hover:bg-claude-card rounded-xl text-claude-secondary hover:text-claude-text transition-colors cursor-pointer"
               title="Add attachment"
               id="clip-attachments-trigger"
             >
               <Paperclip className="w-5 h-5" />
             </button>
 
             <textarea
               ref={textareaRef}
               rows={1}
               value={inputText}
               onChange={handleTextChange}
               onKeyDown={handleKeyDown}
               placeholder="Ask Claude anything..."
               className="flex-1 max-h-[180px] py-2 bg-transparent text-sm ring-0 outline-none border-0 resize-none text-claude-text leading-relaxed select-text font-sans no-scrollbar mx-0.5"
               style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
               id="message-textarea-field"
             />

            <button
              onClick={startVoiceInput}
              className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                isListening
                  ? 'bg-red-50 hover:bg-red-105 text-red-650 border border-red-200 animate-pulse'
                  : 'hover:bg-claude-card text-claude-secondary hover:text-claude-text'
              }`}
              title="Start speech input"
              id="voice-speech-input-trigger"
            >
              <Mic className="w-5 h-5" />
            </button>

            {isStreaming ? (
              <button
                onClick={onStopStreaming}
                className="p-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white transition-all cursor-pointer animate-pulse shrink-0 flex items-center justify-center"
                title="Stop current text generation"
                id="stop-generation-button"
              >
                <div className="w-3.5 h-3.5 bg-white rounded-xs" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputText.trim() && attachments.length === 0}
                className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                  inputText.trim() || attachments.length > 0
                    ? 'bg-claude-text text-white hover:bg-claude-text/90 translate-y-0 active:scale-95'
                    : 'bg-claude-card text-claude-secondary/40 cursor-not-allowed opacity-60'
                }`}
                id="chat-submit-button"
              >
                <Send className="w-4 h-4 fill-current" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
