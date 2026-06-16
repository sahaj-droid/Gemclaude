import React, { useState, useEffect, useRef } from 'react';
import { AlertCircle, ExternalLink, RefreshCw, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import ChatBox from './components/ChatBox';
import SettingsModal from './components/SettingsModal';
import FinanceDashboard from './components/FinanceDashboard';
import GithubWorkspace from './components/GithubWorkspace';
import GoogleWorkspace from './components/GoogleWorkspace';
import ImagenStudio from './components/ImagenStudio';
import { ChatSession, Message, Attachment, ModelType } from './types';
import { 
  collection, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  writeBatch 
} from 'firebase/firestore';
import { 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  hasValidConfig,
  handleFirestoreError,
  OperationType 
} from './firebase';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeSessionMessages, setActiveSessionMessages] = useState<Message[]>([]);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>('');
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  const onFirestoreError = (err: any, op: OperationType, path: string) => {
    try {
      handleFirestoreError(err, op, path);
    } catch (e: any) {
      setFirestoreError(e.message || String(e));
    }
  };

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
  const [activeTab, setActiveTab] = useState<'chat' | 'stocks' | 'github' | 'google'>('chat');
  
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

  // Listen to Auth State Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser && currentUser.email) {
        setUserEmail(currentUser.email);
      }
    });
    return unsubscribe;
  }, []);

  // Sync state to local storage (only when offline/no authenticated user)
  useEffect(() => {
    if (!user) {
      localStorage.setItem('claude_chat_sessions', JSON.stringify(sessions));
    }
  }, [sessions, user]);

  useEffect(() => {
    if (!user) {
      const saved = localStorage.getItem('claude_chat_sessions');
      if (saved) {
        try {
          setSessions(JSON.parse(saved));
        } catch (e) {}
      } else {
        setSessions([]);
      }
      return;
    }

    const q = query(
      collection(db, 'sessions'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sessionsList: ChatSession[] = [];
      snapshot.forEach((sessionDoc) => {
        const data = sessionDoc.data();
        sessionsList.push({
          id: sessionDoc.id,
          title: data.title || 'Untitled Chat',
          messages: [],
          model: data.model || 'gemini-3.5-flash',
          createdAt: data.createdAt || Date.now(),
          searchGrounding: data.searchGrounding || false,
        });
      });

      // Sort client-side by createdAt descending to avoid composite index requirement
      sessionsList.sort((a, b) => b.createdAt - a.createdAt);

      setSessions(sessionsList);

      // Reset activeSessionId if it's not valid anymore
      if (activeSessionId && !sessionsList.some(s => s.id === activeSessionId)) {
        if (sessionsList.length > 0) {
          setActiveSessionId(sessionsList[0].id);
        } else {
          setActiveSessionId(null);
        }
      }
    }, (error) => {
      onFirestoreError(error, OperationType.GET, 'sessions');
    });

    return unsubscribe;
  }, [user]);

  // Subscribe to the active session's messages in real-time
  useEffect(() => {
    if (!user || !activeSessionId) {
      setActiveSessionMessages([]);
      return;
    }

    const msgsQuery = query(
      collection(db, 'sessions', activeSessionId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(msgsQuery, (snapshot) => {
      const messages = snapshot.docs.map(doc => doc.data() as Message);
      setActiveSessionMessages(messages);
    }, (err) => {
      console.error("Error loading messages: ", err);
    });

    return unsubscribe;
  }, [user, activeSessionId]);

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

  // Handle active session calculation (including real-time streaming text overlays)
  const getActiveSession = (): ChatSession | null => {
    const session = sessions.find(s => s.id === activeSessionId);
    if (!session) return null;

    let messages = session.messages;
    if (user) {
      messages = activeSessionMessages;
    }

    if (streamingMessageId) {
      messages = messages.map(m =>
        m.id === streamingMessageId ? { ...m, text: streamingText } : m
      );
    }

    return { ...session, messages };
  };

  const handleNewChat = async () => {
    const newSessionId = 'session-' + Math.random().toString(36).substring(7);
    const newSession: ChatSession = {
      id: newSessionId,
      title: 'New Chat',
      messages: [],
      model: 'gemini-3.5-flash',
      createdAt: Date.now(),
    };

    if (user) {
      try {
        await setDoc(doc(db, 'sessions', newSessionId), {
          id: newSessionId,
          title: 'New Chat',
          model: 'gemini-3.5-flash',
          createdAt: Date.now(),
          userId: user.uid,
          searchGrounding: false,
        });
      } catch (err) {
        onFirestoreError(err, OperationType.WRITE, `sessions/${newSessionId}`);
      }
    } else {
      setSessions(prev => [newSession, ...prev]);
    }
    setActiveSessionId(newSessionId);
  };

  const handleDeleteSession = async (id: string) => {
    if (user) {
      try {
        // Delete all messages subcollection items
        const msgsRef = collection(db, 'sessions', id, 'messages');
        const msgsSnap = await getDocs(msgsRef);
        
        const batch = writeBatch(db);
        msgsSnap.docs.forEach((doc) => {
          batch.delete(doc.ref);
        });
        
        // Delete parent session
        batch.delete(doc(db, 'sessions', id));
        await batch.commit();

        if (activeSessionId === id) {
          setActiveSessionId(null);
        }
      } catch (err) {
        onFirestoreError(err, OperationType.DELETE, `sessions/${id}`);
      }
    } else {
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
    }
  };

  const handleRenameSession = async (id: string, newTitle: string) => {
    if (user) {
      try {
        await updateDoc(doc(db, 'sessions', id), { title: newTitle });
      } catch (err) {
        onFirestoreError(err, OperationType.UPDATE, `sessions/${id}`);
      }
    } else {
      setSessions(prev =>
        prev.map(s => (s.id === id ? { ...s, title: newTitle } : s))
      );
    }
  };

  const handleModelChangeOnActiveSession = async (newModel: ModelType) => {
    if (!activeSessionId) return;

    if (user) {
      try {
        await updateDoc(doc(db, 'sessions', activeSessionId), { model: newModel });
      } catch (err) {
        onFirestoreError(err, OperationType.UPDATE, `sessions/${activeSessionId}`);
      }
    } else {
      setSessions(prev =>
        prev.map(s => (s.id === activeSessionId ? { ...s, model: newModel } : s))
      );
    }
    playSound('/audio/rounded.ogg');
  };

  const handleToggleSearchGroundingOnActiveSession = async () => {
    if (!activeSessionId) return;

    const currentSession = getActiveSession();
    if (!currentSession) return;

    const nextSearchGrounding = !currentSession.searchGrounding;
    let nextModel = currentSession.model;
    if (nextSearchGrounding) {
      if (currentSession.model === 'gemini-3.5-flash' || currentSession.model === 'gemini-3.1-flash-lite') {
        nextModel = 'models/gemini-2.5-flash-lite';
      }
    } else {
      if (currentSession.model !== 'gemini-3.5-flash' && currentSession.model !== 'gemini-3.1-flash-lite') {
        nextModel = 'gemini-3.5-flash';
      }
    }

    if (user) {
      try {
        await updateDoc(doc(db, 'sessions', activeSessionId), {
          searchGrounding: nextSearchGrounding,
          model: nextModel
        });
      } catch (err) {
        onFirestoreError(err, OperationType.UPDATE, `sessions/${activeSessionId}`);
      }
    } else {
      setSessions(prev =>
        prev.map(s =>
          s.id === activeSessionId
            ? { ...s, searchGrounding: nextSearchGrounding, model: nextModel }
            : s
        )
      );
    }
    playSound('/audio/rounded.ogg');
  };

  const onSendMessage = async (text: string, attachments: Attachment[]) => {
    if (!text.trim() && attachments.length === 0) return;

    let currentSessionId = activeSessionId;
    let currentSessions = [...sessions];

    // Create a new session automatically if none are active
    if (!currentSessionId) {
      currentSessionId = 'session-' + Math.random().toString(36).substring(7);
      if (user) {
        try {
          await setDoc(doc(db, 'sessions', currentSessionId), {
            id: currentSessionId,
            title: text.trim().slice(0, 36) || 'New Chat',
            model: 'gemini-3.5-flash',
            createdAt: Date.now(),
            userId: user.uid,
            searchGrounding: false,
          });
        } catch (err) {
          onFirestoreError(err, OperationType.WRITE, `sessions/${currentSessionId}`);
        }
      } else {
        const newSession: ChatSession = {
          id: currentSessionId,
          title: text.trim().slice(0, 36) || 'New Chat',
          messages: [],
          model: 'gemini-3.5-flash',
          createdAt: Date.now(),
        };
        currentSessions = [newSession, ...currentSessions];
        setSessions(currentSessions);
      }
      setActiveSessionId(currentSessionId);
    }

    // Append the user message
    const userMsgId = 'msg-' + Math.random().toString(36).substring(7);
    const userMsg: Message = {
      id: userMsgId,
      role: 'user',
      text: text,
      timestamp: Date.now(),
      attachments: attachments,
    };

    const targetSession = sessions.find(s => s.id === currentSessionId) || currentSessions.find(s => s.id === currentSessionId);
    if (!user && !targetSession) return;

    const isFirstUserMessage = user 
      ? activeSessionMessages.length === 0 
      : (targetSession ? targetSession.messages.length === 0 : true);

    const updatedMessages = user 
      ? [...activeSessionMessages, userMsg] 
      : [...(targetSession ? targetSession.messages : []), userMsg];

    if (user) {
      try {
        await setDoc(doc(db, 'sessions', currentSessionId, 'messages', userMsgId), userMsg);
        if (isFirstUserMessage) {
          await updateDoc(doc(db, 'sessions', currentSessionId), {
            title: text.trim().slice(0, 36) || 'New Chat'
          });
        }
      } catch (err) {
        onFirestoreError(err, OperationType.WRITE, `sessions/${currentSessionId}/messages/${userMsgId}`);
      }
    } else {
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
    }

    setIsStreaming(true);
    setToolStatus(null);
    playSound('/audio/user_input_end.ogg');

    // Append empty AI message placeholder
    const aiMsgId = 'msg-' + Math.random().toString(36).substring(7);
    const aiMsg: Message = {
      id: aiMsgId,
      role: 'assistant',
      text: '',
      timestamp: Date.now(),
    };

    if (user) {
      try {
        await setDoc(doc(db, 'sessions', currentSessionId, 'messages', aiMsgId), aiMsg);
      } catch (err) {
        onFirestoreError(err, OperationType.WRITE, `sessions/${currentSessionId}/messages/${aiMsgId}`);
      }
    } else {
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
    }

    let aiText = '';
    const accumulatedSources: { title: string; uri: string }[] = [];
    let streamError: Error | null = null;

    // Initialize AbortController for cancelable streaming
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Use overlay state during streaming so we don't spam Firestore updates
    setStreamingMessageId(aiMsgId);
    setStreamingText('');

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
                  setStreamingText(aiText);

                  if (!user) {
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
                  }
                } else if (parsed.tool_status) {
                  setToolStatus(parsed.tool_status);
                } else if (parsed.tool_completed) {
                  setToolStatus(null);
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

      setToolStatus(null);

      if (streamError) {
        throw streamError;
      }

      // Finish streaming, persist final message to Firestore
      if (user) {
        try {
          await updateDoc(doc(db, 'sessions', currentSessionId, 'messages', aiMsgId), {
            text: aiText,
            groundingSources: accumulatedSources
          });
        } catch (err) {
          onFirestoreError(err, OperationType.UPDATE, `sessions/${currentSessionId}/messages/${aiMsgId}`);
        }
      }

      playSound('/audio/rounded.ogg');
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[Gemini Stream Stopped by User]');
        return;
      }
      console.error('[Gemini API Stream Error]:', err);
      const errText = err.message || 'An error occurred. Please check your internet connection or server configurations.';

      if (user) {
        try {
          await updateDoc(doc(db, 'sessions', currentSessionId, 'messages', aiMsgId), {
            text: errText
          });
        } catch (dbErr) {
          console.error("Failed to write error text to Firestore: ", dbErr);
        }
      } else {
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
      }
      playSound('/audio/exit.ogg');
    } finally {
      setIsStreaming(false);
      setStreamingMessageId(null);
      setStreamingText('');
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

  const handleSignIn = async () => {
    try {
      setAuthError(null);
      setFirestoreError(null);
      await signInWithPopup(auth, googleProvider);
      playSound('/audio/rounded.ogg');
    } catch (err: any) {
      console.error("Google Sign-In Error: ", err);
      setAuthError(err.message || String(err));
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      playSound('/audio/exit.ogg');
    } catch (err: any) {
      console.error("Google Sign-Out Error: ", err);
    }
  };

  const activeSession = getActiveSession();

  // Extract index creation details if present
  let simpleDbError = '';
  let indexCreationUrl = '';
  let isIndexErr = false;

  if (firestoreError) {
    try {
      const idx = firestoreError.indexOf('{');
      if (idx !== -1) {
        const parsed = JSON.parse(firestoreError.substring(idx));
        simpleDbError = parsed.error || '';
      } else {
        simpleDbError = firestoreError;
      }
    } catch (_) {
      simpleDbError = firestoreError;
    }

    if (simpleDbError.toLowerCase().includes('index') && (simpleDbError.toLowerCase().includes('create it here') || simpleDbError.toLowerCase().includes('indexes?create_composite'))) {
      isIndexErr = true;
      const urlMatch = simpleDbError.match(/https?:\/\/[^\s",\\}]+/g);
      if (urlMatch && urlMatch.length > 0) {
        indexCreationUrl = urlMatch[0].trim();
      }
    }
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-claude-bg text-claude-text" id="app-root-container">
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
        user={user}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      {/* Conditional Workspace Core */}
      {activeTab === 'chat' ? (
        <ChatBox
          messages={activeSession ? activeSession.messages : []}
          onSendMessage={onSendMessage}
          isStreaming={isStreaming}
          toolStatus={toolStatus}
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
      ) : activeTab === 'github' ? (
        <GithubWorkspace 
          onGoBackToChat={() => {
            setActiveTab('chat');
            playSound('/audio/rounded.ogg');
          }}
        />
      ) : (
        <GoogleWorkspace
          onGoBackToChat={() => {
            setActiveTab('chat');
            playSound('/audio/rounded.ogg');
          }}
          googleClientId={(import.meta as any).env?.VITE_GOOGLE_CLIENT_ID}
        />
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
        user={user}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      {/* Dynamic Authentication Troubleshooting Dialog */}
      {authError && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in" id="auth-error-troubleshoot-modal">
          <div className="bg-[#191816] border-2 border-amber-600/40 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[95vh] text-[#E6E1DA]" id="auth-error-card">
            {/* Header */}
            <div className="p-5 border-b border-[#2E2B25] flex items-start gap-4 bg-[#21201D]/55">
              <span className="p-3 bg-red-950/40 border border-red-500/30 text-amber-500 rounded-2xl shadow-inner shrink-0 animate-pulse">
                <AlertCircle className="w-6 h-6 text-amber-500" />
              </span>
              <div className="space-y-1">
                <h2 className="font-serif font-black text-xl text-[#FCFBF9] tracking-tight leading-snug">
                  Authentication Activation Required
                </h2>
                <span className="inline-block text-[10px] font-mono bg-red-900/20 border border-red-900/45 text-amber-500/90 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Firebase Action Needed
                </span>
              </div>
            </div>

            {/* Error Message & Checklist */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm leading-relaxed">
              <div className="bg-[#22201D] border border-[#2E2B25] p-4 rounded-xl space-y-2">
                <span className="block text-xs font-bold font-mono text-[#999288] uppercase tracking-wider">
                  Underlying Error Returned:
                </span>
                <p className="text-xs text-red-400 font-mono bg-black/40 p-2.5 rounded-lg border border-red-950/40 select-text overflow-x-auto whitespace-pre-wrap max-h-32">
                  {authError}
                </p>
              </div>

              {authError.includes('auth/configuration-not-found') ? (
                <div className="space-y-4">
                  <p className="text-xs text-[#999288]">
                    This occurs because the <strong className="text-amber-500">Google Sign-In provider</strong> is disabled under Authentication settings in your Firebase project (<span className="text-[#FCFBF9] font-semibold">{auth.app.options.projectId || 'gemclaude-1'}</span>). Follow these simple steps to activate it:
                  </p>

                  <div className="space-y-3 font-medium text-xs">
                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 font-extrabold text-[11px] shrink-0 font-mono">1</span>
                      <p className="text-[#E6E1DA] text-left leading-relaxed">
                        Open the Firebase Authentication console for your project using this direct link:
                        <a 
                          href={`https://console.firebase.google.com/project/${auth.app.options.projectId || 'gemclaude-1'}/authentication/providers`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-[11px] hover:shadow-md transition-all self-start cursor-pointer no-underline"
                        >
                          <span>Open Firebase Console</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>

                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 font-extrabold text-[11px] shrink-0 font-mono">2</span>
                      <p className="text-[#999288] text-xs text-left leading-normal">
                        Click <strong className="text-[#FCFBF9]">Add new provider</strong> (or click Google if it shows in your lists) and click <strong className="text-[#FCFBF9]">Google</strong>.
                      </p>
                    </div>

                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 font-extrabold text-[11px] shrink-0 font-mono">3</span>
                      <p className="text-[#999288] text-xs text-left leading-normal">
                        Toggle the <strong className="text-[#FCFBF9]">Enable</strong> state, supply standard values for <strong className="text-[#FCFBF9]">Project support email</strong> and user configuration, then click <strong className="text-[#FCFBF9]">Save</strong>.
                      </p>
                    </div>

                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 font-extrabold text-[11px] shrink-0 font-mono">4</span>
                      <p className="text-[#999288] text-xs text-left leading-normal">
                        Once saved in your Firebase console, return here and retry connecting!
                      </p>
                    </div>
                  </div>
                </div>
              ) : authError.includes('auth/unauthorized-domain') ? (
                <div className="space-y-4">
                  <p className="text-xs text-[#999288]">
                    This application's domain is not yet allowlisted in your Firebase Project (<span className="text-[#FCFBF9] font-semibold">{auth.app.options.projectId || 'gemclaude-1'}</span>). Firebase Auth blocks OAuth flow on unrecognized domains. Follow these steps to allowlist it:
                  </p>

                  <div className="space-y-3 font-medium text-xs">
                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 font-extrabold text-[11px] shrink-0 font-mono">1</span>
                      <p className="text-[#E6E1DA] text-left leading-relaxed">
                        Copy the current domain of this application:
                        <code className="block mt-2 font-mono text-[11px] bg-black/50 text-amber-400 p-2 rounded-md border border-amber-900/30 select-all font-bold">
                          {window.location.hostname}
                        </code>
                        {window.location.hostname.includes('ais-dev') && (
                          <span className="block mt-2 text-[10px] text-[#999288]">
                            Tip: You may also want to allowlist the production preview domain: <code className="text-amber-400 font-mono font-bold select-all">ais-pre-7yjlvk5g5wfn73pwq5xe2i-352564614585.asia-southeast1.run.app</code>
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 font-extrabold text-[11px] shrink-0 font-mono">2</span>
                      <p className="text-[#E6E1DA] text-left leading-relaxed">
                        Open the Firebase Authentication Settings console:
                        <a 
                          href={`https://console.firebase.google.com/project/${auth.app.options.projectId || 'gemclaude-1'}/authentication/settings`}
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-[11px] hover:shadow-md transition-all self-start cursor-pointer no-underline"
                        >
                          <span>Open Auth Settings</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </p>
                    </div>

                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 font-extrabold text-[11px] shrink-0 font-mono">3</span>
                      <p className="text-[#999288] text-xs text-left leading-normal">
                        Under the <strong className="text-[#FCFBF9]">Authorized domains</strong> section, click <strong className="text-[#FCFBF9]">Add domain</strong>.
                      </p>
                    </div>

                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-500 font-extrabold text-[11px] shrink-0 font-mono">4</span>
                      <p className="text-[#999288] text-xs text-left leading-normal">
                        Paste the domain (e.g., <code className="text-[#FCFBF9] font-mono">{window.location.hostname}</code>) and click <strong className="text-[#FCFBF9]">Add</strong>. Once saved, return here and try logging in again!
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-[#999288]">
                    This could be due to a temporary network block, missing API access restrictions, or third-party cookies disabled within your iframe sandbox.
                  </p>
                  <p className="text-xs text-[#999288]">
                    Consider logging in while running this application in a new, un-sandboxed tab, or check your console workspace.
                  </p>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="p-4 bg-[#21201D]/55 border-t border-[#2E2B25] flex items-center justify-between gap-3 shrink-0">
              <button
                onClick={() => setAuthError(null)}
                className="px-4 py-2 hover:bg-[#2E2B25] border border-[#2E2B25] text-[#999288] hover:text-[#FCFBF9] text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Dismiss Mode
              </button>
              <button
                onClick={() => {
                  setAuthError(null);
                  handleSignIn();
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-100 transition-all"
                id="auth-error-retry-btn"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>Retry Connection</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Firestore Error Troubleshooting Dialog */}
      {firestoreError && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-fade-in" id="firestore-error-troubleshoot-modal">
          <div className="bg-[#191816] border-2 border-red-500/30 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[95vh] text-[#E6E1DA]" id="firestore-error-card">
            {/* Header */}
            <div className="p-5 border-b border-[#2E2B25] flex items-start gap-4 bg-[#21201D]/55">
              <span className="p-3 bg-red-950/40 border border-red-500/30 text-red-400 rounded-2xl shadow-inner shrink-0 animate-pulse">
                <AlertCircle className="w-6 h-6" />
              </span>
              <div className="space-y-1">
                <h2 className="font-serif font-black text-xl text-[#FCFBF9] tracking-tight leading-snug">
                  {isIndexErr ? 'Composite Index Creation Required' : 'Database Connection Issue'}
                </h2>
                <span className="inline-block text-[10px] font-mono bg-red-900/20 border border-red-900/45 text-red-400 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Firestore Integration
                </span>
              </div>
            </div>

            {/* Error Message & Checklist */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm leading-relaxed">
              <div className="bg-[#22201D] border border-[#2E2B25] p-4 rounded-xl space-y-2">
                <span className="block text-xs font-bold font-mono text-[#999288] uppercase tracking-wider">
                  Database Error Message:
                </span>
                <p className="text-xs text-red-400 font-mono bg-black/40 p-2.5 rounded-lg border border-red-950/40 select-text overflow-x-auto whitespace-pre-wrap max-h-32">
                  {simpleDbError}
                </p>
              </div>

              {isIndexErr ? (
                <div className="space-y-4">
                  <p className="text-xs text-[#999288]">
                    This query filters on <code className="text-[#FCFBF9] font-mono px-1 py-0.5 bg-white/5 rounded">userId</code> and sorts by <code className="text-[#FCFBF9] font-mono px-1 py-0.5 bg-white/5 rounded">createdAt desc</code>. Firestore requires a composite index for this sorting pattern. You can create the index in seconds:
                  </p>

                  <div className="space-y-3 font-medium text-xs">
                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 font-extrabold text-[11px] shrink-0 font-mono">1</span>
                      <p className="text-[#E6E1DA] text-left leading-relaxed">
                        To easily initialize this index on your Firebase Project (<span className="text-[#FCFBF9] font-semibold">{auth.app.options.projectId || 'gemclaude-1'}</span>), click the direct dashboard link below:
                        {indexCreationUrl ? (
                          <a 
                            href={indexCreationUrl}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-[11px] hover:shadow-md transition-all self-start cursor-pointer no-underline"
                          >
                            <span>Create Composite Index</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="block text-amber-500 font-bold mt-1">Please consult your Firebase Console Indexes section for sessions collection.</span>
                        )}
                      </p>
                    </div>

                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 font-extrabold text-[11px] shrink-0 font-mono">2</span>
                      <p className="text-[#999288] text-xs text-left leading-normal">
                        Inside the Firebase console, review the settings and click <strong className="text-[#FCFBF9]">Create index</strong>.
                      </p>
                    </div>

                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 font-extrabold text-[11px] shrink-0 font-mono">3</span>
                      <p className="text-[#999288] text-xs text-left leading-normal">
                        Wait 1 to 2 minutes for Firebase to complete building and deploying the index.
                      </p>
                    </div>

                    <div className="flex gap-3 items-start bg-white/5 p-3 rounded-xl border border-white/5">
                      <span className="flex items-center justify-center w-5 h-5 rounded-md bg-red-500/10 border border-red-500/30 text-red-400 font-extrabold text-[11px] shrink-0 font-mono">4</span>
                      <p className="text-[#999288] text-xs text-left leading-normal">
                        Once the status transitions to <strong className="text-green-500">Active</strong>, return to this tab and dismiss/retry.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-[#999288]">
                    This database error may stem from a Firestore rules policy block, unrecognized references, or client permissions.
                  </p>
                  <p className="text-xs text-[#999288]">
                    Ensure your database rules in <code className="text-[#FCFBF9] font-mono">firestore.rules</code> permit read/write access for your current user account, or click dismiss to fallback.
                  </p>
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="p-4 bg-[#21201D]/55 border-t border-[#2E2B25] flex items-center justify-between gap-3 shrink-0">
              <button
                onClick={() => setFirestoreError(null)}
                className="px-4 py-2 hover:bg-[#2E2B25] border border-[#2E2B25] text-[#999288] hover:text-[#FCFBF9] text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                Dismiss & Use Offline Storage
              </button>
              <button
                onClick={() => {
                  setFirestoreError(null);
                  // Refresh active user state to trigger re-fetch of sessions
                  const current = auth.currentUser;
                  if (current) {
                    setUser(null);
                    setTimeout(() => setUser(current), 50);
                  }
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-100 transition-all"
                id="firestore-error-refresh-btn"
              >
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span>Retry Loading State</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
