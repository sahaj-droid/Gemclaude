import React, { useState } from 'react';
import { Copy, Check, Download, AlignLeft, ChevronDown, ChevronUp, FileCode } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language: string;
  key?: any;
}

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isWrapped, setIsWrapped] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const lines = code.split('\n');
  const isLongCode = lines.length > 15;
  const displayLines = isCollapsed && isLongCode ? lines.slice(0, 10) : lines;

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
      audio.volume = 0.25;
      audio.play().catch(() => {});
    } catch (e) {}
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      playSound('/audio/rounded.ogg');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const extensionMap: Record<string, string> = {
    javascript: 'js',
    typescript: 'ts',
    tsx: 'tsx',
    jsx: 'jsx',
    python: 'py',
    html: 'html',
    css: 'css',
    rust: 'rs',
    go: 'go',
    java: 'java',
    kotlin: 'kt',
    json: 'json',
    markdown: 'md',
    shell: 'sh',
    bash: 'sh',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    xml: 'xml',
  };

  const handleDownload = () => {
    const ext = extensionMap[language.toLowerCase()] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `snippet_${Math.random().toString(36).substring(7)}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    playSound('/audio/enter.ogg');
  };

  const formatLanguage = (lang: string) => {
    if (!lang) return 'Code';
    if (lang.toLowerCase() === 'js') return 'JavaScript';
    if (lang.toLowerCase() === 'ts') return 'TypeScript';
    if (lang.length <= 4) return lang.toUpperCase();
    return lang.charAt(0).toUpperCase() + lang.slice(1);
  };

  return (
    <div className="my-4 font-mono text-xs rounded-xl overflow-hidden border border-claude-border shadow-sm w-full max-w-full min-w-0 bg-[#18181B]" id="code-block-container">
      {/* Code Header Controls */}
      <div className="flex items-center justify-between px-4 py-2 bg-claude-card border-b border-claude-border select-none" id="code-block-header">
        <div className="flex items-center gap-2 text-claude-secondary">
          <FileCode className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[10px] font-bold tracking-wider uppercase text-claude-text">
            {formatLanguage(language)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Collapse/Expand Toggle */}
          {isLongCode && (
            <button
              onClick={() => {
                setIsCollapsed(!isCollapsed);
                playSound('/audio/glassy.ogg');
              }}
              className="p-1 hover:bg-claude-border rounded-lg text-claude-secondary hover:text-claude-text transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold"
              title={isCollapsed ? "Expand Code" : "Collapse Code"}
            >
              {isCollapsed ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  <span>EXPAND</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  <span>COLLAPSE</span>
                </>
              )}
            </button>
          )}

          {/* Word Wrap Toggle */}
          <button
            onClick={() => {
              setIsWrapped(!isWrapped);
              playSound('/audio/rounded.ogg');
            }}
            className={`p-1 hover:bg-claude-border rounded-lg text-[#999288] hover:text-[#FCFBF9] transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1 ${
              isWrapped ? 'bg-amber-500/10 text-amber-500' : ''
            }`}
            title="Toggle Word Wrap"
          >
            <AlignLeft className="w-3.5 h-3.5" />
            <span>WRAP</span>
          </button>

          {/* Download Script */}
          <button
            onClick={handleDownload}
            className="p-1 hover:bg-claude-border rounded-lg text-[#999288] hover:text-[#FCFBF9] transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1"
            title="Download snippet"
          >
            <Download className="w-3.5 h-3.5" />
            <span>SAVE</span>
          </button>

          {/* Copy Snippet */}
          <button
            onClick={handleCopy}
            className="p-1 hover:bg-claude-border rounded-lg text-[#999288] hover:text-[#FCFBF9] transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1"
            title="Copy snippet"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500 animate-scale-up" />
                <span className="text-emerald-500">COPIED</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>COPY</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Code Area with Line Numbers */}
      <div className="relative font-mono w-full min-w-0" id="code-content-wrapper">
        <div className="flex bg-[#121214] text-slate-100 overflow-hidden w-full min-w-0">
          {/* Gutter Line Numbers */}
          <div className="py-4 select-none border-r border-[#27272A] bg-[#0E0E10] text-[#4F4F54] text-right font-mono text-[10px] leading-relaxed min-w-[36px] px-2.5 shrink-0">
            {displayLines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
            {isCollapsed && isLongCode && <div>...</div>}
          </div>

          {/* Main Code Line Panel */}
          <pre 
            className={`flex-1 py-4 px-4 bg-[#121214] overflow-x-auto text-slate-150 leading-relaxed text-left font-mono select-text min-w-0 ${
              isWrapped ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
            }`}
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <code>
              {displayLines.join('\n')}
              {isCollapsed && isLongCode && (
                <div className="mt-2 text-claude-secondary italic select-none text-[10px]">
                  ... code collapsed ({lines.length - 10} more lines) ...
                </div>
              )}
            </code>
          </pre>
        </div>

        {/* Collapsed Overlay Trigger */}
        {isCollapsed && isLongCode && (
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#121214] to-transparent flex items-end justify-center pb-2 select-none">
            <button
              onClick={() => {
                setIsCollapsed(false);
                playSound('/audio/glassy.ogg');
              }}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-lg shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer flex items-center gap-1"
            >
              <ChevronDown className="w-3 h-3 animate-bounce" />
              <span>SHOW ENTIRE CODE ({lines.length} LINES)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
