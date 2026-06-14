import React, { useState } from 'react';
import { MessageSquare, Plus, Trash2, PanelLeftClose, PanelLeft, Bot, MessageCircleCode, Check, Edit2, Settings, TrendingUp, X, Github } from 'lucide-react';
import { ChatSession, ModelType } from '../types';

interface SidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, newTitle: string) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  userEmail: string;
  onOpenSettings: () => void;
  activeTab: 'chat' | 'stocks' | 'github';
  onChangeTab: (tab: 'chat' | 'stocks' | 'github') => void;
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
  onRenameSession,
  sidebarOpen,
  onToggleSidebar,
  userEmail,
  onOpenSettings,
  activeTab,
  onChangeTab,
}: SidebarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleMobileClose = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768 && sidebarOpen) {
      onToggleSidebar();
    }
  };

  const playSound = (soundFile: string) => {
    const soundsEnabled = localStorage.getItem('claude_sounds_enabled') !== 'false';
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
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch (e) {}
  };

  const handleStartRename = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(session.id);
    setRenameText(session.title);
  };

  const handleSaveRename = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (renameText.trim()) {
      onRenameSession(id, renameText.trim());
    }
    setEditingId(null);
    playSound('/audio/rounded.ogg');
  };

  const handleKeyDown = (id: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (renameText.trim()) {
        onRenameSession(id, renameText.trim());
      }
      setEditingId(null);
      playSound('/audio/rounded.ogg');
    } else if (e.key === 'Escape') {
      setEditingId(null);
    }
  };

  if (!sidebarOpen) {
    return (
      <button
        onClick={() => {
          onToggleSidebar();
          playSound('/audio/glassy.ogg');
        }}
        className="fixed top-3 left-3 p-2 bg-claude-bg border border-claude-border rounded-xl text-claude-secondary hover:text-claude-text hover:bg-claude-card transition-all shadow-sm z-30 cursor-pointer hidden md:flex items-center justify-center"
        title="Open sidebar"
        id="sidebar-open-trigger"
      >
        <PanelLeft className="w-5 h-5" />
      </button>
    );
  }

  return (
    <>
      {/* Mobile touch backdrop to close sidebar on click outside */}
      <div 
        onClick={() => {
          onToggleSidebar();
          playSound('/audio/glassy.ogg');
        }}
        className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-xs cursor-pointer"
        id="sidebar-mobile-backdrop"
      />
      <div
        className="w-72 bg-[#191816] text-[#E6E1DA] h-full flex flex-col border-r border-[#2E2B25] shrink-0 z-50 md:z-30 fixed md:relative select-none"
        id="sidebar-panel"
      >
      {/* Top Brand area */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-[#2E2B25] shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-amber-500 fill-amber-500/10" />
          <span className="font-serif font-semibold text-[#FCFBF9] text-base tracking-wide">
            Claude
          </span>
          <span className="text-[9px] px-1.5 py-0.5 roundedbg-[#2E2B25] text-amber-500 border border-amber-500/20 font-bold tracking-widest uppercase">
            Gemini
          </span>
        </div>
        <button
          onClick={() => {
            onToggleSidebar();
            playSound('/audio/user_input_end.ogg');
          }}
          className="p-1.5 hover:bg-[#2E2B25] rounded-lg transition-colors text-[#999288] hover:text-[#FCFBF9] cursor-pointer"
          title="Collapse sidebar"
          id="sidebar-close-trigger"
        >
          <PanelLeftClose className="w-5 h-5" />
        </button>
      </div>

      {/* Primary Workspaces Tab Selector */}
      <div className="px-3.5 pt-3.5 space-y-1.5 shrink-0 border-b border-[#2E2B25] pb-3.5">
        <button
          onClick={() => {
            onChangeTab('chat');
            playSound('/audio/rounded.ogg');
            handleMobileClose();
          }}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl font-medium text-xs transition-all duration-150 cursor-pointer ${
            activeTab === 'chat'
              ? 'bg-amber-600 text-[#FCFBF9] shadow-sm font-semibold'
              : 'hover:bg-white/5 text-[#999288] hover:text-[#FCFBF9]'
          }`}
        >
          <Bot className="w-4 h-4 shrink-0" />
          <span>AI Chat Assistant</span>
        </button>

        <button
          onClick={() => {
            onChangeTab('stocks');
            playSound('/audio/rounded.ogg');
            handleMobileClose();
          }}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl font-medium text-xs transition-all duration-150 cursor-pointer ${
            activeTab === 'stocks'
              ? 'bg-amber-600 text-[#FCFBF9] shadow-sm font-semibold'
              : 'hover:bg-white/5 text-[#999288] hover:text-[#FCFBF9]'
          }`}
        >
          <TrendingUp className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">Finance India Terminal</span>
          <span className="text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-500 px-1.5 py-0.5 rounded-full font-bold font-mono tracking-wider">
            LIVE
          </span>
        </button>

        <button
          onClick={() => {
            onChangeTab('github');
            playSound('/audio/rounded.ogg');
            handleMobileClose();
          }}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl font-medium text-xs transition-all duration-150 cursor-pointer ${
            activeTab === 'github'
              ? 'bg-amber-600 text-[#FCFBF9] shadow-sm font-semibold'
              : 'hover:bg-white/5 text-[#999288] hover:text-[#FCFBF9]'
          }`}
        >
          <Github className="w-4 h-4 shrink-0" />
          <span className="flex-1 text-left">GitHub Workspace</span>
          <span className="text-[9px] bg-violet-500/20 border border-violet-500/35 text-violet-400 px-1.5 py-0.5 rounded-full font-bold font-mono tracking-wider">
            SYNC
          </span>
        </button>
      </div>
      <div className="p-3.5 shrink-0">
        <button
          onClick={() => {
            onNewChat();
            playSound('/audio/enter.ogg');
            handleMobileClose();
          }}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-transparent hover:bg-white/5 border border-[#403B31] hover:border-[#FCFBF9]/30 rounded-xl font-medium text-sm transition-all duration-200 cursor-pointer text-[#FCFBF9]"
          id="sidebar-new-chat-btn"
        >
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#999288]" />
            <span>Start a new chat</span>
          </div>
          <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-0.5 rounded border border-[#2E2B25] bg-[#22201D] px-1.5 font-mono text-[9px] font-medium text-[#c3cbb5] opacity-100">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Scrollable List of Chats */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-1" id="sessions-scrollable-container">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4 text-center mt-8">
            <MessageCircleCode className="w-8 h-8 text-[#999288] mb-3 opacity-30" />
            <p className="text-xs font-semibold text-[#FCFBF9] mb-1">
              Your chats list is empty
            </p>
            <p className="text-[10px] text-[#999288] max-w-[180px] leading-relaxed">
              Start conversations. They will sync securely in your local system.
            </p>
          </div>
        ) : (
          sessions.map(session => {
            const isActive = session.id === activeSessionId;
            const isEditing = session.id === editingId;

            return (
              <div
                key={session.id}
                onClick={() => {
                  if (!isEditing) {
                    onSelectSession(session.id);
                    playSound('/audio/rounded.ogg');
                    handleMobileClose();
                  }
                }}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all duration-150 relative ${
                  isActive
                    ? 'bg-[#2E2B25] text-[#FCFBF9] font-medium'
                    : 'hover:bg-[#22201D] text-[#999288] hover:text-[#E6E1DA]'
                }`}
                id={`sidebar-item-${session.id}`}
              >
                <MessageSquare className={`w-4 h-4 shrink-0 ${isActive ? 'text-amber-500' : 'text-[#6B665E]'}`} />
                
                {isEditing ? (
                  <input
                    type="text"
                    value={renameText}
                    onChange={(e) => setRenameText(e.target.value)}
                    onKeyDown={(e) => handleKeyDown(session.id, e)}
                    className="flex-1 bg-[#191816] text-[#FCFBF9] border border-amber-500/40 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
                    autoFocus
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span className="flex-1 text-xs truncate break-all leading-normal pr-8">
                    {session.title || 'Untitled Chat'}
                  </span>
                )}

                {/* Inline Controls (Rename/Delete) */}
                {!isEditing && (
                  <div className="absolute right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 flex items-center gap-1 transition-opacity duration-150 animate-fade-in">
                    {deleteConfirmId === session.id ? (
                      <div className="flex items-center gap-1 bg-[#221313] border border-red-900/40 rounded px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                        <span className="text-[10px] text-red-400 font-bold select-none pr-1">Sure?</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                            setDeleteConfirmId(null);
                            playSound('/audio/exit.ogg');
                          }}
                          className="p-0.5 hover:bg-red-900 text-red-400 hover:text-[#FCFBF9] rounded transition-colors cursor-pointer"
                          title="Yes, delete"
                          id={`sidebar-confirm-delete-${session.id}`}
                        >
                          <Check className="w-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          className="p-0.5 hover:bg-[#3d382e] text-[#999288] hover:text-[#FCFBF9] rounded transition-colors cursor-pointer"
                          title="Cancel"
                          id={`sidebar-cancel-delete-${session.id}`}
                        >
                          <X className="w-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={(e) => handleStartRename(session, e)}
                          className="p-1 hover:bg-[#3d382e] rounded text-[#999288] hover:text-[#FCFBF9] transition-colors cursor-pointer"
                          title="Rename"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(session.id);
                            playSound('/audio/exit.ogg');
                          }}
                          className="p-1 hover:bg-red-950/40 rounded text-[#999288] hover:text-red-430 transition-colors cursor-pointer"
                          title="Delete chat"
                          id={`sidebar-delete-trigger-${session.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                )}

                {isEditing && (
                  <button
                    onClick={(e) => handleSaveRename(session.id, e)}
                    className="p-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 rounded shrink-0 cursor-pointer"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Profile tray */}
      <div className="p-3.5 border-t border-[#2E2B25] bg-[#1d1b19] shrink-0">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8.5 h-8.5 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold text-xs shadow-md border border-amber-400/20 shrink-0">
              {userEmail ? userEmail.charAt(0).toUpperCase() : 'S'}
            </div>
            <div className="min-w-0">
              <span className="block text-xs font-semibold text-[#FCFBF9] truncate">
                {userEmail || 'Sahaj'}
              </span>
              <span className="block text-[10px] text-[#999288] truncate font-mono">
                verified account
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              onOpenSettings();
              playSound('/audio/glassy.ogg');
            }}
            className="p-2 hover:bg-[#2E2B25] text-[#999288] hover:text-[#FCFBF9] rounded-xl transition-colors cursor-pointer shrink-0"
            title="Account Preferences"
            id="sidebar-settings-btn"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </>
  );
}
