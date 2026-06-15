import React, { useState, useMemo } from 'react';
import { Copy, Check, Download, AlignLeft, ChevronDown, ChevronUp, FileCode, Play, X, Maximize2 } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language: string;
  key?: any;
}

// ─── Minimal token-based syntax highlighter ──────────────────────────────────
type TokenType = 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'operator' | 'type' | 'plain';
interface Token { type: TokenType; value: string }

const LANG_KEYWORDS: Record<string, string[]> = {
  javascript: ['const','let','var','function','return','if','else','for','while','class','import','export','default','async','await','try','catch','throw','new','typeof','instanceof','in','of','null','undefined','true','false','this','super','extends','static','break','continue','switch','case','void'],
  typescript: ['const','let','var','function','return','if','else','for','while','class','import','export','default','async','await','try','catch','throw','new','typeof','instanceof','in','of','null','undefined','true','false','this','super','extends','static','break','continue','switch','case','void','type','interface','enum','namespace','declare','readonly','abstract','implements','private','public','protected','keyof','infer','never','any','unknown'],
  python: ['def','class','if','elif','else','for','while','try','except','finally','import','from','return','yield','with','as','pass','break','continue','lambda','and','or','not','in','is','None','True','False','raise','global','nonlocal','del','assert','async','await'],
  kotlin: ['fun','val','var','class','object','interface','if','else','for','while','when','return','import','package','null','true','false','override','private','public','protected','internal','companion','data','sealed','abstract','open','in','out','is','as','by','init','constructor','super','this','throw','try','catch','finally','suspend','coroutine','lazy'],
  java: ['class','interface','public','private','protected','static','final','void','return','if','else','for','while','do','switch','case','break','continue','new','null','true','false','this','super','extends','implements','import','package','try','catch','finally','throw','throws','abstract','synchronized','volatile','transient','native'],
  rust: ['fn','let','mut','pub','use','mod','struct','enum','impl','trait','if','else','for','while','loop','match','return','break','continue','in','as','where','type','self','super','crate','true','false','const','static','move','ref','box','dyn','async','await'],
  go: ['func','var','const','type','struct','interface','if','else','for','range','return','break','continue','switch','case','default','import','package','go','chan','select','defer','nil','true','false','make','new','len','cap','append','copy','delete'],
  sql: ['SELECT','FROM','WHERE','JOIN','LEFT','RIGHT','INNER','OUTER','ON','INSERT','INTO','UPDATE','SET','DELETE','CREATE','TABLE','INDEX','DROP','ALTER','ADD','COLUMN','PRIMARY','KEY','FOREIGN','REFERENCES','GROUP BY','ORDER BY','HAVING','LIMIT','OFFSET','AS','AND','OR','NOT','IN','IS','NULL','DISTINCT','COUNT','SUM','AVG','MAX','MIN','LIKE','EXISTS','UNION','WITH'],
  bash: ['if','then','else','fi','for','do','done','while','case','esac','function','return','echo','exit','export','local','readonly','source','alias','cd','ls','grep','awk','sed','cat','chmod','sudo'],
  css: ['@import','@media','@keyframes','@font-face','@supports','!important'],
};

const TYPES = ['string','number','boolean','void','any','never','unknown','object','symbol','bigint','int','float','double','char','bool','list','dict','tuple','set','Array','Promise','Map','Set','Record','Partial','Required','Readonly'];

function tokenize(code: string, lang: string): Token[] {
  const keywords = new Set([...(LANG_KEYWORDS[lang] || []), ...(LANG_KEYWORDS['javascript'] || [])]);
  const typeSet = new Set(TYPES);
  const tokens: Token[] = [];
  const lines = code.split('\n');

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    let i = 0;
    if (li > 0) tokens.push({ type: 'plain', value: '\n' });

    while (i < line.length) {
      // Comments
      if ((lang === 'python' || lang === 'bash' || lang === 'ruby') && line[i] === '#') {
        tokens.push({ type: 'comment', value: line.slice(i) });
        i = line.length;
        continue;
      }
      if (line[i] === '/' && line[i + 1] === '/') {
        tokens.push({ type: 'comment', value: line.slice(i) });
        i = line.length;
        continue;
      }
      if (line[i] === '/' && line[i + 1] === '*') {
        const end = line.indexOf('*/', i + 2);
        if (end !== -1) {
          tokens.push({ type: 'comment', value: line.slice(i, end + 2) });
          i = end + 2;
        } else {
          tokens.push({ type: 'comment', value: line.slice(i) });
          i = line.length;
        }
        continue;
      }
      if (line[i] === '-' && line[i + 1] === '-') {
        tokens.push({ type: 'comment', value: line.slice(i) });
        i = line.length;
        continue;
      }
      // Strings
      if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
        const q = line[i];
        let j = i + 1;
        while (j < line.length && line[j] !== q) {
          if (line[j] === '\\') j++;
          j++;
        }
        tokens.push({ type: 'string', value: line.slice(i, j + 1) });
        i = j + 1;
        continue;
      }
      // Numbers
      if (/[0-9]/.test(line[i]) && (i === 0 || !/[a-zA-Z_]/.test(line[i - 1]))) {
        let j = i;
        while (j < line.length && /[0-9._x]/.test(line[j])) j++;
        tokens.push({ type: 'number', value: line.slice(i, j) });
        i = j;
        continue;
      }
      // Words (keywords, types, functions)
      if (/[a-zA-Z_$]/.test(line[i])) {
        let j = i;
        while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
        const word = line.slice(i, j);
        const isCall = j < line.length && line[j] === '(';
        let type: TokenType = 'plain';
        if (keywords.has(word)) type = 'keyword';
        else if (typeSet.has(word)) type = 'type';
        else if (isCall) type = 'function';
        tokens.push({ type, value: word });
        i = j;
        continue;
      }
      // Operators
      if (/[+\-*/%=<>!&|^~?:]/.test(line[i])) {
        let j = i;
        while (j < line.length && /[+\-*/%=<>!&|^~?:]/.test(line[j])) j++;
        tokens.push({ type: 'operator', value: line.slice(i, j) });
        i = j;
        continue;
      }
      tokens.push({ type: 'plain', value: line[i] });
      i++;
    }
  }
  return tokens;
}

const TOKEN_COLORS: Record<TokenType, string> = {
  keyword:  '#C792EA',
  string:   '#C3E88D',
  comment:  '#546E7A',
  number:   '#F78C6C',
  function: '#82AAFF',
  operator: '#89DDFF',
  type:     '#FFCB6B',
  plain:    '#D4D4D4',
};

// ─── Language metadata ────────────────────────────────────────────────────────
const LANG_META: Record<string, { label: string; color: string; canPreview: boolean }> = {
  javascript: { label: 'JavaScript', color: '#F7DF1E', canPreview: false },
  typescript: { label: 'TypeScript', color: '#3178C6', canPreview: false },
  tsx:        { label: 'TSX',        color: '#3178C6', canPreview: false },
  jsx:        { label: 'JSX',        color: '#61DAFB', canPreview: false },
  python:     { label: 'Python',     color: '#3776AB', canPreview: false },
  html:       { label: 'HTML',       color: '#E34F26', canPreview: true  },
  css:        { label: 'CSS',        color: '#1572B6', canPreview: false },
  rust:       { label: 'Rust',       color: '#CE412B', canPreview: false },
  go:         { label: 'Go',         color: '#00ADD8', canPreview: false },
  java:       { label: 'Java',       color: '#007396', canPreview: false },
  kotlin:     { label: 'Kotlin',     color: '#7F52FF', canPreview: false },
  json:       { label: 'JSON',       color: '#B5CEA8', canPreview: false },
  markdown:   { label: 'Markdown',   color: '#4A90D9', canPreview: false },
  shell:      { label: 'Shell',      color: '#4EAA25', canPreview: false },
  bash:       { label: 'Bash',       color: '#4EAA25', canPreview: false },
  sql:        { label: 'SQL',        color: '#FF6B6B', canPreview: false },
  yaml:       { label: 'YAML',       color: '#CB171E', canPreview: false },
  xml:        { label: 'XML',        color: '#F97316', canPreview: false },
  swift:      { label: 'Swift',      color: '#FA7343', canPreview: false },
  dart:       { label: 'Dart',       color: '#0175C2', canPreview: false },
  cpp:        { label: 'C++',        color: '#00599C', canPreview: false },
  c:          { label: 'C',          color: '#A8B9CC', canPreview: false },
  php:        { label: 'PHP',        color: '#777BB4', canPreview: false },
};

export default function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isWrapped, setIsWrapped] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const lang = language?.toLowerCase() || '';
  const meta = LANG_META[lang] || { label: lang ? (lang.charAt(0).toUpperCase() + lang.slice(1)) : 'Code', color: '#999', canPreview: false };
  const lines = code.split('\n');
  const isLongCode = lines.length > 15;
  const displayLines = isCollapsed && isLongCode ? lines.slice(0, 10) : lines;

  // Tokenize for syntax highlighting
  const tokens = useMemo(() => {
    if (!lang || lang === 'text' || lang === 'plaintext') return null;
    try { return tokenize(displayLines.join('\n'), lang); } catch { return null; }
  }, [displayLines, lang]);

  const playSound = (soundFile: string) => {
    const soundsEnabled = localStorage.getItem('claude_sounds_enabled') !== 'false';
    if (!soundsEnabled) return;
    try {
      const audio = new Audio();
      audio.src = soundFile;
      audio.volume = 0.25;
      audio.play().catch(() => {});
    } catch {}
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      playSound('/audio/rounded.ogg');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const extensionMap: Record<string, string> = {
    javascript: 'js', typescript: 'ts', tsx: 'tsx', jsx: 'jsx',
    python: 'py', html: 'html', css: 'css', rust: 'rs', go: 'go',
    java: 'java', kotlin: 'kt', json: 'json', markdown: 'md',
    shell: 'sh', bash: 'sh', sql: 'sql', yaml: 'yaml', xml: 'xml',
    swift: 'swift', dart: 'dart', cpp: 'cpp', c: 'c', php: 'php',
  };

  const handleDownload = () => {
    const ext = extensionMap[lang] || 'txt';
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `gemclaude_snippet.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    playSound('/audio/enter.ogg');
  };

  const renderHighlighted = () => {
    if (!tokens) {
      return (
        <code className="text-[#D4D4D4]">
          {displayLines.join('\n')}
        </code>
      );
    }
    return (
      <code>
        {tokens.map((token, idx) => (
          <span key={idx} style={{ color: TOKEN_COLORS[token.type] }}>
            {token.value}
          </span>
        ))}
        {isCollapsed && isLongCode && (
          <span className="block mt-2 text-[#546E7A] italic text-[10px]">
            ... {lines.length - 10} more lines hidden ...
          </span>
        )}
      </code>
    );
  };

  return (
    <>
      <div className="my-4 font-mono text-xs rounded-xl overflow-hidden border border-[#2E2B25] shadow-lg w-full max-w-full min-w-0 bg-[#0E0E10]" id="code-block-container">
        
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-3 py-2 bg-[#1A1A1F] border-b border-[#2E2B25] select-none">
          {/* Language badge */}
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: meta.color }} />
            <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: meta.color }}>
              {meta.label}
            </span>
            <span className="text-[10px] text-[#4F4F54] font-mono hidden sm:inline">
              {lines.length} {lines.length === 1 ? 'line' : 'lines'}
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            {/* Collapse/Expand */}
            {isLongCode && (
              <button
                onClick={() => { setIsCollapsed(!isCollapsed); playSound('/audio/glassy.ogg'); }}
                className="px-2 py-1 hover:bg-[#27272A] rounded-lg text-[#6B665E] hover:text-[#D4D4D4] transition-colors cursor-pointer flex items-center gap-1 text-[10px] font-bold"
                title={isCollapsed ? 'Expand Code' : 'Collapse Code'}
              >
                {isCollapsed ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                <span className="hidden sm:inline">{isCollapsed ? 'EXPAND' : 'COLLAPSE'}</span>
              </button>
            )}

            {/* Word Wrap */}
            <button
              onClick={() => { setIsWrapped(!isWrapped); playSound('/audio/rounded.ogg'); }}
              className={`px-2 py-1 rounded-lg transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1 ${
                isWrapped ? 'bg-amber-500/15 text-amber-400' : 'hover:bg-[#27272A] text-[#6B665E] hover:text-[#D4D4D4]'
              }`}
              title="Toggle Word Wrap"
            >
              <AlignLeft className="w-3 h-3" />
              <span className="hidden sm:inline">WRAP</span>
            </button>

            {/* HTML Preview */}
            {meta.canPreview && (
              <button
                onClick={() => { setShowPreview(true); playSound('/audio/glassy.ogg'); }}
                className="px-2 py-1 hover:bg-emerald-500/15 rounded-lg text-[#6B665E] hover:text-emerald-400 transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1"
                title="Live Preview"
              >
                <Play className="w-3 h-3" />
                <span className="hidden sm:inline">PREVIEW</span>
              </button>
            )}

            {/* Download */}
            <button
              onClick={handleDownload}
              className="px-2 py-1 hover:bg-[#27272A] rounded-lg text-[#6B665E] hover:text-[#D4D4D4] transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1"
              title="Download file"
            >
              <Maximize2 className="w-3 h-3" />
              <span className="hidden sm:inline">SAVE</span>
            </button>

            {/* Copy */}
            <button
              onClick={handleCopy}
              className={`px-2 py-1 rounded-lg transition-all cursor-pointer text-[10px] font-bold flex items-center gap-1 ${
                copied
                  ? 'bg-emerald-500/15 text-emerald-400'
                  : 'hover:bg-[#27272A] text-[#6B665E] hover:text-[#D4D4D4]'
              }`}
              title="Copy code"
            >
              {copied ? (
                <><Check className="w-3 h-3" /><span>COPIED!</span></>
              ) : (
                <><Copy className="w-3 h-3" /><span>COPY</span></>
              )}
            </button>
          </div>
        </div>

        {/* ── Code Area ── */}
        <div className="relative font-mono w-full min-w-0">
          <div className="flex bg-[#0E0E10] text-slate-100 overflow-hidden w-full min-w-0">
            {/* Line numbers */}
            <div className="py-4 select-none border-r border-[#1E1E22] bg-[#0A0A0C] text-[#3A3A3F] text-right font-mono text-[10px] leading-relaxed min-w-[40px] px-2.5 shrink-0">
              {displayLines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
              {isCollapsed && isLongCode && <div className="text-[#2A2A2F]">···</div>}
            </div>

            {/* Code with syntax highlighting */}
            <pre
              className={`flex-1 py-4 px-4 overflow-x-auto leading-relaxed text-left font-mono select-text min-w-0 text-[11px] ${
                isWrapped ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
              }`}
              style={{ WebkitOverflowScrolling: 'touch', background: '#0E0E10' }}
            >
              {renderHighlighted()}
            </pre>
          </div>

          {/* Collapsed overlay */}
          {isCollapsed && isLongCode && (
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0E0E10] to-transparent flex items-end justify-center pb-2 select-none">
              <button
                onClick={() => { setIsCollapsed(false); playSound('/audio/glassy.ogg'); }}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-[10px] font-bold rounded-lg shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <ChevronDown className="w-3 h-3" />
                SHOW ALL {lines.length} LINES
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Live HTML Preview Modal ── */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4" id="html-preview-modal">
          <div className="bg-[#191816] border border-[#2E2B25] rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#2E2B25] shrink-0">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-[#FCFBF9]">Live HTML Preview</span>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1.5 hover:bg-[#2E2B25] rounded-lg text-[#999288] hover:text-[#FCFBF9] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 bg-white overflow-hidden">
              <iframe
                srcDoc={code}
                title="HTML Preview"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
