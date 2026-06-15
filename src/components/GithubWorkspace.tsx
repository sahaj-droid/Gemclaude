import React, { useState, useEffect } from 'react';
import { 
  Github, 
  Search, 
  Folder, 
  File, 
  ArrowLeft, 
  Sparkles, 
  Code, 
  Eye, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  LogOut, 
  ExternalLink,
  ChevronRight,
  GitBranch,
  Save,
  MessageSquare,
  Wand2,
  FileCode,
  CheckCircle2,
  ListRestart,
  Brain
} from 'lucide-react';
import CodeBlock from './CodeBlock';

interface GithubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string;
  html_url: string;
}

interface GithubRepo {
  name: string;
  owner: {
    login: string;
  };
  description: string;
  default_branch: string;
  full_name: string;
}

interface FileItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
  url: string;
}

interface GithubWorkspaceProps {
  onGoBackToChat?: () => void;
}

export default function GithubWorkspace({ onGoBackToChat }: GithubWorkspaceProps) {
  // Auth state
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('github_oauth_token') || null;
  });
  const [manualToken, setManualToken] = useState('');
  const [user, setUser] = useState<GithubUser | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [authUrlInfo, setAuthUrlInfo] = useState<{ url: string; redirectUri: string; hasCredentials: boolean } | null>(null);

  // Repos & Workspace state
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<GithubRepo | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('main');
  const [repoSearch, setRepoSearch] = useState('');

  // File browser state
  const [currentPath, setCurrentPath] = useState<string>(''); // empty means root
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  
  // Active file content & editing
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState(false);
  const [editingContent, setEditingContent] = useState<string>('');
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Commits & PRs state
  const [commitMessage, setCommitMessage] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitSuccess, setCommitSuccess] = useState<string | null>(null);
  const [pullRequests, setPullRequests] = useState<any[]>([]);
  const [loadingPRs, setLoadingPRs] = useState(false);

  // Gemini Code Review
  const [aiReview, setAiReview] = useState<string | null>(() => {
    return null;
  });
  const [reviewing, setReviewing] = useState(false);
  const [customInstructions, setCustomInstructions] = useState('');
  const [highThinking, setHighThinking] = useState(true);
  
  // Mobile active layout tab configuration
  const [mobileTab, setMobileTab] = useState<'files' | 'editor' | 'review'>('files');
  
  // Feedback
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
        return; 
      }
      audio.src = soundFile;
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch (e) {}
  };

  // 1. Fetch OAuth URL from server
  useEffect(() => {
    if (!token) {
      fetch('/api/auth/github/url')
        .then(res => res.json())
        .then(data => {
          setAuthUrlInfo(data);
        })
        .catch(err => {
          console.error('Failed to load GitHub oauth URL:', err);
        });
    }
  }, [token]);

  // 2. Fetch User Details if Token exists
  useEffect(() => {
    if (token) {
      setLoadingUser(true);
      setErrorMsg(null);
      fetch('/api/github/user', {
        headers: { 'X-GitHub-Token': token }
      })
        .then(async res => {
          if (!res.ok) {
            throw new Error(`Auth expired: ${res.statusText}`);
          }
          return res.json();
        })
        .then(data => {
          setUser(data);
          loadRepos();
        })
        .catch(err => {
          console.error('GitHub fetch user error:', err);
          setErrorMsg('GitHub connection expired or failed. Please connect again.');
          // Clean up expired token
          localStorage.removeItem('github_oauth_token');
          setToken(null);
        })
        .finally(() => {
          setLoadingUser(false);
        });
    }
  }, [token]);

  // Listen for popup messages
  useEffect(() => {
    const handleOauthMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'GITHUB_OAUTH_SUCCESS' && event.data?.token) {
        playSound('/audio/user_input_end.ogg');
        localStorage.setItem('github_oauth_token', event.data.token);
        setToken(event.data.token);
      }
    };
    window.addEventListener('message', handleOauthMessage);
    return () => window.removeEventListener('message', handleOauthMessage);
  }, []);

  const handleConnect = () => {
    if (!authUrlInfo?.url) {
      setErrorMsg('GitHub API endpoints are loading... Try again in a moment.');
      return;
    }
    playSound('/audio/glassy.ogg');
    const authWindow = window.open(
      authUrlInfo.url,
      'github_oauth_popup',
      'width=600,height=720,scrollbars=yes,resizable=yes'
    );
    if (!authWindow) {
      alert('Popup blocked! Please allow popups to authorize your GitHub account connection.');
    }
  };

  const handleDisconnect = () => {
    playSound('/audio/exit.ogg');
    localStorage.removeItem('github_oauth_token');
    setToken(null);
    setUser(null);
    setSelectedRepo(null);
    setRepos([]);
    setFiles([]);
    setSelectedFile(null);
    setFileContent('');
    setIsEditMode(false);
    setAiReview(null);
  };

  const handleManualTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;
    playSound('/audio/user_input_end.ogg');
    localStorage.setItem('github_oauth_token', manualToken.trim());
    setToken(manualToken.trim());
  };

  // Fetch repos list
  const loadRepos = () => {
    if (!token) return;
    setLoadingRepos(true);
    fetch('/api/github/repos', {
      headers: { 'X-GitHub-Token': token }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRepos(data);
        } else {
          setRepos([]);
        }
      })
      .catch(err => {
        console.error('Load repos error:', err);
      })
      .finally(() => {
        setLoadingRepos(false);
      });
  };

  // Select repo
  const handleSelectRepo = (repo: GithubRepo) => {
    playSound('/audio/rounded.ogg');
    setSelectedRepo(repo);
    setSelectedBranch(repo.default_branch || 'main');
    setCurrentPath('');
    setSelectedFile(null);
    setFileContent('');
    setAiReview(null);
    setIsEditMode(false);
    setMobileTab('files');
    
    // Load branches
    fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/branches`, {
      headers: { 'X-GitHub-Token': token || '' }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setBranches(data.map(b => b.name));
        } else {
          setBranches([repo.default_branch || 'main']);
        }
      })
      .catch(() => {
        setBranches([repo.default_branch || 'main']);
      });

    // Load file list
    loadFiles(repo, repo.default_branch || 'main', '');
    loadPRs(repo);
  };

  // Fetch file list
  const loadFiles = (repo: GithubRepo, branch: string, path: string) => {
    if (!token) return;
    setLoadingFiles(true);
    setErrorMsg(null);
    
    fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/contents?path=${path}&ref=${branch}`, {
      headers: { 'X-GitHub-Token': token }
    })
      .then(res => {
        if (!res.ok) throw new Error(`Failed to load directory (${res.status})`);
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          // Sort folders first, then files
          const sorted = [...data].sort((a, b) => {
            if (a.type === 'dir' && b.type !== 'dir') return -1;
            if (a.type !== 'dir' && b.type === 'dir') return 1;
            return a.name.localeCompare(b.name);
          });
          setFiles(sorted);
        } else {
          setFiles([]);
        }
      })
      .catch(err => {
        setErrorMsg(`Failed to browse path: ${err.message}`);
        setFiles([]);
      })
      .finally(() => {
        setLoadingFiles(false);
      });
  };

  const handleFolderClick = (dirPath: string) => {
    playSound('/audio/rounded.ogg');
    setCurrentPath(dirPath);
    if (selectedRepo) {
      loadFiles(selectedRepo, selectedBranch, dirPath);
    }
  };

  const handleBreadcrumbClick = (path: string) => {
    playSound('/audio/rounded.ogg');
    setCurrentPath(path);
    if (selectedRepo) {
      loadFiles(selectedRepo, selectedBranch, path);
    }
  };

  // Fetch Pull Requests
  const loadPRs = (repo: GithubRepo) => {
    if (!token) return;
    setLoadingPRs(true);
    fetch(`/api/github/repos/${repo.owner.login}/${repo.name}/pulls`, {
      headers: { 'X-GitHub-Token': token }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setPullRequests(data);
        } else {
          setPullRequests([]);
        }
      })
      .catch(() => {})
      .finally(() => {
        setLoadingPRs(false);
      });
  };

  // Load selected file details
  const handleFileClick = (file: FileItem) => {
    if (!selectedRepo) return;
    playSound('/audio/rounded.ogg');
    setSelectedFile(file);
    setLoadingContent(true);
    setFileContent('');
    setAiReview(null);
    setIsEditMode(false);
    setErrorMsg(null);
    setMobileTab('editor');

    fetch(`/api/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/contents?path=${file.path}&ref=${selectedBranch}`, {
      headers: { 'X-GitHub-Token': token || '' }
    })
      .then(res => res.json())
      .then(data => {
        if (data.content && data.encoding === 'base64') {
          // Decode file content gracefully checking for nested chars if needed
          try {
            const decoded = atob(data.content.replace(/\n/g, ''));
            setFileContent(decoded);
            setEditingContent(decoded);
          } catch (e) {
            // Fallback for utf-8 conversion
            const binString = atob(data.content.replace(/\n/g, ''));
            const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0) || 0);
            const decoded = new TextDecoder().decode(bytes);
            setFileContent(decoded);
            setEditingContent(decoded);
          }
        } else {
          setErrorMsg('File content encoding is unsupported or empty.');
        }
      })
      .catch(err => {
        setErrorMsg(`Failed to retrieve file content: ${err.message}`);
      })
      .finally(() => {
        setLoadingContent(false);
      });
  };

  // Specialized Gemini code evaluation
  const handleAiReview = () => {
    if (!selectedFile || !fileContent) return;
    playSound('/audio/enter.ogg');
    setReviewing(true);
    setAiReview(null);
    setErrorMsg(null);
    setMobileTab('review');

    fetch(`/api/github/repos/${selectedRepo?.owner.login}/${selectedRepo?.name}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: selectedFile.path,
        content: fileContent,
        instructions: customInstructions,
        highThinking: highThinking,
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.review) {
          setAiReview(data.review);
          playSound('/audio/user_input_end.ogg');
        } else if (data.error) {
          setErrorMsg(`Gemini Review Failed: ${data.error}`);
        }
      })
      .catch(err => {
        setErrorMsg(`Gemini Connection Error: ${err.message}`);
      })
      .finally(() => {
        setReviewing(false);
      });
  };

  // Automatically parse and extract code from Gemini's markdown response block
  const handleApplyAiOptimizations = () => {
    if (!aiReview) return;
    
    // Look for markdown code blocks matches (e.g. ```typescript ... ``` or ``` ...)
    const regex = /```(?:[a-zA-Z0-9_\-+]+)?\n([\s\S]*?)```/g;
    const matches = [...aiReview.matchAll(regex)];
    
    if (matches && matches.length > 0) {
      // Typically the last or the largest code block is the final refactored code
      let fullCodeBlock = '';
      if (matches.length === 1) {
        fullCodeBlock = matches[0][1];
      } else {
        // Pick the largest codeblock in case of descriptions
        const sortedByLength = matches.map(m => m[1]).sort((a, b) => b.length - a.length);
        fullCodeBlock = sortedByLength[0];
      }
      
      if (fullCodeBlock.trim()) {
        playSound('/audio/glassy.ogg');
        setEditingContent(fullCodeBlock);
        setIsEditMode(true);
        setCommitMessage(`Apply Gemini recommended optimizations for ${selectedFile?.name}`);
        setMobileTab('editor');
        
        // Alert user
        const toast = document.getElementById('apply-success-toast');
        if (toast) {
          toast.classList.remove('opacity-0');
          setTimeout(() => toast.classList.add('opacity-0'), 3000);
        }
      } else {
        setErrorMsg('Could not locate clean code block in Gemini feedback.');
      }
    } else {
      setErrorMsg('No code block patterns found in the AI review markdown.');
    }
  };

  // Commit changes directly back to GitHub
  const handleCommitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRepo || !selectedFile || !editingContent) return;

    playSound('/audio/enter.ogg');
    setCommitting(true);
    setCommitSuccess(null);
    setErrorMsg(null);

    fetch(`/api/github/repos/${selectedRepo.owner.login}/${selectedRepo.name}/contents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-GitHub-Token': token || ''
      },
      body: JSON.stringify({
        path: selectedFile.path,
        content: editingContent,
        message: commitMessage || `Updated ${selectedFile.name} via AI Workspace Terminal`,
        sha: selectedFile.sha,
        branch: selectedBranch
      })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Commit failed');
        }
        return data;
      })
      .then(data => {
        playSound('/audio/user_input_end.ogg');
        const newSha = data.content?.sha || selectedFile.sha;
        
        // Update local file properties & contents
        const updatedFile = { ...selectedFile, sha: newSha };
        setSelectedFile(updatedFile);
        setFileContent(editingContent);
        
        setCommitSuccess(`Successfully committed modifications directly into ${selectedBranch}!`);
        setIsEditMode(false);
        setCommitMessage('');
        
        // Reload directories files list to catch fresh hashes
        loadFiles(selectedRepo, selectedBranch, currentPath);
      })
      .catch(err => {
        setErrorMsg(`Commit Failed: ${err.message}`);
      })
      .finally(() => {
        setCommitting(false);
      });
  };

  // Helper utility breadcrumb structure
  const getBreadcrumbs = () => {
    if (!currentPath) return [];
    const parts = currentPath.split('/');
    return parts.map((name, index) => {
      const path = parts.slice(0, index + 1).join('/');
      return { name, path };
    });
  };

  // Filter repositories
  const filteredRepos = repos.filter(r => 
    r.name.toLowerCase().includes(repoSearch.toLowerCase()) ||
    (r.description && r.description.toLowerCase().includes(repoSearch.toLowerCase()))
  );

  return (
    <div className="flex-1 flex flex-col h-full bg-claude-bg overflow-hidden select-none" id="github-workspace-root">
      
      {/* Toast Notification */}
      <div 
        id="apply-success-toast" 
        className="fixed top-5 right-5 z-50 bg-[#1D1B19] border border-[#F59E0B]/40 text-[#FCFBF9] text-xs px-4 py-3 rounded-xl shadow-2xl transition-opacity duration-300 opacity-0 flex items-center gap-2"
      >
        <Sparkles className="w-4 h-4 text-amber-500 animate-spin" />
        <span className="font-semibold">AI code modifications applied to Editor! Click Commit below to load on GitHub.</span>
      </div>

      {/* Top Section */}
      <div className="h-16 border-b border-[#2E2B25] bg-[#191816]/70 px-4 md:px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 md:gap-3">
          {onGoBackToChat && (
            <button
              onClick={onGoBackToChat}
              className="p-1.5 md:hidden text-[#999288] hover:text-[#FCFBF9] hover:bg-[#2E2B25] rounded-xl transition-all cursor-pointer"
              title="Go back to Home"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-8 h-8 md:w-9 md:h-9 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
            <Github className="w-4 h-4 md:w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-serif font-semibold text-[#FCFBF9] tracking-wide flex items-center gap-2">
              GitHub Sync Workspace
              <span className="text-[9px] bg-violet-500/15 border border-violet-500/30 text-violet-400 px-1.5 py-0.5 rounded-full font-bold font-mono tracking-wider">
                SECURE
              </span>
            </h1>
            <p className="text-[10px] text-claude-secondary">
              Review codebases, audit files with Gemini AI, and directly commit upgrades
            </p>
          </div>
        </div>

        {user && (
          <div className="flex items-center gap-3 animate-fade-in">
            <a 
              href={user.html_url} 
              target="_blank" 
              referrerPolicy="no-referrer"
              className="flex items-center gap-2 bg-[#2E2B25]/40 hover:bg-[#2E2B25] border border-[#2E2B25] p-1.5 pr-3 rounded-xl transition-all cursor-pointer group"
            >
              <img 
                src={user.avatar_url} 
                alt={user.login} 
                className="w-6 h-6 rounded-lg object-cover border border-[#403B31]" 
                referrerPolicy="no-referrer"
              />
              <div className="text-left leading-none">
                <span className="block text-xs font-semibold text-[#FCFBF9] pr-1">{user.name || user.login}</span>
                <span className="text-[9px] text-[#999288] font-mono group-hover:text-amber-500 flex items-center gap-0.5">
                  @{user.login} <ExternalLink className="w-2 h-2" />
                </span>
              </div>
            </a>
            
            <button
              onClick={handleDisconnect}
              className="p-2 border border-red-900/30 hover:border-red-900/60 bg-red-950/10 text-red-400 hover:text-red-300 rounded-xl transition-all cursor-pointer text-xs flex items-center gap-1.5 font-semibold"
              title="Disconnect github sync"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Disconnect</span>
            </button>
          </div>
        )}
      </div>

      {/* Mobile Tab Switcher Navigation */}
      {token && selectedRepo && (
        <div className="flex md:hidden bg-[#161514] border-b border-[#2E2B25] p-2 shrink-0 justify-around select-none gap-2">
          <button
            onClick={() => {
              setMobileTab('files');
              playSound('/audio/rounded.ogg');
            }}
            className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl text-[10px] uppercase font-bold tracking-wider transition-all cursor-pointer ${
              mobileTab === 'files'
                ? 'bg-amber-600/10 text-amber-500 border border-amber-500/20'
                : 'text-[#999288] border border-transparent hover:text-[#FCFBF9]'
            }`}
          >
            <Folder className="w-4 h-4 mb-0.5" />
            <span>Files</span>
          </button>

          <button
            onClick={() => {
              setMobileTab('editor');
              playSound('/audio/rounded.ogg');
            }}
            className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl text-[10px] uppercase font-bold tracking-wider transition-all relative cursor-pointer ${
              mobileTab === 'editor'
                ? 'bg-amber-600/10 text-amber-500 border border-amber-500/20'
                : 'text-[#999288] border border-transparent hover:text-[#FCFBF9]'
            }`}
          >
            <FileCode className="w-4 h-4 mb-0.5" />
            <span className="truncate max-w-[85px] text-center text-[10px]">
              {selectedFile ? selectedFile.name : 'Editor'}
            </span>
            {selectedFile && (
              <span className="absolute top-1 right-3 w-1.5 h-1.5 rounded-full bg-amber-500" />
            )}
          </button>

          <button
            onClick={() => {
              setMobileTab('review');
              playSound('/audio/rounded.ogg');
            }}
            className={`flex-1 flex flex-col items-center justify-center py-2 rounded-xl text-[10px] uppercase font-bold tracking-wider transition-all relative cursor-pointer ${
              mobileTab === 'review'
                ? 'bg-amber-600/10 text-amber-500 border border-amber-500/20'
                : 'text-[#999288] border border-transparent hover:text-[#FCFBF9]'
            }`}
          >
            <Sparkles className="w-4 h-4 mb-0.5" />
            <span>AI Review</span>
            {aiReview && (
              <span className="absolute top-1 right-3 w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            )}
          </button>
        </div>
      )}

      {/* Main Workspace Body */}
      {!token ? (
        /* CONNECT SCREEN */
        <div className="flex-1 flex flex-col items-center justify-start p-6 bg-gradient-to-br from-claude-bg to-[#121110] overflow-y-auto">
          <div className="max-w-xl w-full bg-[#191816] border border-[#2E2B25] rounded-2xl shadow-xl p-8 text-center my-6" id="github-connect-card">
            
            <div className="w-16 h-16 rounded-full bg-violet-500/10 border border-violet-500/25 flex items-center justify-center text-violet-400 mx-auto mb-6">
              <Github className="w-9 h-9" />
            </div>

            <h2 className="text-xl font-serif font-semibold text-[#FCFBF9] mb-3">
              Enable Agentic GitHub Control
            </h2>
            
            <p className="text-xs text-claude-secondary leading-relaxed mb-8">
              Link your secure GitHub account to activate a fully interactive code reviewer. Evaluate branches, explore file directories, let Gemini diagnose optimizations, and write/commit upgrades straight back to GitHub.
            </p>

            {/* TWO METHODS TO CONNECT */}
            <div className="text-left space-y-6">
              
              {/* OPTION B: PASTING TOKEN DIRECTLY */}
              <div className="p-5 rounded-xl border border-[#2E2B25] bg-[#161514] flex flex-col gap-4">
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-500 font-mono tracking-wider block mb-1">Method 1 (Easiest)</span>
                  <h3 className="text-xs font-semibold text-[#FCFBF9] font-sans">Connect using a Personal Access Token (Classic)</h3>
                  <p className="text-[11px] text-[#999288] mt-1 leading-normal">
                    Insert your token directly without configuring server secrets. You can configure this at <a href="https://github.com/settings/tokens/new" target="_blank" rel="noreferrer" className="text-amber-500 hover:underline font-semibold inline-flex items-center gap-0.5">github.com/settings/tokens/new <ExternalLink className="w-2.5 h-2.5" /></a>
                  </p>
                </div>

                {/* Scopes Safety Advisory */}
                <div className="p-3.5 rounded-lg border border-amber-500/15 bg-amber-500/[0.02] text-xs space-y-2 text-[#999288] leading-relaxed">
                  <div className="flex items-center gap-1.5 font-bold text-amber-500 text-[11px]">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Safe Permissions Checklist (સુસંગત સેટિંગ્સ):</span>
                  </div>
                  <ul className="space-y-1.5 text-[11px] font-mono">
                    <li className="flex items-start gap-1.5 text-[#E6E1DA]">
                      <span className="text-emerald-500">✓</span>
                      <span><strong>[Check / Select] repo</strong> (Full control of repos - code commits are done here)</span>
                    </li>
                    <li className="flex items-start gap-1.5 text-[#E6E1DA]">
                      <span className="text-emerald-500">✓</span>
                      <span><strong>[Check / Select] read:user</strong> (Allows fetching your login avatar/ID securely)</span>
                    </li>
                    <li className="flex items-start gap-1.5 text-[#E6E1DA]">
                      <span className="text-emerald-500">✓</span>
                      <span><strong>[Check / Select] user:email</strong> (Optional: read email)</span>
                    </li>
                    <li className="flex items-start gap-1.5 text-red-400">
                      <span className="text-red-500">✗</span>
                      <span>Leave **ALL** other boxes unchecked!</span>
                    </li>
                    <li className="flex items-start gap-1.5 text-amber-500 font-semibold pl-2">
                      <span>•</span>
                      <span>Keep **admin:enterprise**, **manage_billing**, **codespace**, **copilot** entirely unchecked to ensure strictly **FREE limit use** and absolute security of private user settings!</span>
                    </li>
                  </ul>
                </div>

                <form onSubmit={handleManualTokenSubmit} className="flex gap-2.5 mt-1">
                  <input
                    type="password"
                    placeholder="ghp_..."
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    className="flex-1 bg-[#121110] text-[#FCFBF9] text-xs px-3.5 py-2.5 border border-[#2E2B25] rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 placeholder-[#6B665E]"
                  />
                  <button
                    type="submit"
                    disabled={!manualToken.trim()}
                    className="shrink-0 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-semibold text-xs px-4 py-2.5 rounded-xl border border-amber-500/10 transition-all cursor-pointer"
                  >
                    Connect Token
                  </button>
                </form>
              </div>

              {/* OPTION A: OAUTH CLIENT CONFIG (Alternative) */}
              <div className="p-5 rounded-xl border border-[#2E2B25]/50 bg-[#121110]/30 flex flex-col gap-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-violet-400 font-mono tracking-wider block mb-1">Method 2 (Alternative)</span>
                  <h3 className="text-xs font-semibold text-[#FCFBF9] font-sans">Connect using standard GitHub OAuth popup</h3>
                </div>

                {/* Verification Credentials Alert */}
                {!authUrlInfo?.hasCredentials ? (
                  <div className="p-3.5 rounded-lg border border-[#2E2B25] bg-[#161514] text-left text-[11px] text-[#999288] leading-normal space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-[#FCFBF9] mb-1">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>Configure OAuth App in .env</span>
                    </div>
                    <span>To use authorization popups, you must specify GITHUB_CLIENT_ID & GITHUB_CLIENT_SECRET inside your local environment parameters first. Redirect callback:</span>
                    <code className="font-mono bg-[#2E2B25] text-amber-400 p-1 rounded block mt-1 break-all select-all text-[10px]">{authUrlInfo?.redirectUri || 'https://<your-service-url>/api/auth/github/callback'}</code>
                  </div>
                ) : (
                  <div className="p-3.5 rounded-lg border border-emerald-500/20 bg-emerald-500/5 text-left text-xs text-emerald-400 leading-relaxed flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold block mb-1">GitHub API Credentials Configured</span>
                      Ready for popup callback redirection.
                    </div>
                  </div>
                )}

                <button
                  onClick={handleConnect}
                  disabled={loadingUser || !authUrlInfo?.hasCredentials}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 bg-violet-600 hover:bg-violet-500 text-white font-semibold text-xs rounded-xl border border-violet-500/20 transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none`}
                >
                  {loadingUser ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Configuring Workspace Sync...</span>
                    </>
                  ) : (
                    <>
                      <Github className="w-3.5 h-3.5" />
                      <span>Securely Connect via OAuth Popup</span>
                    </>
                  )}
                </button>
              </div>

            </div>

            {errorMsg && (
              <div className="mt-4 p-3 rounded-lg border border-red-900/40 bg-red-950/10 text-red-400 text-xs text-left flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>
        </div>
      ) : !selectedRepo ? (
        /* REPO SEARCH & SELECTOR SCREEN */
        <div className="flex-1 p-6 md:p-8 flex flex-col items-center justify-start overflow-y-auto bg-claude-bg">
          <div className="max-w-2xl w-full flex flex-col gap-6 animate-fade-in" id="github-repo-list-panel">
            
            {/* Header cards */}
            <div className="border border-[#2E2B25] bg-[#191816]/50 rounded-2xl p-6">
              <h2 className="text-base font-serif font-semibold text-[#FCFBF9] mb-1">
                Connected Repositories
              </h2>
              <p className="text-xs text-claude-secondary leading-normal">
                Choose a repository from your GitHub profile to start editing files, reviewing branches, and integrating updates.
              </p>
            </div>

            {/* Filter Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B665E]" />
              <input 
                type="text"
                placeholder="Search repository name, owner, or description..."
                value={repoSearch}
                onChange={(e) => setRepoSearch(e.target.value)}
                className="w-full bg-[#191816] text-[#FCFBF9] pl-10 pr-4 py-3 border border-[#2E2B25] rounded-xl text-xs placeholder-[#6B665E] focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-sm"
              />
            </div>

            {errorMsg && (
              <div className="p-3 border border-red-900/40 bg-red-900/10 text-red-400 text-xs rounded-xl flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Repos Grid */}
            <div className="flex flex-col gap-2 max-h-[420px] overflow-y-auto custom-scrollbar">
              {loadingRepos ? (
                <div className="flex flex-col items-center justify-center py-20 text-[#999288] gap-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
                  <span className="text-xs font-semibold">Synchronizing Repository Catalog...</span>
                </div>
              ) : filteredRepos.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-[#2E2B25] rounded-xl bg-[#191816]/10 text-claude-secondary text-xs">
                  {repoSearch ? 'No matching repositories found.' : 'You do not have any active repositories on this account.'}
                </div>
              ) : (
                filteredRepos.map(repo => (
                  <button
                    key={repo.full_name}
                    onClick={() => handleSelectRepo(repo)}
                    className="w-full flex items-start justify-between text-left p-4 bg-[#191816] hover:bg-[#22201D] border border-[#2E2B25] rounded-xl transition-all cursor-pointer group hover:border-[#FCFBF9]/20"
                  >
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-xs font-semibold text-[#FCFBF9] group-hover:text-amber-500 transition-colors">
                          {repo.name}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#2E2B25] text-[#999288] border border-[#403B31]">
                          {repo.owner.login}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#999288] truncate block max-w-[400px]">
                        {repo.description || 'No description provided.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-[#706B62] font-semibold shrink-0 group-hover:text-[#FCFBF9] transition-colors">
                      <span>Select</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="flex justify-between items-center text-[10px] text-claude-secondary">
              <span className="flex items-center gap-1 font-mono">
                Showing {filteredRepos.length} of {repos.length} total repos
              </span>
              <button 
                onClick={loadRepos}
                className="hover:text-[#FCFBF9] flex items-center gap-1 cursor-pointer font-semibold"
              >
                <RefreshCw className="w-3 h-3" /> Refresh repos list
              </button>
            </div>

          </div>
        </div>
      ) : (
        /* CONNECTED ACTIVE WORKSPACE - BROWSER & REVIEWER cols */
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[#2E2B25]">
          
          {/* LEFT PANEL: FILE DIRECTORY EXPLORER */}
          <div className={`w-full md:w-80 flex flex-col bg-[#191816]/45 shrink-0 select-none overflow-hidden ${
            mobileTab === 'files' ? 'flex h-full md:h-full' : 'hidden md:flex md:h-full'
          }`}>
            
            {/* Repo / Branch Selector info heading */}
            <div className="p-4 border-b border-[#2E2B25] flex flex-col gap-3">
              
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setSelectedRepo(null)}
                  className="text-[10px] uppercase tracking-wider font-bold text-amber-500 hover:text-amber-400 flex items-center gap-1.5 cursor-pointer leading-none"
                >
                  <ArrowLeft className="w-3 h-3" /> Repos Catalog
                </button>
                <span className="text-[9px] text-[#999288] font-mono leading-none">ACTIVE WORKSPACE</span>
              </div>

              <div>
                <span className="block font-serif text-sm font-semibold text-[#FCFBF9] truncate">{selectedRepo.name}</span>
                <span className="text-[10px] text-[#999288] block truncate mt-0.5 mt-1">/{selectedRepo.owner.login}</span>
              </div>

              {/* Branch Combobox */}
              <div className="flex items-center gap-1.5 bg-[#191816] rounded-xl border border-[#2E2B25] px-2.5 py-1.5">
                <GitBranch className="w-3.5 h-3.5 text-[#999288]" />
                <select
                  value={selectedBranch}
                  onChange={(e) => {
                    const nextBranch = e.target.value;
                    setSelectedBranch(nextBranch);
                    setCurrentPath('');
                    setSelectedFile(null);
                    setFileContent('');
                    setAiReview(null);
                    loadFiles(selectedRepo, nextBranch, '');
                    playSound('/audio/rounded.ogg');
                  }}
                  className="bg-transparent text-xs text-[#FCFBF9] focus:outline-none flex-1 border-none cursor-pointer"
                >
                  {branches.map(branch => (
                    <option key={branch} value={branch} className="bg-[#191816]">
                      {branch}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Breadcrumbs Trail */}
            <div className="px-4 py-2 border-b border-[#2E2B25]/40 bg-[#191816]/10 flex items-center gap-1 text-[10px] overflow-x-auto whitespace-nowrap scrollbar-none select-none">
              <button 
                onClick={() => handleFolderClick('')}
                className="text-amber-500 hover:text-[#FCFBF9] cursor-pointer"
              >
                root
              </button>
              {getBreadcrumbs().map((b, i, arr) => (
                <React.Fragment key={b.path}>
                  <ChevronRight className="w-2.5 h-2.5 text-[#6B665E] shrink-0" />
                  <button
                    onClick={() => handleFolderClick(b.path)}
                    className={`${i === arr.length - 1 ? 'text-[#999288] pointer-events-none' : 'text-amber-500 hover:text-[#FCFBF9]'} cursor-pointer`}
                  >
                    {b.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* File explorer listing */}
            <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar bg-[#121110]">
              {loadingFiles ? (
                <div className="flex flex-col items-center justify-center py-20 text-[#6B665E] gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-amber-500/85" />
                  <span className="text-[10px] font-bold">Crawling directory contents...</span>
                </div>
              ) : files.length === 0 ? (
                <div className="text-center py-10 text-[11px] text-[#6B665E]">
                  Folder path is empty.
                </div>
              ) : (
                files.map(f => {
                  const isDir = f.type === 'dir';
                  const isSelected = selectedFile?.path === f.path;
                  
                  return (
                    <button
                      key={f.path}
                      onClick={() => isDir ? handleFolderClick(f.path) : handleFileClick(f)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                        isSelected 
                          ? 'bg-amber-600/10 border border-amber-500/20 text-amber-500 font-semibold' 
                          : 'hover:bg-white/5 text-[#999288] hover:text-[#FCFBF9] border border-transparent'
                      }`}
                    >
                      {isDir ? (
                        <Folder className={`w-4 h-4 text-amber-500/80 shrink-0 fill-amber-500/10`} />
                      ) : (
                        <File className={`w-4 h-4 text-[#8C8375] shrink-0`} />
                      )}
                      <span className="truncate flex-1">{f.name}</span>
                      
                      {isDir && (
                        <ChevronRight className="w-3 h-3 text-[#6B665E] shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

          </div>

          {/* RIGHT PANEL: MAIN CODE VISUALIZER / EDITOR / GEMINI INSIGHTS */}
          <div className={`flex-1 flex flex-col overflow-hidden select-text bg-claude-bg ${
            mobileTab !== 'files' ? 'flex h-full' : 'hidden md:flex md:h-full'
          }`}>
            
            {loadingContent ? (
              <div className="flex-1 flex flex-col items-center justify-center text-claude-secondary gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-amber-500" />
                <span className="text-xs font-semibold">Retrieving secure file contents from branch {selectedBranch}...</span>
              </div>
            ) : !selectedFile ? (
              /* GREETING / INITIAL SCREEN WITH WALKTHROUGH */
              <div className="flex-1 flex flex-col items-center justify-start p-6 md:p-8 text-center bg-gradient-to-b from-[#191816]/10 to-[#121110]/5 overflow-y-auto custom-scrollbar">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 mb-4 shrink-0">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                
                <h3 className="text-[#FCFBF9] font-serif font-semibold text-base mb-1.5">
                  AI GitHub Refactoring Terminal
                </h3>
                <p className="text-xs text-claude-secondary max-w-sm leading-relaxed mb-6">
                  Select a code file on the left (or under the <strong>Files</strong> tab on mobile) and use Gemini to audit, write, and push changes back.
                </p>

                {/* Step-by-step Interactive Walkthrough Guide */}
                <div className="max-w-md w-full bg-[#191816] border border-[#2E2B25] rounded-2xl p-5 text-left shadow-xl space-y-4 select-none">
                  <h4 className="text-[10px] uppercase font-bold text-amber-500 font-mono tracking-wider flex items-center gap-1.5 pb-2 border-b border-[#2E2B25]/45">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                    Interactive Quick Start Guide
                  </h4>

                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-500 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</div>
                    <div>
                      <h5 className="text-[11px] font-bold text-[#FCFBF9]">Choose a File to Inspect</h5>
                      <p className="text-[10px] text-[#999288] mt-0.5 leading-normal">
                        Click the <strong className="text-amber-500">Files Explorer</strong> tab on mobile or browse directories on the left. Tap any code file to view its code in the terminal.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-violet-500/10 border border-violet-500/25 text-violet-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</div>
                    <div>
                      <h5 className="text-[11px] font-bold text-[#FCFBF9]">Run Gemini Evaluation</h5>
                      <p className="text-[10px] text-[#999288] mt-0.5 leading-normal">
                        Click the purple <strong className="text-violet-400">AI REFACTOR & REVIEW</strong> button at the top header. Gemini will audit syntax, search for errors, and write an improved version.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</div>
                    <div>
                      <h5 className="text-[11px] font-bold text-[#FCFBF9]">Apply the AI's Code Upgrade</h5>
                      <p className="text-[10px] text-[#999288] mt-0.5 leading-normal">
                        Look at the <strong className="text-emerald-400">AI Review</strong> column (or active tab). Click <span className="font-semibold text-emerald-400">"Apply AI's Code Upgrade!"</span> to automatically import the clean edits straight into your workspace.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">4</div>
                    <div>
                      <h5 className="text-[11px] font-bold text-[#FCFBF9]">Commit & Deploy</h5>
                      <p className="text-[10px] text-[#999288] mt-0.5 leading-normal">
                        Check the code in <span className="font-semibold text-amber-500">Interactive Edit</span> view, add a short description, and hit <strong className="text-amber-500">COMMIT TO GITHUB</strong>. Upgrades are saved directly to your repository!
                      </p>
                    </div>
                  </div>
                </div>

                {/* PR lists block in repositories */}
                {pullRequests.length > 0 && (
                  <div className="mt-8 border border-[#2E2B25] bg-[#191816]/30 max-w-sm w-full p-4 rounded-xl text-left select-none">
                    <span className="text-[10px] uppercase font-bold text-amber-500 tracking-wider block mb-2 font-mono">Open Pull Requests ({pullRequests.length})</span>
                    <div className="space-y-1.5 max-h-[120px] overflow-y-auto scrollbar-none text-[11px]">
                      {pullRequests.map((pr: any) => (
                        <a 
                          key={pr.id} 
                          href={pr.html_url} 
                          target="_blank" 
                          referrerPolicy="no-referrer"
                          className="flex items-center justify-between hover:text-amber-400 text-claude-secondary py-1 border-b border-[#2E2B25]/30 last:border-0"
                        >
                          <span className="truncate pr-4">#{pr.number} - {pr.title}</span>
                          <span className="text-[9px] text-[#706B62] shrink-0 font-mono">@{pr.user.login}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* FILE AND CONTROLS active area */
              <div className="flex-1 flex flex-col overflow-hidden divide-y divide-[#2E2B25]">
                
                {/* HEADER CONTROLS AREA */}
                <div className="px-5 py-3.5 bg-[#191816]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-mono tracking-widest font-bold text-[#FCFBF9]/65 block mb-0.5">FILE PATH INSPECTED</span>
                    <span className="text-xs text-[#FCFBF9] font-semibold truncate block pr-4">
                      {selectedFile.path}
                    </span>
                  </div>

                  {/* Upper Controls button groups */}
                  <div className="flex items-center gap-2 select-none">
                    
                    {/* Mode Selectors */}
                    <div className="flex items-center bg-[#191816] border border-[#2E2B25] rounded-xl p-0.5">
                      <button
                        onClick={() => {
                          setIsEditMode(false);
                          playSound('/audio/rounded.ogg');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          !isEditMode 
                            ? 'bg-amber-600/10 text-amber-500' 
                            : 'text-[#999288] hover:text-[#FCFBF9]'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>VIEW CODE</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsEditMode(true);
                          playSound('/audio/rounded.ogg');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                          isEditMode 
                            ? 'bg-amber-600/10 text-amber-500' 
                            : 'text-[#999288] hover:text-[#FCFBF9]'
                        }`}
                      >
                        <Code className="w-3.5 h-3.5" />
                        <span>INTERACTIVE EDIT</span>
                      </button>
                    </div>

                    {/* High Thinking Mode Toggle */}
                    <button
                      onClick={() => {
                        setHighThinking(!highThinking);
                        playSound('/audio/rounded.ogg');
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all cursor-pointer select-none ${
                        highThinking 
                          ? 'bg-amber-600/10 text-amber-500 border-amber-500/30' 
                          : 'bg-[#191816]/30 text-[#999288] border-[#2E2B25] hover:text-[#FCFBF9]'
                      }`}
                      title={highThinking ? "High Thinking: Active (Gemini 3.1 Pro)" : "High Thinking: Off (Gemini 3.5 Flash)"}
                    >
                      <Brain className={`w-3.5 h-3.5 ${highThinking ? 'animate-pulse text-amber-400' : ''}`} />
                      <span className="hidden sm:inline">HIGH THINKING</span>
                      <span className={`w-1.5 h-1.5 rounded-full ${highThinking ? 'bg-amber-500' : 'bg-zinc-600'}`} />
                    </button>

                    {/* Gemini AI review buttons */}
                    <button
                      onClick={handleAiReview}
                      disabled={reviewing || !fileContent}
                      className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white px-3 py-1.5 border border-violet-500/20 rounded-xl text-[11px] font-bold transition-all cursor-pointer select-none"
                    >
                      {reviewing ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>EVALUATING CODE...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-400 fill-amber-400/20" />
                          <span>AI REFACTOR & REVIEW</span>
                        </>
                      )}
                    </button>

                  </div>
                </div>

                {/* VISUAL LAYOUT COLLAPSE COLUMNS GRID */}
                <div className="flex-grow flex flex-col lg:flex-row overflow-hidden divide-y lg:divide-y-0 lg:divide-x divide-[#2E2B25]">
                  
                  {/* WORKSPACE CODE VIEWER PANEL */}
                  <div className={`flex-grow flex flex-col p-3 md:p-5 overflow-y-auto select-text custom-scrollbar bg-[#121110] ${
                    mobileTab === 'editor' ? 'flex h-full' : 'hidden lg:flex lg:h-full'
                  }`}>
                    
                    {errorMsg && (
                      <div className="mb-4 p-3 rounded-xl border border-red-900/40 bg-red-910/10 text-red-400 text-xs flex items-start gap-2 select-none">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        <span>{errorMsg}</span>
                      </div>
                    )}

                    {commitSuccess && (
                      <div className="mb-4 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 text-xs flex items-start gap-2 select-none justify-between">
                        <div className="flex items-start gap-2">
                          <Check className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                          <span>{commitSuccess}</span>
                        </div>
                        <button 
                          onClick={() => setCommitSuccess(null)}
                          className="text-[10px] uppercase font-bold text-emerald-500 hover:text-white cursor-pointer"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    {!isEditMode ? (
                      /* VIEW MODE: Wrap code output inside premium formatter CodeBlock */
                      <div className="w-full">
                        <CodeBlock code={fileContent} language={selectedFile.name.split('.').pop() || 'typescript'} />
                      </div>
                    ) : (
                      /* ACTIVE EDIT MODE: Monospaced Textarea with Commit Form */
                      <form onSubmit={handleCommitSubmit} className="flex-1 flex flex-col gap-4">
                        
                        <div className="relative flex-grow min-h-[300px] flex flex-col rounded-xl border border-[#2E2B25] bg-[#0E0D0C] overflow-hidden select-text select-text">
                          <div className="px-3.5 py-1.5 border-b border-[#2E2B25] bg-[#161514] flex items-center justify-between text-[10px] text-[#FCFBF9]/60 font-mono select-none">
                            <span>REWRITE FILE BODY EDITOR</span>
                            <span>UTF-8 ENCODED DATA</span>
                          </div>
                          
                          <textarea
                            value={editingContent}
                            onChange={(e) => setEditingContent(e.target.value)}
                            className="w-full flex-grow p-4 bg-[#0E0D0C] text-[#E6E1DA] font-mono text-xs focus:outline-none resize-none overflow-y-auto custom-scrollbar leading-relaxed"
                            spellCheck="false"
                            id="github-code-textarea"
                          />
                        </div>

                        {/* Commit fields overlay */}
                        <div className="p-4 border border-[#2E2B25] rounded-xl bg-[#191816]/30 flex flex-col gap-3 select-none">
                          <span className="text-[10px] uppercase font-bold text-[#FCFBF9]/60 font-mono block">Commit upgrade directly to branch {selectedBranch}</span>
                          
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              value={commitMessage}
                              onChange={(e) => setCommitMessage(e.target.value)}
                              placeholder={`Update ${selectedFile.name} via Gemini Workspace Core`}
                              className="bg-[#121110] text-[#FCFBF9] text-xs px-3 py-2 border border-[#2E2B25] rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 flex-grow placeholder-[#6B665E]"
                            />

                            <button
                              type="submit"
                              disabled={committing || editingContent === fileContent}
                              className="shrink-0 flex items-center justify-center gap-1.5 bg-[#4F4A42] hover:bg-amber-600 hover:text-white disabled:opacity-40 text-[#FCFBF9] px-4 py-2 border border-[#2E2B25] rounded-xl text-xs font-bold transition-all cursor-pointer"
                            >
                              {committing ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>COMMITTING GITHUB MASTER...</span>
                                </>
                              ) : (
                                <>
                                  <Save className="w-4 h-4 shrink-0" />
                                  <span>COMMIT TO GITHUB</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                      </form>
                    )}

                  </div>

                  {/* GEMINI AI FEEDBACK/REVIEW COLUMN */}
                  <div className={`w-full lg:w-96 flex flex-col shrink-0 overflow-hidden divide-y divide-[#2E2B25] bg-[#191816]/20 ${
                    mobileTab === 'review' ? 'flex h-full' : 'hidden lg:flex lg:h-full'
                  }`}>
                    
                    {/* Header */}
                    <div className="p-4 border-b border-[#2E2B25] bg-[#191816]/40 flex items-center justify-between select-none">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-violet-400 fill-violet-400/15" />
                        <span className="text-[#FCFBF9] font-serif font-semibold text-xs tracking-wide">Gemini Code evaluation insights</span>
                      </div>
                      
                      {highThinking ? (
                        <span className="text-[9px] bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded-full font-bold font-mono tracking-wider flex items-center gap-1">
                          <Brain className="w-2.5 h-2.5 animate-pulse" />
                          3.1 PRO (THINKING)
                        </span>
                      ) : (
                        <span className="text-[9px] bg-violet-500/15 border border-violet-500/30 text-violet-400 px-2 py-0.5 rounded-full font-bold font-mono tracking-wider">
                          3.5 FLASH
                        </span>
                      )}
                    </div>

                    {/* Custom Instruction Box */}
                    <div className="p-3 bg-[#191816]/70 border-b border-[#2E2B25] shrink-0 select-none">
                      <span className="text-[10px] uppercase font-bold text-[#FCFBF9]/40 font-mono block mb-1">Focus Gemini Review (Optional Guidelines):</span>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Optimize for performance, write Typescript types..."
                          value={customInstructions}
                          onChange={(e) => setCustomInstructions(e.target.value)}
                          className="bg-[#121110] text-[#FCFBF9] placeholder-[#6B665E] border border-[#2E2B25] text-[11px] px-2.5 py-1.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 flex-grow"
                        />
                        {customInstructions && (
                          <button 
                            onClick={() => setCustomInstructions('')}
                            className="text-[10px] text-[#999288] hover:text-[#FCFBF9] pr-1.5 uppercase font-bold"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Review Output Body */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#121110]">
                      {reviewing ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-6 text-[#6B665E]/85">
                          <Wand2 className="w-8 h-8 animate-spin text-amber-500 mb-3" />
                          <p className="text-xs font-semibold text-[#FCFBF9] mb-1">Evaluating file with Gemini AI...</p>
                          <p className="text-[10px] text-[#999288] max-w-[180px] leading-relaxed">
                            {highThinking 
                              ? "Running advanced reasoning pipeline... This uses deep analytical thinking cycles to plan edge-case coverage and bug-free optimizations."
                              : "Checking for vulnerabilities, code syntax, and constructing optimized refactored draft."}
                          </p>
                        </div>
                      ) : !aiReview ? (
                        <div className="flex flex-col items-start justify-center p-5 text-left border border-dashed border-[#2E2B25]/80 rounded-xl bg-[#191816]/30 my-4 mx-2">
                          <div className="flex items-center gap-2 mb-3 text-amber-500 select-none">
                            <Sparkles className="w-4 h-4 animate-pulse" />
                            <span className="text-[10px] font-bold uppercase font-mono tracking-wider">Awaiting Evaluation</span>
                          </div>
                          
                          <p className="text-xs text-[#999288] leading-relaxed mb-4">
                            You have selected <strong className="text-[#FCFBF9] font-mono">{selectedFile.name}</strong>. Here is how to complete an AI upgrade step-by-step:
                          </p>

                          <ol className="space-y-4 text-[11px] text-[#999288]">
                            <li className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-violet-500/10 border border-violet-500/25 flex items-center justify-center font-bold text-violet-400 shrink-0 text-[10px] mt-0.5">1</span>
                              <span>Click <strong className="text-violet-400">AI Refactor & Review</strong> in the header controls at the top.</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-pink-500/10 border border-pink-500/25 flex items-center justify-center font-bold text-pink-400 shrink-0 text-[10px] mt-0.5">2</span>
                              <span>Gemini's code recommendations will appear right here in real-time.</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center font-bold text-emerald-400 shrink-0 text-[10px] mt-0.5">3</span>
                              <span>Click <strong className="text-emerald-400">Apply AI's Code Upgrade!</strong> to copy the modified code block directly into your editor!</span>
                            </li>
                            <li className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-amber-500/10 border border-amber-500/25 flex items-center justify-center font-bold text-amber-500 shrink-0 text-[10px] mt-0.5">4</span>
                              <span>Select <strong className="text-amber-500">Commit to GitHub</strong> to push the upgraded code straight back to your repository!</span>
                            </li>
                          </ol>
                        </div>
                      ) : (
                        <div className="space-y-4 animate-fade-in select-text select-text">
                          
                          {/* Apply Optimizations callout */}
                          <div className="p-3 border border-violet-500/25 bg-violet-500/5 rounded-xl text-left select-none">
                            <span className="block font-bold text-[11px] text-[#FCFBF9] mb-1 flex items-center gap-1">
                              <Wand2 className="w-3.5 h-3.5 text-amber-400" /> Auto-Upgrade code
                            </span>
                            <p className="text-[10px] text-[#999288] leading-relaxed mb-2">
                              Gemini provided an improved, optimized version below. You can apply it directly into your workspace editor now.
                            </p>
                            <button
                              onClick={handleApplyAiOptimizations}
                              className="w-full flex items-center justify-center gap-1 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-[10px] font-bold rounded-lg leading-normal shadow transition-all cursor-pointer"
                            >
                              <span>Apply AI's Code Upgrade!</span>
                            </button>
                          </div>

                          {/* Markdown evaluation list text detail */}
                          <div className="text-[11px] text-[#B5AFA5] leading-relaxed whitespace-pre-wrap select-text markdown-body">
                            {aiReview}
                          </div>

                        </div>
                      )}
                    </div>

                  </div>

                </div>

              </div>
            )}

          </div>

        </div>
      )}
    </div>
  );
}
