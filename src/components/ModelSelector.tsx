import React, { useState, useRef, useEffect } from 'react';
import { 
  ChevronDown, 
  Check, 
  Cpu, 
  Zap, 
  Globe, 
  Sparkles, 
  Award, 
  Search, 
  Bot, 
  Workflow, 
  Brain, 
  Radio, 
  Milestone, 
  Compass, 
  Sliders
} from 'lucide-react';
import { ModelType } from '../types';

interface ModelSelectorProps {
  selectedModel: ModelType;
  onChange: (model: ModelType) => void;
  searchGrounding?: boolean;
}

export default function ModelSelector({ selectedModel, onChange, searchGrounding = false }: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Standard models for regular chat
  const standardModels = [
    {
      type: 'gemini-3.5-flash' as ModelType,
      name: 'Gemini 3.5 Flash',
      desc: 'Smart, highly capable & structured reasoning',
      icon: Cpu,
      iconColor: 'text-amber-500',
      category: 'Standard Chat'
    },
    {
      type: 'gemini-3.1-flash-lite' as ModelType,
      name: 'Gemini 3.1 Flash-Lite',
      desc: 'Extremely fast, lightweight & responsive',
      icon: Zap,
      iconColor: 'text-yellow-500',
      category: 'Standard Chat'
    },
  ];

  // Grounding-specific models requested by user
  const groundingModels = [
    {
      type: 'models/gemini-2.5-flash-lite' as ModelType,
      name: 'Gemini 2.5 Flash-Lite (Default)',
      desc: 'Super lightweight, optimized for sub-second responses with Search',
      icon: Sliders,
      iconColor: 'text-emerald-500',
      category: 'Search Grounding'
    }
  ];

  const models = searchGrounding ? groundingModels : standardModels;
  const activeModel = models.find(m => m.type === selectedModel) || models[0];

  // Group models by category to make it incredibly polished and readable
  const categories = Array.from(new Set(models.map(m => m.category)));

  return (
    <div className="relative" ref={dropdownRef} id="model-selector-container">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-full border transition-all duration-200 cursor-pointer text-claude-text ${
          searchGrounding 
            ? 'bg-amber-50/10 hover:bg-amber-50/20 border-amber-500/30' 
            : 'bg-claude-card hover:bg-claude-border border-claude-border'
        }`}
        id="model-selector-button"
      >
        <activeModel.icon className={`w-4 h-4 ${activeModel.iconColor}`} />
        <span className="truncate max-w-[120px] md:max-w-[200px]">{activeModel.name}</span>
        <ChevronDown className="w-3.5 h-3.5 text-claude-secondary" />
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 mt-2 w-80 rounded-xl bg-claude-bubble-ai border border-claude-border shadow-xl z-50 overflow-hidden transform origin-top flex flex-col`}
          id="model-selector-dropdown"
        >
          <div className="p-3 text-xs font-bold text-claude-secondary uppercase tracking-wider border-b border-claude-border bg-claude-card/50 flex items-center justify-between">
            <span>Select {searchGrounding ? 'Search Grounded' : 'Intelligence'} Model</span>
            {searchGrounding && (
              <span className="text-[10px] bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded-full font-bold">
                Grounding Active
              </span>
            )}
          </div>
          
          <div className="max-h-[380px] overflow-y-auto p-1.5 flex flex-col gap-2 custom-scrollbar">
            {categories.map(cat => (
              <div key={cat} className="flex flex-col gap-0.5 select-none text-[11px] font-bold text-claude-secondary/70">
                <div className="px-2.5 py-1 uppercase tracking-widest text-[10px] border-b border-claude-border/30 mb-1">
                  {cat}
                </div>
                {models
                  .filter(m => m.category === cat)
                  .map(m => {
                    const Icon = m.icon;
                    const isSelected = m.type === selectedModel;
                    return (
                      <button
                        key={m.type}
                        onClick={() => {
                          onChange(m.type);
                          setIsOpen(false);
                        }}
                        className={`flex items-start gap-3 p-2.5 rounded-lg text-left transition-all duration-200 cursor-pointer ${
                          isSelected ? 'bg-claude-card' : 'hover:bg-claude-card/50'
                        }`}
                      >
                        <div className="mt-1 shrink-0">
                          <Icon className={`w-4 h-4 ${m.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold text-claude-text block truncate mr-2">
                              {m.name}
                            </span>
                            {isSelected && <Check className="w-4 h-4 text-claude-accent shrink-0" />}
                          </div>
                          <span className="text-xs text-claude-secondary mt-0.5 block leading-normal">
                            {m.desc}
                          </span>
                        </div>
                      </button>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
