import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Download, 
  RefreshCw, 
  Layers, 
  ArrowLeft, 
  Image as ImageIcon, 
  Check, 
  Loader2, 
  Info, 
  X, 
  Eye, 
  Copy,
  ChevronRight,
  Sparkle
} from 'lucide-react';

interface GeneratedImageItem {
  id: string;
  url: string;
  prompt: string;
  refinedPrompt: string;
  model: string;
  aspectRatio: string;
  timestamp: number;
}

interface ImagenStudioProps {
  userEmail: string;
  onGoBackToChat: () => void;
}

const PRESET_STYLES = [
  {
    id: 'none',
    name: 'Raw / No Style',
    promptAddon: '',
    gradient: 'from-zinc-700 to-zinc-800'
  },
  {
    id: 'cinematic',
    name: 'Cinematic Movie',
    promptAddon: 'cinematic still, depth of field, dramatic lighting, highly stylized, masterfully shot, 8k resolution, photorealistic',
    gradient: 'from-blue-600 to-indigo-900'
  },
  {
    id: 'photorealistic',
    name: 'Photorealistic 4K',
    promptAddon: 'photorealistic portrait, award winning photography, shot on Hasselblad, crisp lens, intricate fine details, high-contrast, natural color grading',
    gradient: 'from-amber-600 to-orange-850'
  },
  {
    id: 'watercolor',
    name: 'Dreamy Watercolor',
    promptAddon: 'pastel soft watercolor illustration, ink wash detailing, splatter effects, ethereal, storybook realism, textured canvas',
    gradient: 'from-teal-500 to-emerald-700'
  },
  {
    id: '3d-render',
    name: '3D Pixar Render',
    promptAddon: 'vibrant 3D characters, Octane Render, unreal engine 5 style, cute and highly polished, warm volumetric lighting, soft smooth textures',
    gradient: 'from-pink-500 to-rose-700'
  },
  {
    id: 'anime',
    name: 'Makoto Shinkai Anime',
    promptAddon: 'anime key art, breathtaking sky and clouds, vibrant daylight, digital painting, incredible depth, Japanese animation aesthetic',
    gradient: 'from-violet-500 to-fuchsia-800'
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    promptAddon: 'cyberpunk nightscape, retro neon glow, reflections in wet pavement, holographic projections, futuristic detailing, dark atmosphere',
    gradient: 'from-purple-600 to-pink-900'
  },
  {
    id: 'pixel',
    name: '8-Bit Retro Pixel',
    promptAddon: 'detailed pixels, cute nostalgic game asset, pixel art style, high contrast retro colors, flat design',
    gradient: 'from-zinc-800 to-amber-900'
  },
];

const ASPECT_RATIOS = [
  { id: '1:1', label: 'Square (1:1)', class: 'aspect-square h-8 w-8', desc: 'Social posts & icons' },
  { id: '16:9', label: 'Landscape (16:9)', class: 'aspect-video h-6 w-10', desc: 'YouTube / Banners' },
  { id: '9:16', label: 'Portrait (9:16)', class: 'aspect-[9/16] h-10 w-6', desc: 'Mobile / Reels' },
  { id: '4:3', label: 'Classic Card (4:3)', class: 'aspect-[4/3] h-7 w-9', desc: 'Presentations' },
  { id: '3:4', label: 'Book Cover (3:4)', class: 'aspect-[3/4] h-9 w-6.5', desc: 'Portraits' },
];

const SAMPLE_PROMPTS = [
  "A majestic gold and black butterfly resting on a sparkling mechanical CPU chip, futuristic concept art, macro focal lens.",
  "An old wizard cozy reading room filled with floating books, glowing celestial maps, tea steam rising, warm studio lighting.",
  "Futuristic cyberpunk tea workshop in old Kyoto, neon signboards, steam rising from wooden cups, photorealistic high details.",
  "A majestic snow leopard resting atop a neon-lit futuristic skyscraper at midnight, digital painting style.",
  "Vibrant underwater kingdom built inside a giant glass clam shell, schools of glowing jellyfish dancing, coral reef details."
];

const MODEL_TUNES = [
  {
    id: 'pollinations-flux',
    name: 'Flux.1 AI (100% Free & Unlimited)',
    badge: 'Flux.1 Free',
    cost: 'FREE GENERATION (No API Key Required)'
  }
];

export default function ImagenStudio({ userEmail, onGoBackToChat }: ImagenStudioProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState('pollinations-flux');
  const [selectedStyle, setSelectedStyle] = useState('none');
  const [selectedRatio, setSelectedRatio] = useState('1:1');
  const [imageCount, setImageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Results active state
  const [activeResults, setActiveResults] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  
  // History persistent state
  const [history, setHistory] = useState<GeneratedImageItem[]>(() => {
    const saved = localStorage.getItem('claude_imagen_history');
    return saved ? JSON.parse(saved) : [];
  });

  const loadingSteps = [
    "Contacting Google Vertex backend...",
    "Sending request parameters...",
    "Augmenting prompt with style presets...",
    "Running Imagen diffusion steps...",
    "Decoding multi-spectral pixels...",
    "Reconstituting PNG image layers...",
    "Optimizing asset for high-speed delivery..."
  ];

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % loadingSteps.length);
      }, 2500);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    localStorage.setItem('claude_imagen_history', JSON.stringify(history));
  }, [history]);

  const playSound = (sound: string) => {
    const soundsEnabled = localStorage.getItem('claude_sounds_enabled') !== 'false';
    if (!soundsEnabled) return;
    try {
      const audio = new Audio(sound);
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch {}
  };

  const handleSurpriseMe = () => {
    const idx = Math.floor(Math.random() * SAMPLE_PROMPTS.length);
    setPrompt(SAMPLE_PROMPTS[idx]);
    playSound('/audio/rounded.ogg');
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setErrorMessage("Please write a descriptive prompt first!");
      return;
    }

    setErrorMessage('');
    setLoading(true);
    setActiveResults([]);
    playSound('/audio/enter.ogg');

    const styleObj = PRESET_STYLES.find(s => s.id === selectedStyle);
    const addedAddon = styleObj && styleObj.promptAddon ? `, ${styleObj.promptAddon}` : '';
    const finalPrompt = prompt.trim() + addedAddon;

    try {
      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          refinedPrompt: finalPrompt,
          model: selectedModel,
          aspectRatio: selectedRatio,
          count: imageCount
        })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || `Server failed to generate the image (status: ${response.status})`);
      }

      if (data.images && data.images.length > 0) {
        setActiveResults(data.images);
        playSound('/audio/user_input_end.ogg');

        // Add to history
        const newItems: GeneratedImageItem[] = data.images.map((url: string, i: number) => ({
          id: `img-${Date.now()}-${i}`,
          url,
          prompt: prompt.trim(),
          refinedPrompt: finalPrompt,
          model: selectedModel,
          aspectRatio: selectedRatio,
          timestamp: Date.now()
        }));

        setHistory(prev => [...newItems, ...prev]);
      } else {
        throw new Error("No image data returned from server. Check your secrets.");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'An error occurred during image generation.');
      playSound('/audio/exit.ogg');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(x => x.id !== id));
    playSound('/audio/exit.ogg');
  };

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    playSound('/audio/rounded.ogg');
  };

  const handleCopyBase64 = (url: string) => {
    try {
      const justBase = url.split(',')[1] || url;
      navigator.clipboard.writeText(justBase);
      playSound('/audio/rounded.ogg');
      alert("Successfully copied image Base64 to clipboard!");
    } catch {
      alert("Failed to copy data.");
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-claude-bg overflow-hidden animate-fade-in" id="imagen-studio-root">
      {/* Top sticky navbar */}
      <div className="h-16 px-4 md:px-6 border-b border-claude-border flex items-center justify-between shrink-0 bg-claude-bg/95 backdrop-blur-md z-12">
        <div className="flex items-center gap-3">
          <button 
            onClick={onGoBackToChat}
            className="p-2 hover:bg-claude-card rounded-xl text-claude-secondary hover:text-claude-text transition-colors cursor-pointer mr-0.5"
            title="Go back to chat"
            id="imagen-studio-back-btn"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500 fill-amber-500/20" />
              <h1 className="font-serif font-semibold text-lg text-claude-text tracking-wide leading-none">
                Imagen 3 Studio
              </h1>
              <span className="text-[10px] uppercase font-bold tracking-widest px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500">
                AI Creative
              </span>
            </div>
            <span className="text-[10px] text-claude-secondary font-mono">
              Empowered by Google's state-of-the-art visual models
            </span>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 bg-claude-card border border-claude-border rounded-full text-xs text-claude-secondary font-mono">
          <Info className="w-3.5 h-3.5 text-amber-500" />
          <span>Scale up to 4K resolution dynamically</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* Left Side: Generative Config Panel */}
        <div className="w-full lg:w-96 border-r border-claude-border flex flex-col overflow-y-auto shrink-0 bg-[#161413]">
          {/* Section: Model Selection */}
          <div className="p-4 border-b border-claude-border space-y-2">
            <label className="block text-xs font-semibold text-claude-text uppercase tracking-wider font-mono">
              Generative Model
            </label>
            <div className="grid grid-cols-1 gap-1.5">
              {MODEL_TUNES.map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModel(model.id);
                    playSound('/audio/rounded.ogg');
                  }}
                  className={`w-full text-left p-3 rounded-xl border text-xs transition-all flex flex-col gap-1 cursor-pointer ${
                    selectedModel === model.id
                      ? 'bg-amber-600/10 border-amber-500/40 text-amber-500 shadow-xs'
                      : 'bg-[#1e1b19] border-[#2e2b25] text-[#999288] hover:border-[#403B31] hover:text-[#FCFBF9]'
                  }`}
                >
                  <div className="flex items-center justify-between w-full font-semibold">
                    <span>{model.name}</span>
                    {selectedModel === model.id && <Check className="w-3.5 h-3.5" />}
                  </div>
                  <span className="text-[9px] font-mono tracking-wide opacity-80 uppercase">
                    {model.cost}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Section: Text Prompt Area */}
          <div className="p-4 border-b border-claude-border space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-claude-text uppercase tracking-wider font-mono">
                Creative Prompts
              </label>
              <button
                onClick={handleSurpriseMe}
                className="flex items-center gap-1 text-[11px] text-amber-500 hover:text-amber-400 font-medium font-mono cursor-pointer"
                title="Populate an exciting preset prompt signature"
              >
                <Sparkle className="w-3.5 h-3.5" />
                <span>Surprise Me</span>
              </button>
            </div>
            
            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your design masterpiece with rich contextual details, color schemas, and camera angles..."
                className="w-full h-32 text-xs bg-[#1A1816] border border-[#2E2B25] rounded-xl p-3 pr-8 text-[#FCFBF9] focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-[#6B665E] resize-none leading-relaxed transition-all"
                maxLength={800}
                id="imagen-prompt-textarea"
              />
              <span className="absolute bottom-2 right-2 text-[8px] font-mono text-[#6B665E]">
                {prompt.length}/800
              </span>
            </div>
            {errorMessage && (
              <div className="text-[11px] font-medium text-red-400 bg-red-950/10 border border-red-900/30 px-3 py-2 rounded-xl animate-fade-in flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Section: Art Style Presets */}
          <div className="p-4 border-b border-claude-border space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-claude-text uppercase tracking-wider font-mono">
                Style Presets
              </label>
              <span className="text-[10px] text-claude-secondary bg-[#2a2723] rounded-sm px-1 font-mono uppercase font-bold">
                Augment
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESET_STYLES.map((style) => (
                <button
                  key={style.id}
                  onClick={() => {
                    setSelectedStyle(style.id);
                    playSound('/audio/rounded.ogg');
                  }}
                  className={`relative overflow-hidden p-2.5 rounded-xl border text-left transition-all h-14 select-none cursor-pointer group flex flex-col justify-end ${
                    selectedStyle === style.id
                      ? 'border-amber-500 text-white shadow-md'
                      : 'border-[#2d2a27] text-zinc-400 hover:border-zinc-700 hover:text-white'
                  }`}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${style.gradient} opacity-20 group-hover:opacity-30 transition-opacity`} />
                  <span className="relative text-[10px] font-bold tracking-tight select-none">
                    {style.name}
                  </span>
                  {selectedStyle === style.id && (
                    <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 rounded-full bg-amber-500 flex items-center justify-center text-white p-0.5">
                      <Check className="w-2.5 h-2.5 font-bold" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Section: Aspect Ratio selection */}
          <div className="p-4 border-b border-claude-border space-y-3">
            <label className="block text-xs font-semibold text-claude-text uppercase tracking-wider font-mono">
              Aspect Ratio
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {ASPECT_RATIOS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedRatio(item.id);
                    playSound('/audio/rounded.ogg');
                  }}
                  className={`flex flex-col items-center justify-center py-2.5 rounded-xl border transition-all text-center group cursor-pointer ${
                    selectedRatio === item.id
                      ? 'bg-amber-600/10 border-amber-500 text-amber-500'
                      : 'bg-[#1C1A18] border-[#2E2B25] text-claude-secondary hover:border-zinc-700 hover:text-claude-text'
                  }`}
                  title={`${item.label}: ${item.desc}`}
                >
                  <div className={`${item.class} border rounded-xs mb-1.5 transition-all group-hover:scale-105 ${
                    selectedRatio === item.id 
                      ? 'bg-amber-500/20 border-amber-500' 
                      : 'bg-zinc-800 border-zinc-700'
                  }`} />
                  <span className="text-[9px] font-semibold font-mono tracking-tight leading-none">
                    {item.id}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Section: Generative Trigger action */}
          <div className="p-4 sticky bottom-0 bg-[#161413] border-t border-[#2E2B25] mt-auto">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm tracking-wide transition-all shadow-md flex items-center justify-center gap-2 select-none cursor-pointer ${
                loading
                  ? 'bg-[#2E2B25] text-[#999288] border border-[#403B31]'
                  : 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/20'
              }`}
              id="imagen-generate-trigger-btn"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                  <span>Synthesizing Canvas ({Math.floor((loadingStep / loadingSteps.length) * 100) + 15}%)</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-white/10" />
                  <span>Render Creative Image</span>
                </>
              )}
            </button>
            {loading && (
              <p className="text-[10px] text-center text-amber-500 font-mono mt-2.5 animate-pulse truncate">
                {loadingSteps[loadingStep]}
              </p>
            )}
          </div>
        </div>

        {/* Right Side: Showcase Active Workspace, Lightbox gallery & Stored History */}
        <div className="flex-1 flex flex-col overflow-y-auto bg-claude-bg p-4 md:p-6 space-y-6">
          
          {/* Active Generation Container */}
          <div className="bg-claude-card border border-claude-border rounded-xl md:rounded-2xl p-4 md:p-6 shadow-xs relative overflow-hidden flex flex-col min-h-[380px] items-center justify-center">
            
            {/* Absolute background abstract decorations */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/2 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-violet-500/2 rounded-full blur-3xl pointer-events-none" />

            {/* Default state */}
            {!loading && activeResults.length === 0 && (
              <div className="w-full max-w-md text-center py-8 space-y-4 animate-fade-in">
                <div className="w-16 h-16 rounded-2xl bg-[#2A2723] border border-[#403B31] flex items-center justify-center mx-auto text-amber-500 shadow-sm">
                  <ImageIcon className="w-8 h-8 stroke-[1.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-serif font-semibold text-[#FCFBF9]">
                    AI Diffusion Canvas Empty
                  </h3>
                  <p className="text-xs text-claude-secondary mt-1 max-w-sm mx-auto leading-relaxed">
                    Customise parameters in the configuration panel on the left and dispatch to generate visual masterpieces instantly.
                  </p>
                </div>

                {/* Popular sample prompts as quick triggers */}
                <div className="space-y-2 pt-2">
                  <span className="block text-[10px] font-semibold text-[#FCFBF9] uppercase tracking-wider font-mono">
                    Stellar Inspiration Ideas
                  </span>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {SAMPLE_PROMPTS.slice(0, 3).map((spl, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setPrompt(spl);
                          playSound('/audio/rounded.ogg');
                        }}
                        className="text-[10px] bg-[#22201D] hover:bg-[#2E2B25] text-[#999288] hover:text-[#FCFBF9] border border-[#2E2B25] px-2.5 py-1.5 rounded-full text-center truncate max-w-[280px] cursor-pointer transition-colors"
                      >
                        {spl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Active loading state */}
            {loading && (
              <div className="w-full max-w-md text-center space-y-4 py-12">
                <div className="relative w-20 h-20 mx-auto">
                  {/* Glowing orbital layers */}
                  <div className="absolute inset-0 rounded-2xl bg-amber-500/10 blur-xl animate-pulse" />
                  <div className="absolute inset-0 border border-amber-500/20 rounded-2xl animate-spin [animation-duration:8s]" />
                  <div className="absolute inset-2 border border-dashed border-amber-500/30 rounded-xl animate-spin [animation-duration:12s] [animation-direction:reverse]" />
                  <div className="absolute inset-4 bg-[#2A2723] border border-[#443E34] rounded-lg flex items-center justify-center text-amber-500">
                    <Loader2 className="w-7 h-7 animate-spin" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-[#FCFBF9] font-mono tracking-wide animate-pulse uppercase">
                    Generating Image
                  </h3>
                  <p className="text-xs text-[#999288] leading-relaxed max-w-xs mx-auto">
                    Sending multi-spectral noise diffusion requests to Imagen API. This takes ~5 seconds.
                  </p>
                </div>
              </div>
            )}

            {/* Custom Gallery view */}
            {!loading && activeResults.length > 0 && (
              <div className="w-full h-full flex flex-col space-y-4">
                <div className="flex items-center justify-between w-full border-b border-claude-border pb-3">
                  <span className="text-xs font-semibold text-[#FCFBF9] uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Check className="w-4 h-4 text-emerald-500" />
                    <span>Active Generation Success</span>
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setActiveResults([])}
                      className="text-xs text-[#999288] hover:text-[#FCFBF9] hover:bg-white/5 border border-[#2E2B25] px-2.5 py-1 rounded-lg cursor-pointer transition-colors"
                    >
                      Clear Active View
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeResults.map((url, i) => (
                    <div 
                      key={i} 
                      className="group relative overflow-hidden bg-zinc-900 border border-[#2E2B25] rounded-xl hover:border-amber-500/50 transition-all flex flex-col shadow-md"
                    >
                      {/* Image container conforming to chosen aspect ratio */}
                      <div className="relative overflow-hidden w-full flex items-center justify-center bg-black">
                        <img 
                          src={url} 
                          alt={prompt}
                          className="max-h-[380px] w-full object-contain pointer-events-none transition-transform duration-500 group-hover:scale-101"
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-between p-3.5">
                          <span className="text-[10px] font-bold text-amber-500 tracking-wider uppercase bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md w-max">
                            Flux.1 AI
                          </span>
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setLightboxIndex(i);
                                playSound('/audio/rounded.ogg');
                              }}
                              className="p-2 bg-zinc-900/90 border border-zinc-700 hover:border-white rounded-lg text-white hover:bg-black transition-all cursor-pointer"
                              title="Zoom Preview"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleCopyBase64(url)}
                              className="p-2 bg-zinc-900/90 border border-zinc-700 hover:border-white rounded-lg text-white hover:bg-black transition-all cursor-pointer"
                              title="Copy Base64 bytes"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => triggerDownload(url, `imagen-generation-${Date.now()}-${i}.png`)}
                              className="p-2 bg-amber-600 border border-amber-500 rounded-lg text-white hover:bg-amber-500 transition-all cursor-pointer"
                              title="Download Asset"
                            >
                              <Download className="w-4 h-4 animate-bounce" />
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      {/* Meta prompt card */}
                      <div className="p-3.5 bg-claude-bg/50 border-t border-[#2E2B25]">
                        <p className="text-[11px] text-claude-secondary line-clamp-2 italic pr-4 pr-1 mb-1">
                          "{prompt.trim()}"
                        </p>
                        <div className="flex items-center justify-between text-[9px] text-[#6B665E] font-mono pt-1 border-t border-[#2E2B25]/30">
                          <span>Aspect: {selectedRatio}</span>
                          <span className="text-amber-500">2K Resolution</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stored Creative History */}
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-semibold text-[#FCFBF9] uppercase tracking-wider font-mono">
                  Your Creative Gallery History ({history.length})
                </h3>
              </div>
              {history.length > 0 && (
                <button
                  onClick={() => {
                    if (confirm("Are you sure you want to clear your local image history?")) {
                      setHistory([]);
                      playSound('/audio/exit.ogg');
                    }
                  }}
                  className="text-[10px] text-red-400 hover:text-red-300 font-mono transition-colors cursor-pointer"
                >
                  Clear All History
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-[#2E2B25] rounded-xl text-[#6B665E]">
                <p className="text-xs font-semibold">No historic generations yet</p>
                <p className="text-[10px] mt-1 text-[#6b665e] max-w-[220px] mx-auto leading-relaxed">
                  Every image you generate is archived securely here in your local system memory.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                {history.map((item) => (
                  <div 
                    key={item.id}
                    onClick={() => {
                      setActiveResults([item.url]);
                      setPrompt(item.prompt);
                      setSelectedRatio(item.aspectRatio);
                      setSelectedModel(item.model);
                      playSound('/audio/rounded.ogg');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="group relative cursor-pointer overflow-hidden border border-[#2E2B25] hover:border-amber-500 bg-zinc-950 rounded-xl transition-all aspect-square flex items-center justify-center shadow-xs"
                    title="Click to reload this creation into main editor workspace"
                  >
                    <img 
                      src={urlPrefixChecker(item.url)} 
                      alt={item.prompt}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-350"
                      referrerPolicy="no-referrer"
                    />

                    {/* Dark gradient and details overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col justify-between p-2">
                      <div className="flex justify-end pr-0.5">
                        <button
                          onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                          className="p-1.5 bg-black/80 hover:bg-red-950 border border-zinc-700/60 hover:border-red-500 rounded text-[#999288] hover:text-white transition-colors cursor-pointer"
                          title="Delete generation archive"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      
                      <div className="space-y-0.5">
                        <p className="text-[9px] text-[#FCFBF9] truncate font-semibold leading-tight">
                          "{item.prompt}"
                        </p>
                        <div className="flex items-center justify-between text-[8px] text-[#999288] font-mono leading-none">
                          <span>Ratio: {item.aspectRatio}</span>
                          <span>{new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox / High-Res Overlay Modal */}
      {lightboxIndex !== null && (
        <div 
          onClick={() => setLightboxIndex(null)}
          className="fixed inset-0 bg-black/95 z-99 flex flex-col items-center justify-center p-4 md:p-8 animate-fade-in cursor-zoom-out"
          id="imagen-lightbox-modal"
        >
          <div className="absolute top-4 right-4 flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => handleCopyBase64(activeResults[lightboxIndex])}
              className="px-3.5 py-1.5 bg-[#2E2B25] border border-[#403B31] text-[#FCFBF9] rounded-xl hover:bg-[#3D382E] text-xs font-mono tracking-wide transition-all cursor-pointer mr-1"
            >
              Copy Base64 Byte-String
            </button>
            <button
              onClick={() => triggerDownload(activeResults[lightboxIndex], `imagen-lightbox-${Date.now()}.png`)}
              className="p-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-full transition-colors cursor-pointer"
              title="Download image asset"
            >
              <Download className="w-5 h-5 animate-pulse" />
            </button>
            <button 
              onClick={() => setLightboxIndex(null)}
              className="p-2.5 bg-zinc-800 text-zinc-300 hover:text-white rounded-full transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="w-full max-w-5xl max-h-[85vh] flex items-center justify-center relative select-none">
            <img 
              src={activeResults[lightboxIndex]} 
              alt={prompt}
              className="max-h-[80vh] max-w-full object-contain rounded-lg shadow-2xl border border-zinc-800/40"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="mt-4 text-center max-w-2xl px-4 pointer-events-none select-none">
            <p className="text-xs text-white line-clamp-3 bg-black/60 px-4 py-2 rounded-xl border border-white/5 pointer-events-auto select-all selection:bg-amber-600/30">
              "{prompt}"
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Security: ensures a valid fallback prefix for images
function urlPrefixChecker(urlStr: string): string {
  if (!urlStr) return '';
  if (urlStr.startsWith('data:') || urlStr.startsWith('http') || urlStr.startsWith('/')) {
    return urlStr;
  }
  return `data:image/png;base64,${urlStr}`;
}
