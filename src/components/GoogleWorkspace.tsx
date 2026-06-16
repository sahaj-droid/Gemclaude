import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, LogOut, Search, Folder, File, RefreshCw,
  Calendar, Play, ExternalLink, ChevronRight, AlertCircle,
  Table2, Youtube, HardDrive, Clock, X, Download,
  ChevronLeft, Grid3X3, ListMusic
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GoogleWorkspaceProps {
  onGoBackToChat?: () => void;
  googleClientId?: string;
}

type SubTab = 'drive' | 'sheets' | 'calendar' | 'youtube';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
}

interface SheetFile {
  id: string;
  name: string;
  modifiedTime?: string;
  webViewLink?: string;
}

interface CalendarEvent {
  id: string;
  summary: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  description?: string;
  location?: string;
  htmlLink?: string;
  colorId?: string;
}

interface YouTubeVideo {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    thumbnails: { medium: { url: string } };
    channelTitle: string;
    publishedAt: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

function isFolder(mimeType: string) {
  return mimeType === 'application/vnd.google-apps.folder';
}

function fileIcon(mimeType: string) {
  if (isFolder(mimeType)) return '📁';
  if (mimeType.includes('spreadsheet')) return '📊';
  if (mimeType.includes('document')) return '📄';
  if (mimeType.includes('presentation')) return '📽️';
  if (mimeType.includes('pdf')) return '📕';
  if (mimeType.includes('image')) return '🖼️';
  if (mimeType.includes('video')) return '🎬';
  if (mimeType.includes('audio')) return '🎵';
  if (mimeType.includes('zip') || mimeType.includes('archive')) return '📦';
  return '📄';
}

function formatBytes(bytes?: string) {
  if (!bytes) return '';
  const b = parseInt(bytes);
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}

function formatDate(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

function formatEventTime(event: CalendarEvent) {
  const start = event.start.dateTime || event.start.date || '';
  if (!start) return '';
  try {
    const d = new Date(start);
    if (event.start.date && !event.start.dateTime) {
      return new Date(start + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    }
    return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' +
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  } catch { return start; }
}

function isUpcoming(event: CalendarEvent) {
  const start = event.start.dateTime || event.start.date;
  if (!start) return false;
  return new Date(start) >= new Date();
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GoogleWorkspace({ onGoBackToChat, googleClientId }: GoogleWorkspaceProps) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem('google_access_token'));
  const [userProfile, setUserProfile] = useState<{ name: string; email: string; picture: string } | null>(() => {
    const s = sessionStorage.getItem('google_user_profile');
    try { return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [subTab, setSubTab] = useState<SubTab>('drive');
  const [gisReady, setGisReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const tokenClientRef = useRef<any>(null);

  // Drive state
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [driveSearch, setDriveSearch] = useState('');
  const [drivePath, setDrivePath] = useState<{ id: string; name: string }[]>([{ id: 'root', name: 'My Drive' }]);
  const [driveError, setDriveError] = useState<string | null>(null);

  // Sheets state
  const [sheets, setSheets] = useState<SheetFile[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [selectedSheet, setSelectedSheet] = useState<SheetFile | null>(null);
  const [sheetData, setSheetData] = useState<string[][]>([]);
  const [sheetDataLoading, setSheetDataLoading] = useState(false);
  const [sheetsError, setSheetsError] = useState<string | null>(null);

  // Calendar state
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);

  // YouTube state
  const [ytSearch, setYtSearch] = useState('');
  const [ytVideos, setYtVideos] = useState<YouTubeVideo[]>([]);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);

  const clientId = googleClientId || (typeof window !== 'undefined' ? (window as any).__GOOGLE_CLIENT_ID__ : '');

  const playSound = (soundFile: string) => {
    const soundsEnabled = localStorage.getItem('claude_sounds_enabled') !== 'false';
    if (!soundsEnabled) return;
    try {
      const audio = new Audio();
      audio.src = soundFile;
      audio.volume = 0.3;
      audio.play().catch(() => { });
    } catch { }
  };

  // ── Load GIS script ──────────────────────────────────────────────────────────
  useEffect(() => {
    if ((window as any).google?.accounts?.oauth2) {
      setGisReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setGisReady(true);
    script.onerror = () => setErrorMsg('Failed to load Google Sign-In library. Check your internet connection.');
    document.head.appendChild(script);
    return () => { try { document.head.removeChild(script); } catch { } };
  }, []);

  // ── Initialize token client when GIS is ready ────────────────────────────────
  useEffect(() => {
    if (!gisReady || !clientId) return;
    try {
      tokenClientRef.current = (window as any).google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: async (response: any) => {
          setConnecting(false);
          if (response.error) {
            setErrorMsg(`Google Auth Error: ${response.error_description || response.error}`);
            return;
          }
          const accessToken = response.access_token;
          sessionStorage.setItem('google_access_token', accessToken);
          setToken(accessToken);
          // Fetch user profile
          try {
            const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            const profile = await res.json();
            const p = { name: profile.name || '', email: profile.email || '', picture: profile.picture || '' };
            sessionStorage.setItem('google_user_profile', JSON.stringify(p));
            setUserProfile(p);
          } catch { /* profile fetch failed gracefully */ }
          playSound('/audio/user_input_end.ogg');
        }
      });
    } catch (e: any) {
      setErrorMsg(`Failed to initialize Google Sign-In: ${e.message}`);
    }
  }, [gisReady, clientId]);

  // ── Auto-fetch data when tab changes ────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    if (subTab === 'drive') fetchDriveFiles('root');
    if (subTab === 'sheets') fetchSheets();
    if (subTab === 'calendar') fetchCalendarEvents();
  }, [subTab, token]);

  // ── Auth actions ─────────────────────────────────────────────────────────────
  const handleConnect = () => {
    if (!tokenClientRef.current) {
      setErrorMsg('Google Sign-In not ready yet. Please wait a moment.');
      return;
    }
    setConnecting(true);
    setErrorMsg(null);
    tokenClientRef.current.requestAccessToken();
  };

  const handleDisconnect = () => {
    sessionStorage.removeItem('google_access_token');
    sessionStorage.removeItem('google_user_profile');
    setToken(null);
    setUserProfile(null);
    setDriveFiles([]); setSheets([]); setEvents([]); setYtVideos([]);
    playSound('/audio/exit.ogg');
  };

  // ── Drive ─────────────────────────────────────────────────────────────────────
  const fetchDriveFiles = useCallback(async (folderId: string, searchQuery?: string) => {
    if (!token) return;
    setDriveLoading(true);
    setDriveError(null);
    try {
      let q = searchQuery
        ? `name contains '${searchQuery.replace(/'/g, "\\'")}' and trashed=false`
        : `'${folderId}' in parents and trashed=false`;
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,modifiedTime,size,webViewLink)&orderBy=folder,name&pageSize=100`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Drive API error ${res.status}`);
      const data = await res.json();
      setDriveFiles(data.files || []);
    } catch (e: any) {
      setDriveError(e.message || 'Failed to load Drive files');
    }
    setDriveLoading(false);
  }, [token]);

  const handleFolderClick = (file: DriveFile) => {
    if (!isFolder(file.mimeType)) return;
    playSound('/audio/rounded.ogg');
    setDrivePath(p => [...p, { id: file.id, name: file.name }]);
    setDriveSearch('');
    fetchDriveFiles(file.id);
  };

  const handleDriveBreadcrumb = (idx: number) => {
    const target = drivePath[idx];
    setDrivePath(p => p.slice(0, idx + 1));
    setDriveSearch('');
    fetchDriveFiles(target.id);
    playSound('/audio/rounded.ogg');
  };

  const handleDriveSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!driveSearch.trim()) {
      fetchDriveFiles(drivePath[drivePath.length - 1].id);
      return;
    }
    fetchDriveFiles('root', driveSearch.trim());
  };

  // ── Sheets ────────────────────────────────────────────────────────────────────
  const fetchSheets = useCallback(async () => {
    if (!token) return;
    setSheetsLoading(true);
    setSheetsError(null);
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=mimeType='application/vnd.google-apps.spreadsheet' and trashed=false&fields=files(id,name,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Sheets API error ${res.status}`);
      const data = await res.json();
      setSheets(data.files || []);
    } catch (e: any) {
      setSheetsError(e.message || 'Failed to load spreadsheets');
    }
    setSheetsLoading(false);
  }, [token]);

  const fetchSheetData = async (sheet: SheetFile) => {
    if (!token) return;
    setSelectedSheet(sheet);
    setSheetDataLoading(true);
    setSheetData([]);
    try {
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheet.id}/values/A1:Z100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Could not load sheet data (${res.status})`);
      const data = await res.json();
      setSheetData(data.values || []);
    } catch (e: any) {
      setSheetsError(e.message || 'Failed to load sheet data');
    }
    setSheetDataLoading(false);
  };

  // ── Calendar ──────────────────────────────────────────────────────────────────
  const fetchCalendarEvents = useCallback(async () => {
    if (!token) return;
    setCalendarLoading(true);
    setCalendarError(null);
    try {
      const now = new Date().toISOString();
      const max = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(now)}&timeMax=${encodeURIComponent(max)}&singleEvents=true&orderBy=startTime&maxResults=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Calendar API error ${res.status}`);
      const data = await res.json();
      setEvents((data.items || []).filter(isUpcoming));
    } catch (e: any) {
      setCalendarError(e.message || 'Failed to load calendar');
    }
    setCalendarLoading(false);
  }, [token]);

  // ── YouTube ───────────────────────────────────────────────────────────────────
  const searchYouTube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytSearch.trim() || !token) return;
    setYtLoading(true);
    setYtError(null);
    setPlayingVideoId(null);
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(ytSearch)}&maxResults=12&type=video`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || `YouTube API error ${res.status}`);
      }
      const data = await res.json();
      setYtVideos(data.items || []);
    } catch (e: any) {
      setYtError(e.message || 'YouTube search failed');
    }
    setYtLoading(false);
  };

  // ── Sub-tab config ────────────────────────────────────────────────────────────
  const tabs: { id: SubTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'drive',    label: 'Drive',    icon: <HardDrive className="w-4 h-4" />, badge: 'FILES' },
    { id: 'sheets',   label: 'Sheets',   icon: <Table2 className="w-4 h-4" />, badge: 'DATA' },
    { id: 'calendar', label: 'Calendar', icon: <Calendar className="w-4 h-4" />, badge: '14D' },
    { id: 'youtube',  label: 'YouTube',  icon: <Youtube className="w-4 h-4" />, badge: 'WATCH' },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────

  if (!token) {
    // ── CONNECT SCREEN ──────────────────────────────────────────────────────────
    return (
      <div className="flex-1 flex flex-col items-center justify-start overflow-y-auto relative" style={{ background: '#0A0A0C' }}>

        {onGoBackToChat && (
          <button
            onClick={onGoBackToChat}
            className="absolute top-4 left-4 z-10 p-2.5 rounded-xl transition-all cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#8B949E' }}
            title="Go back to Chat"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}

        {/* Hero */}
        <div className="w-full max-w-lg px-6 pt-20 pb-10 mx-auto text-center">
          {/* Google coloured icon */}
          <div className="w-20 h-20 rounded-3xl mx-auto mb-6 flex items-center justify-center shadow-2xl relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #4285F4 0%, #34A853 33%, #FBBC04 66%, #EA4335 100%)' }}>
            <Grid3X3 className="w-9 h-9 text-white" />
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Google Workspace</h1>
          <p className="text-sm mb-8" style={{ color: '#8B949E' }}>
            Connect your Google account to browse Drive, view Sheets, check Calendar events, and search YouTube — all in one place.
          </p>

          {/* Service badges */}
          <div className="grid grid-cols-2 gap-3 mb-8 text-left">
            {[
              { icon: '📁', title: 'Google Drive', desc: 'Browse & download files', color: '#4285F4' },
              { icon: '📊', title: 'Google Sheets', desc: 'View spreadsheet data', color: '#34A853' },
              { icon: '📅', title: 'Google Calendar', desc: 'Next 14 days events', color: '#FBBC04' },
              { icon: '▶️', title: 'YouTube', desc: 'Search & watch videos', color: '#EA4335' },
            ].map(s => (
              <div key={s.title} className="p-3 rounded-xl flex items-start gap-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-xl">{s.icon}</span>
                <div>
                  <p className="text-xs font-bold text-white">{s.title}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: '#6E7681' }}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {!clientId ? (
            <div className="p-4 rounded-xl text-left mb-4" style={{ background: 'rgba(248,81,73,0.08)', border: '1px solid rgba(248,81,73,0.25)' }}>
              <p className="text-xs font-bold text-red-400 mb-1">⚠ Google Client ID Not Configured</p>
              <p className="text-[11px]" style={{ color: '#8B949E' }}>
                Add <code className="text-amber-400 font-mono">GOOGLE_CLIENT_ID</code> to your Render environment variables and redeploy.
              </p>
            </div>
          ) : null}

          {errorMsg && (
            <div className="p-3 rounded-xl text-xs text-red-400 mb-4 flex items-start gap-2" style={{ background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.2)' }}>
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={connecting || !gisReady || !clientId}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-bold text-sm transition-all cursor-pointer disabled:opacity-50"
            style={{ background: '#4285F4', color: 'white' }}
          >
            {connecting ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /><span>Connecting...</span></>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          <p className="text-[10px] mt-4" style={{ color: '#484F58' }}>
            🔒 Your access token is stored only in session storage and is never sent to any third-party server.
          </p>
        </div>
      </div>
    );
  }

  // ── CONNECTED WORKSPACE ───────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none" style={{ background: '#0D0D0F' }}>

      {/* Header */}
      <div className="h-14 shrink-0 flex items-center justify-between px-4" style={{ background: '#161B22', borderBottom: '1px solid #21262D' }}>
        <div className="flex items-center gap-2.5">
          {onGoBackToChat && (
            <button
              onClick={onGoBackToChat}
              className="p-2 shrink-0 rounded-xl transition-all cursor-pointer"
              style={{ color: '#8B949E' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#21262D'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              title="Go back to Chat"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-xs font-bold"
            style={{ background: 'linear-gradient(135deg,#4285F4,#34A853,#FBBC04,#EA4335)' }}>
            <Grid3X3 className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate leading-none">Google Workspace</p>
            {userProfile && <p className="text-[10px] mt-0.5 truncate" style={{ color: '#8B949E' }}>{userProfile.email}</p>}
          </div>
        </div>

        {userProfile && (
          <div className="flex items-center gap-2 shrink-0">
            {userProfile.picture && (
              <img src={userProfile.picture} alt={userProfile.name} referrerPolicy="no-referrer"
                className="w-7 h-7 rounded-full" style={{ border: '1.5px solid #30363D' }} />
            )}
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              style={{ background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.2)', color: '#F85149' }}
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        )}
      </div>

      {/* Sub-tab bar */}
      <div className="flex shrink-0 px-4 gap-1 py-2 overflow-x-auto" style={{ background: '#0D1117', borderBottom: '1px solid #21262D' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => { setSubTab(t.id); playSound('/audio/rounded.ogg'); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap"
            style={subTab === t.id
              ? { background: 'rgba(66,133,244,0.12)', color: '#4285F4', border: '1px solid rgba(66,133,244,0.3)' }
              : { color: '#8B949E', border: '1px solid transparent' }
            }
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── DRIVE TAB ──────────────────────────────────────────────────────────── */}
      {subTab === 'drive' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Drive toolbar */}
          <div className="px-4 py-3 flex items-center gap-2 shrink-0" style={{ borderBottom: '1px solid #21262D' }}>
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto whitespace-nowrap text-xs">
              {drivePath.map((p, i) => (
                <React.Fragment key={p.id}>
                  {i > 0 && <ChevronRight className="w-3 h-3 shrink-0" style={{ color: '#484F58' }} />}
                  <button
                    onClick={() => handleDriveBreadcrumb(i)}
                    className="hover:text-white transition-colors cursor-pointer shrink-0"
                    style={{ color: i === drivePath.length - 1 ? '#E6EDF3' : '#4285F4', fontWeight: i === drivePath.length - 1 ? 600 : 400 }}
                  >
                    {p.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
            {/* Search */}
            <form onSubmit={handleDriveSearch} className="flex items-center gap-1.5">
              <input
                value={driveSearch}
                onChange={e => setDriveSearch(e.target.value)}
                placeholder="Search files..."
                className="text-xs px-2.5 py-1.5 rounded-lg focus:outline-none"
                style={{ background: '#21262D', border: '1px solid #30363D', color: '#E6EDF3', width: 160 }}
              />
              <button type="submit" className="p-1.5 rounded-lg cursor-pointer transition-all" style={{ background: '#21262D', border: '1px solid #30363D', color: '#8B949E' }}>
                <Search className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => { setDriveSearch(''); fetchDriveFiles(drivePath[drivePath.length - 1].id); }}
                className="p-1.5 rounded-lg cursor-pointer transition-all"
                style={{ background: '#21262D', border: '1px solid #30363D', color: '#8B949E' }}
                title="Refresh"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* Drive file list */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {driveLoading ? (
              <div className="flex items-center justify-center h-40 gap-2" style={{ color: '#8B949E' }}>
                <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                <span className="text-sm">Loading Drive...</span>
              </div>
            ) : driveError ? (
              <div className="m-4 p-3 rounded-xl text-xs flex items-start gap-2" style={{ background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.2)', color: '#F85149' }}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{driveError}</span>
              </div>
            ) : driveFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ color: '#484F58' }}>
                <Folder className="w-8 h-8" />
                <span className="text-xs">No files found</span>
              </div>
            ) : (
              <div className="divide-y" style={{ divideColor: '#21262D' }}>
                {driveFiles.map(f => (
                  <div
                    key={f.id}
                    className="flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid #161B22' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#161B22'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    onClick={() => isFolder(f.mimeType) ? handleFolderClick(f) : null}
                  >
                    <span className="text-lg shrink-0">{fileIcon(f.mimeType)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: '#E6EDF3' }}>{f.name}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: '#484F58' }}>
                        {formatDate(f.modifiedTime)}{f.size ? ` · ${formatBytes(f.size)}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isFolder(f.mimeType) ? (
                        <ChevronRight className="w-4 h-4" style={{ color: '#484F58' }} />
                      ) : (
                        <>
                          {f.webViewLink && (
                            <a href={f.webViewLink} target="_blank" referrerPolicy="no-referrer"
                              className="p-1.5 rounded-lg transition-all"
                              style={{ color: '#8B949E' }}
                              onClick={e => e.stopPropagation()}
                              title="Open in Google Drive"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SHEETS TAB ─────────────────────────────────────────────────────────── */}
      {subTab === 'sheets' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedSheet ? (
            // Sheet data view
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-2.5 flex items-center gap-2 shrink-0" style={{ borderBottom: '1px solid #21262D' }}>
                <button onClick={() => { setSelectedSheet(null); setSheetData([]); }} className="p-1.5 rounded-lg cursor-pointer transition-all" style={{ color: '#8B949E' }}>
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <p className="text-sm font-semibold text-white truncate flex-1">{selectedSheet.name}</p>
                {selectedSheet.webViewLink && (
                  <a href={selectedSheet.webViewLink} target="_blank" referrerPolicy="no-referrer"
                    className="p-1.5 rounded-lg" style={{ color: '#34A853' }} title="Open in Google Sheets">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>
              <div className="flex-1 overflow-auto custom-scrollbar">
                {sheetDataLoading ? (
                  <div className="flex items-center justify-center h-40 gap-2" style={{ color: '#8B949E' }}>
                    <RefreshCw className="w-5 h-5 animate-spin text-green-400" />
                    <span className="text-sm">Loading sheet...</span>
                  </div>
                ) : sheetsError ? (
                  <div className="m-4 p-3 rounded-xl text-xs flex items-start gap-2" style={{ background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.2)', color: '#F85149' }}>
                    <AlertCircle className="w-4 h-4 shrink-0" /><span>{sheetsError}</span>
                  </div>
                ) : sheetData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ color: '#484F58' }}>
                    <Table2 className="w-8 h-8" /><span className="text-xs">Empty sheet</span>
                  </div>
                ) : (
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr style={{ background: '#161B22' }}>
                        {(sheetData[0] || []).map((cell, ci) => (
                          <th key={ci} className="px-3 py-2 text-left font-bold whitespace-nowrap"
                            style={{ color: '#34A853', borderBottom: '1px solid #21262D', borderRight: '1px solid #21262D' }}>
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheetData.slice(1).map((row, ri) => (
                        <tr key={ri} style={{ borderBottom: '1px solid #161B22' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#161B22'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-2 whitespace-nowrap select-text"
                              style={{ color: '#E6EDF3', borderRight: '1px solid #161B22' }}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ) : (
            // Sheets list
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <p className="text-xs font-bold" style={{ color: '#8B949E' }}>RECENT SPREADSHEETS</p>
                <button onClick={fetchSheets} className="p-1.5 rounded-lg cursor-pointer" style={{ color: '#8B949E' }} title="Refresh">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
              {sheetsLoading ? (
                <div className="flex items-center justify-center h-40 gap-2" style={{ color: '#8B949E' }}>
                  <RefreshCw className="w-5 h-5 animate-spin text-green-400" />
                  <span className="text-sm">Loading spreadsheets...</span>
                </div>
              ) : sheetsError ? (
                <div className="m-4 p-3 rounded-xl text-xs flex items-start gap-2" style={{ background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.2)', color: '#F85149' }}>
                  <AlertCircle className="w-4 h-4 shrink-0" /><span>{sheetsError}</span>
                </div>
              ) : sheets.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ color: '#484F58' }}>
                  <Table2 className="w-8 h-8" /><span className="text-xs">No spreadsheets found</span>
                </div>
              ) : (
                <div className="px-4 space-y-2 pb-4">
                  {sheets.map(s => (
                    <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all"
                      style={{ background: '#161B22', border: '1px solid #21262D' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#34A853'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#21262D'}
                      onClick={() => fetchSheetData(s)}>
                      <span className="text-2xl">📊</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: '#E6EDF3' }}>{s.name}</p>
                        <p className="text-[10px] mt-0.5" style={{ color: '#484F58' }}>Modified {formatDate(s.modifiedTime)}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#484F58' }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── CALENDAR TAB ───────────────────────────────────────────────────────── */}
      {subTab === 'calendar' && (
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <p className="text-xs font-bold" style={{ color: '#8B949E' }}>UPCOMING 14 DAYS</p>
            <button onClick={fetchCalendarEvents} className="p-1.5 rounded-lg cursor-pointer" style={{ color: '#8B949E' }} title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          {calendarLoading ? (
            <div className="flex items-center justify-center h-40 gap-2" style={{ color: '#8B949E' }}>
              <RefreshCw className="w-5 h-5 animate-spin text-yellow-400" />
              <span className="text-sm">Loading calendar...</span>
            </div>
          ) : calendarError ? (
            <div className="m-4 p-3 rounded-xl text-xs flex items-start gap-2" style={{ background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.2)', color: '#F85149' }}>
              <AlertCircle className="w-4 h-4 shrink-0" /><span>{calendarError}</span>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ color: '#484F58' }}>
              <Calendar className="w-8 h-8" /><span className="text-xs">No upcoming events in the next 14 days</span>
            </div>
          ) : (
            <div className="px-4 space-y-3 pb-6">
              {events.map(ev => (
                <div key={ev.id} className="p-3.5 rounded-xl transition-all" style={{ background: '#161B22', border: '1px solid #21262D' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate text-white">{ev.summary || '(No title)'}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <Clock className="w-3 h-3 shrink-0" style={{ color: '#FBBC04' }} />
                        <span className="text-[11px]" style={{ color: '#8B949E' }}>{formatEventTime(ev)}</span>
                      </div>
                      {ev.location && (
                        <p className="text-[10px] mt-1 truncate" style={{ color: '#484F58' }}>📍 {ev.location}</p>
                      )}
                    </div>
                    {ev.htmlLink && (
                      <a href={ev.htmlLink} target="_blank" referrerPolicy="no-referrer"
                        className="p-1.5 rounded-lg shrink-0" style={{ color: '#8B949E' }}>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  {ev.description && (
                    <p className="text-[11px] mt-2 leading-relaxed line-clamp-2" style={{ color: '#6E7681' }}>
                      {ev.description.replace(/<[^>]+>/g, '')}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── YOUTUBE TAB ────────────────────────────────────────────────────────── */}
      {subTab === 'youtube' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search bar */}
          <form onSubmit={searchYouTube} className="px-4 py-3 flex items-center gap-2 shrink-0" style={{ borderBottom: '1px solid #21262D' }}>
            <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#161B22', border: '1px solid #30363D' }}>
              <Youtube className="w-4 h-4 shrink-0" style={{ color: '#EA4335' }} />
              <input
                value={ytSearch}
                onChange={e => setYtSearch(e.target.value)}
                placeholder="Search YouTube videos..."
                className="flex-1 text-xs bg-transparent focus:outline-none"
                style={{ color: '#E6EDF3' }}
              />
              {ytSearch && (
                <button type="button" onClick={() => setYtSearch('')} style={{ color: '#484F58' }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <button type="submit" disabled={ytLoading || !ytSearch.trim()}
              className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50 transition-all"
              style={{ background: '#EA4335', color: 'white' }}>
              {ytLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </button>
          </form>

          {/* Video player overlay */}
          {playingVideoId && (
            <div className="px-4 py-3 shrink-0" style={{ borderBottom: '1px solid #21262D' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-white">Now Playing</p>
                <button onClick={() => setPlayingVideoId(null)} style={{ color: '#8B949E' }} className="cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                <iframe
                  src={`https://www.youtube.com/embed/${playingVideoId}?autoplay=1`}
                  className="w-full h-full"
                  allow="autoplay; fullscreen"
                  allowFullScreen
                  title="YouTube player"
                />
              </div>
            </div>
          )}

          {/* Results */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {ytError && (
              <div className="m-4 p-3 rounded-xl text-xs flex items-start gap-2" style={{ background: 'rgba(248,81,73,0.07)', border: '1px solid rgba(248,81,73,0.2)', color: '#F85149' }}>
                <AlertCircle className="w-4 h-4 shrink-0" /><span>{ytError}</span>
              </div>
            )}
            {ytVideos.length === 0 && !ytLoading && !ytError && (
              <div className="flex flex-col items-center justify-center h-40 gap-2" style={{ color: '#484F58' }}>
                <Youtube className="w-8 h-8" />
                <span className="text-xs">Search for YouTube videos above</span>
                <p className="text-[10px] text-center px-8" style={{ color: '#30363D' }}>YouTube Data API v3 quota: 10,000 units/day. Each search = ~100 units.</p>
              </div>
            )}
            {ytLoading && (
              <div className="flex items-center justify-center h-40 gap-2" style={{ color: '#8B949E' }}>
                <RefreshCw className="w-5 h-5 animate-spin text-red-400" />
                <span className="text-sm">Searching YouTube...</span>
              </div>
            )}
            {ytVideos.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                {ytVideos.map(v => (
                  <div key={v.id.videoId}
                    className="rounded-xl overflow-hidden cursor-pointer transition-all group"
                    style={{ background: '#161B22', border: '1px solid #21262D' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#EA4335'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#21262D'}
                    onClick={() => { setPlayingVideoId(v.id.videoId); playSound('/audio/rounded.ogg'); }}>
                    <div className="relative" style={{ aspectRatio: '16/9' }}>
                      <img src={v.snippet.thumbnails.medium.url} alt={v.snippet.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{ background: 'rgba(0,0,0,0.6)' }}>
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: '#EA4335' }}>
                          <Play className="w-5 h-5 text-white ml-1" />
                        </div>
                      </div>
                    </div>
                    <div className="p-2.5">
                      <p className="text-xs font-semibold line-clamp-2 text-white leading-tight">{v.snippet.title}</p>
                      <p className="text-[10px] mt-1 truncate" style={{ color: '#8B949E' }}>{v.snippet.channelTitle}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
