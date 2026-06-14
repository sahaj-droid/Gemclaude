import React, { useState } from 'react';
import { X, Volume2, VolumeX, Headphones, User, Trash2, HelpCircle, Sparkles, Check, Languages } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  soundsEnabled: boolean;
  setSoundsEnabled: (enabled: boolean) => void;
  voiceEnabled: boolean;
  setVoiceEnabled: (enabled: boolean) => void;
  userEmail: string;
  setUserEmail: (email: string) => void;
  onClearAllChats: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  soundsEnabled,
  setSoundsEnabled,
  voiceEnabled,
  setVoiceEnabled,
  userEmail,
  setUserEmail,
  onClearAllChats,
}: SettingsModalProps) {
  const [emailInput, setEmailInput] = useState(userEmail);
  const [isSaved, setIsSaved] = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  if (!isOpen) return null;

  const handleSaveEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailInput.trim()) {
      setUserEmail(emailInput.trim());
      setIsSaved(true);
      playSound('/audio/rounded.ogg');
      setTimeout(() => setIsSaved(false), 2000);
    }
  };

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
      audio.volume = 0.25;
      audio.play().catch(() => {});
    } catch { }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-fade-in" id="settings-modal-backdrop">
      <div 
        className="bg-claude-bg border border-claude-border rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
        id="settings-modal-container"
      >
        {/* Header */}
        <div className="p-5 border-b border-claude-border flex items-center justify-between bg-claude-card">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-500/10 text-amber-600 rounded-xl">
              <Sparkles className="w-5 h-5" />
            </span>
            <h2 className="font-serif font-bold text-lg text-claude-text">
              Settings & Preferences
            </h2>
          </div>
          <button 
            onClick={() => {
              onClose();
              playSound('/audio/glassy.ogg');
            }}
            className="p-1.5 hover:bg-claude-border rounded-lg text-claude-secondary hover:text-claude-text transition-colors cursor-pointer"
            title="Close dialog"
            id="settings-close-button"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm text-claude-text">
          
          {/* User Profile Section */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold font-mono tracking-wider text-claude-secondary uppercase flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              <span>User Profile</span>
            </h3>
            <form onSubmit={handleSaveEmail} className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="yours@example.com"
                className="flex-1 bg-white border border-claude-border rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-amber-500 focus:border-amber-500 focus:outline-none"
                id="settings-email-input"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs rounded-xl cursor-pointer transition-colors shrink-0 shadow-sm flex items-center gap-1"
              >
                {isSaved ? <Check className="w-3.5 h-3.5" /> : 'Save'}
              </button>
            </form>
          </div>

          <hr className="border-claude-border" />

          {/* Sound, Voice, Accessibility Options */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold font-mono tracking-wider text-claude-secondary uppercase">
              Audio & Accessibility
            </h3>

            {/* Sound Toggles */}
            <div className="flex items-center justify-between bg-claude-card/50 p-3 rounded-xl border border-claude-border/50">
              <div className="space-y-0.5">
                <span className="block font-medium text-xs text-claude-text">Interface Sound Effects</span>
                <span className="block text-[10px] text-claude-secondary">Play subtle glassy audios on inputs and toggles</span>
              </div>
              <button
                onClick={() => {
                  const next = !soundsEnabled;
                  setSoundsEnabled(next);
                  if (next) {
                    try {
                      const isHeadless = typeof navigator !== 'undefined' && 
                        (navigator.webdriver || /HeadlessChrome|Headless|jsdom/i.test(navigator.userAgent));
                      if (!isHeadless) {
                        const a = new Audio('/audio/rounded.ogg');
                        a.onerror = (e) => {
                          try {
                            if (typeof e === 'object' && e && 'preventDefault' in e) {
                              (e as any).preventDefault();
                            }
                          } catch {}
                        };
                        if (a.canPlayType && a.canPlayType('audio/ogg') !== '') {
                          a.volume = 0.2;
                          a.play().catch(() => {});
                        }
                      }
                    } catch {}
                  }
                }}
                className={`p-2 rounded-xl transition-all border cursor-pointer ${
                  soundsEnabled 
                    ? 'bg-amber-500/10 border-amber-500 text-amber-600' 
                    : 'bg-white border-claude-border text-claude-secondary'
                }`}
                id="settings-toggle-sounds"
              >
                {soundsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </div>

            {/* TTS Toggles */}
            <div className="flex items-center justify-between bg-claude-card/50 p-3 rounded-xl border border-claude-border/50">
              <div className="space-y-0.5">
                <span className="block font-medium text-xs text-claude-text">Auto TTS voice reader</span>
                <span className="block text-[10px] text-claude-secondary">Receive audible output speech for assistant messages</span>
              </div>
              <button
                onClick={() => {
                  setVoiceEnabled(!voiceEnabled);
                  playSound('/audio/rounded.ogg');
                }}
                className={`p-2 rounded-xl transition-all border cursor-pointer ${
                  voiceEnabled 
                    ? 'bg-purple-500/10 border-purple-500 text-purple-600' 
                    : 'bg-white border-claude-border text-claude-secondary'
                }`}
                id="settings-toggle-tts"
              >
                <Headphones className="w-4 h-4" />
              </button>
            </div>
          </div>

          <hr className="border-claude-border" />

          {/* System Actions Area */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold font-mono tracking-wider text-red-700 uppercase">
              Danger Zone
            </h3>
            <div className="bg-red-50/50 border border-red-100 rounded-xl p-3.5 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <span className="block font-bold text-red-800 text-xs text-left">Clear All Chat Histories</span>
                  <span className="block text-[10px] text-red-700/80 leading-normal text-left">
                    This deletes all sessions from your local computer profile.
                  </span>
                </div>
                {!showConfirmClear && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowConfirmClear(true);
                      playSound('/audio/exit.ogg');
                    }}
                    className="px-3.5 py-2 bg-red-650 hover:bg-red-700 text-white border border-red-650 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1 shrink-0"
                    id="settings-clear-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete All</span>
                  </button>
                )}
              </div>
              
              {showConfirmClear && (
                <div className="bg-red-100 border border-red-200 rounded-xl p-3 flex flex-col gap-2.5 animate-fade-in animate-duration-200" id="settings-clear-confirm-card">
                  <p className="text-xs font-bold text-red-800 text-left">
                    Are you absolutely sure? This action is permanent and cannot be undone.
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowConfirmClear(false);
                        playSound('/audio/glassy.ogg');
                      }}
                      className="px-3 py-1.5 bg-white border border-red-200 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-semibold cursor-pointer transition-all"
                      id="settings-clear-cancel"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClearAllChats();
                        playSound('/audio/exit.ogg');
                        setShowConfirmClear(false);
                        onClose();
                      }}
                      className="px-3 py-1.5 bg-red-700 text-white hover:bg-red-800 rounded-lg text-xs font-bold cursor-pointer transition-all shadow-sm flex items-center gap-1"
                      id="settings-clear-confirm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Yes, Delete All Chats</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Footer Area */}
        <div className="p-4 bg-claude-card border-t border-claude-border flex justify-end">
          <button
            onClick={() => {
              onClose();
              playSound('/audio/glassy.ogg');
            }}
            className="px-4 py-2 bg-claude-text text-white hover:bg-claude-text/90 font-bold text-xs rounded-xl cursor-pointer shadow-sm transition-all"
            id="settings-save-and-close"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
