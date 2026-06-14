import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import ChatBox from './components/ChatBox';
import SettingsModal from './components/SettingsModal';
import FinanceDashboard from './components/FinanceDashboard';
import GithubWorkspace from './components/GithubWorkspace';
import { ChatSession, Message, Attachment, ModelType } from './types';

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('claude_chat_sessions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        // Fallback
      }
    }
    return [];
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return localStorage.getItem('claude_active_session_id') || null;
  });

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem('claude_sidebar_open');
    return saved !== 'false';
  });

  const [isStreaming, setIsStreaming] = useState(false);
  const [userEmail, setUserEmail] = useState('sahaj.cute@gmail.com');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'stocks' | 'github'>('chat');
  
  const [soundsEnabled, setSoundsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('claude_sounds_enabled') !== 'false';
  });
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(() => {
    return localStorage.getItem('claude_voice_enabled') === 'true';
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  const playSound = (soundFile: string) => {
    if (!soundsEnabled) return;
    try {
      // Direct detection of headless environments or non-interactive environments to prevent console media failures
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
        return; // Browser does not support ogg format (e.g. Safari inside sandbox)
      }
      audio.src = soundFile;
      audio.volume = 0.35;
      audio.play().catch(() => {});
    } catch (e) {}
  };

  useEffect(() => {
    localStorage.setItem('claude_sounds_enabled', String(soundsEnabled));
    window.dispatchEvent(new Event('claude_settings_updated'));
  }, [soundsEnabled]);

  useEffect(() => {
    localStorage.setItem('claude_voice_enabled', String(voiceEnabled));
    window.dispatchEvent(new Event('claude_settings_updated'));
  }, [voiceEnabled]);

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem('claude_chat_sessions', JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    if (activeSessionId) {
      localStorage.setItem('claude_active_session_id', activeSessionId);
    } else {
      localStorage.removeItem('claude_active_session_id');
    }
  }, [activeSessionId]);

  useEffect(() => {
    localStorage.setItem('claude_sidebar_open', String(sidebarOpen));
  }, [sidebarOpen]);

  // Fetch server configuration on load
  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(config => {
        if (config.userEmail) {
          setUserEmail(config.userEmail);
        }
      })
      .catch(() => {});
  }, []);

  // Keyboard shortcut for starting a new chat (Cmd+K or Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sessions]);

  // Handle active session calculation
  const getActiveSession = (): ChatSession | null => {
    return sessions.find(s => s.id === activeSessionId) || null;
  };

  const handleNewChat = () => {
    const newSessionId = 'session-' + Math.random().toString(36).substring(7);
    const newSession: ChatSession = {
      id: newSessionId,
      title: 'New Chat',
      messages: [],
      model: 'gemini-3.5-flash',
      createdAt: Date.now(),
    };

    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(newSessionId);
  };

  const handleDeleteSession = (id: string) => {
    setSessions(prev => {
      const filtered = prev.filter(s => s.id !== id);
      if (activeSessionId === id) {
        if (filtered.length > 0) {
          setActiveSessionId(filtered[0].id);
        } else {
          setActiveSessionId(null);
        }
      }
      return filtered;
    });
  };

  const handleRenameSession = (id: string, newTitle: string) => {
    setSessions(prev =>
      prev.map(s => (s.id === id ? { ...s, title: newTitle } : s))
    );
  };

  const handleModelChangeOnActiveSession = (newModel: ModelType) => {
    if (!activeSessionId) return;

    setSessions(prev =>
      prev.map(s => (s.id === activeSessionId ? { ...s, model: newModel } : s))
    );
    playSound('/audio/rounded.ogg');
  };

  const handleToggleSearchGroundingOnActiveSession = () => {
    if (!activeSessionId) return;

    setSessions(prev =>
      prev.map(s => {
        if (s.id === activeSessionId) {
          const nextSearchGrounding = !s.searchGrounding;
          let nextModel = s.model;
          if (nextSearchGrounding) {
            // Turning search grounding ON - shift to a grounding-specific model if currently standard
            if (s.model === 'gemini-3.5-flash' || s.model === 'gemini-3.1-flash-lite') {
              nextModel = 'models/gemini-2.5-flash-lite';
            }
          } else {
            // Turning search grounding OFF - revert back to a standard chat model
            if (s.model !== 'gemini-3.5-flash' && s.model !== 'gemini-3.1-flash-lite') {
              nextModel = 'gemini-3.5-flash';
            }
          }
          return { ...s, searchGrounding: nextSearchGrounding, model: nextModel };
        }
        return s;
      })
    );
    playSound('/audio/rounded.ogg');
  };

  const onSendMessage = async (text: string, attachments: Attachment[]) => {
    if (!text.trim() && attachments.length === 0) return;

    let currentSessionId = activeSessionId;
    let currentSessions = [...sessions];

    // Create a new session automatically if none are active
    if (!currentSessionId) {
      currentSessionId = 'session-' + Math.random().toString(36).substring(7);
      const newSession: ChatSession = {
        id: currentSessionId,
        title: text.trim().slice(0, 36) || 'New Chat',
        messages: [],
        model: 'gemini-3.5-flash',
        createdAt: Date.now(),
      };
      currentSessions = [newSession, ...currentSessions];
      setSessions(currentSessions);
      setActiveSessionId(currentSessionId);
    }

    // Append the user message
    const userMsgId = Math.random().toString(36).substring(7);
    const userMsg: Message = {
      id: userMsgId,
      role: 'user',
      text: text,
      timestamp: Date.now(),
      attachments: attachments,
    };

    const targetSession = currentSessions.find(s => s.id === currentSessionId);
    if (!targetSession) return;

    const isFirstUserMessage = targetSession.messages.length === 0;
    const updatedMessages = [...targetSession.messages, userMsg];

    // Update active session locally
    setSessions(prev =>
      prev.map(s =>
        s.id === currentSessionId
          ? {
              ...s,
              title: isFirstUserMessage ? text.trim().slice(0, 36) || 'New Chat' : s.title,
              messages: updatedMessages,
            }
          : s
      )
    );

    setIsStreaming(true);
    playSound('/audio/user_input_end.ogg');

    // Append empty AI message placeholder
    const aiMsgId = Math.random().toString(36).substring(7);
    const aiMsg: Message = {
      id: aiMsgId,
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
    };

    setSessions(prev =>
      prev.map(s =>
        s.id === currentSessionId
          ? {
              ...s,
              messages: [...updatedMessages, aiMsg],
            }
          : s
      )
    );

    let aiText = '';
    const accumulatedSources: { title: string; uri: string }[] = [];
    let streamError: Error | null = null;

    // Initialize AbortController for cancelable streaming
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: targetSession.model,
          searchGrounding: !!targetSession.searchGrounding,
          messages: updatedMessages.map(m => ({
            role: m.role,
            text: m.text,
            attachments: m.attachments?.map(att => ({
              base64: att.base64,
              mimeType: att.mimeType,
            })),
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP fetch error! Status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder('utf-8');

      if (reader) {
        let partialLine = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = (partialLine + chunk).split('\n');
          partialLine = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              const dataStr = trimmed.slice(6);
              if (dataStr === '[DONE]') continue;

              try {
                const parsed = JSON.parse(dataStr);
                
                // Parse grounding metadata if returned
                if (parsed.groundingMetadata?.groundingChunks) {
                  const chunksList = parsed.groundingMetadata.groundingChunks;
                  chunksList.forEach((c: any) => {
                    if (c?.web?.uri) {
                      const uri = c.web.uri;
                      const title = c.web.title || new URL(uri).hostname || 'Source';
                      if (!accumulatedSources.some(s => s.uri === uri)) {
                        accumulatedSources.push({ title, uri });
                      }
                    }
                  });
                }

                if (parsed.text) {
                  aiText += parsed.text;
                  setSessions(prev =>
                    prev.map(s =>
                      s.id === currentSessionId
                        ? {
                            ...s,
                            messages: s.messages.map(m =>
                              m.id === aiMsgId 
                                ? { 
                                    ...m, 
                                    text: aiText,
                                    groundingSources: accumulatedSources.length > 0 ? [...accumulatedSources] : m.groundingSources
                                  } 
                                : m
                            ),
                          }
                        : s
                    )
                  );
                } else if (parsed.error) {
                  streamError = new Error(parsed.error);
                }
              } catch (e) {
                // Ignore chunk parse errors safely
              }
            }
          }
          if (streamError) {
            break;
          }
        }
      }

      if (streamError) {
        throw streamError;
      }

      playSound('/audio/rounded.ogg');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[Gemini Stream Stopped by User]');
        return;
      }
      console.error('[Gemini API Stream Error]:', err);
      const errText = err.message || 'An error occurred. Please check your internet connection or server configurations.';

      setSessions(prev =>
        prev.map(s =>
          s.id === currentSessionId
            ? {
                ...s,
                messages: s.messages.map(m =>
                  m.id === aiMsgId ? { ...m, text: errText } : m
                ),
              }
            : s
        )
      );
      playSound('/audio/exit.ogg');
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSuggestionClick = (text: string) => {
    onSendMessage(text, []);
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    playSound('/audio/exit.ogg');
  };

  const handleClearAllChats = () => {
    // Abort and stop any active AI response streaming
    handleStopStreaming();
    
    // Explicitly delete keys from localStorage to prevent any race condition or persistence carryover
    try {
      localStorage.removeItem('claude_chat_sessions');
      localStorage.removeItem('claude_active_session_id');
    } catch (e) {
      console.error('Failed to clear localStorage keys:', e);
    }

    // Reset React state arrays
    setSessions([]);
    setActiveSessionId(null);
  };

  const activeSession = getActiveSession();

  return (
    <div className="flex h-screen overflow-hidden bg-claude-bg text-claude-text" id="app-root-container">
      {/* Sidebar Navigation */}
      <Sidebar
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectSession={setActiveSessionId}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onRenameSession={handleRenameSession}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        userEmail={userEmail}
        onOpenSettings={() => setSettingsOpen(true)}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
      />

      {/* Conditional Workspace Core */}
      {activeTab === 'chat' ? (
        <ChatBox
          messages={activeSession ? activeSession.messages : []}
          onSendMessage={onSendMessage}
          isStreaming={isStreaming}
          onSuggestionClick={handleSuggestionClick}
          selectedModel={activeSession ? activeSession.model : 'gemini-3.5-flash'}
          onModelChange={handleModelChangeOnActiveSession}
          searchGrounding={activeSession ? !!activeSession.searchGrounding : false}
          onSearchGroundingChange={handleToggleSearchGroundingOnActiveSession}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          userEmail={userEmail}
          onOpenSettings={() => setSettingsOpen(true)}
          onStopStreaming={handleStopStreaming}
          hasActiveSession={!!activeSession}
          onDeleteActiveSession={() => activeSession && handleDeleteSession(activeSession.id)}
        />
      ) : activeTab === 'stocks' ? (
        <FinanceDashboard
          onSendMessage={(text) => {
            setActiveTab('chat');
            onSendMessage(text, []);
          }}
          userEmail={userEmail}
          onGoBackToChat={() => {
            setActiveTab('chat');
            playSound('/audio/rounded.ogg');
          }}
        />
      ) : (
        <GithubWorkspace />
      )}

      {/* Preferences & Settings overlay dialog */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        soundsEnabled={soundsEnabled}
        setSoundsEnabled={setSoundsEnabled}
        voiceEnabled={voiceEnabled}
        setVoiceEnabled={setVoiceEnabled}
        userEmail={userEmail}
        setUserEmail={setUserEmail}
        onClearAllChats={handleClearAllChats}
      />
    </div>
  );
}
