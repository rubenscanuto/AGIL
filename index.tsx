import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, Type, Schema, Part } from "@google/genai";
import * as mammoth from "mammoth";
import ReactMarkdown from "react-markdown";

// --- Types ---

interface Party {
  role: string;
  name: string;
  advogado?: string;
}

interface SessionMetadata {
  id?: string; // L-xxxx
  createdAt?: number;
  orgao: string;
  relator: string;
  data: string;
  tipo: string;
  hora: string;
  total_processos: string;
}

interface NoteData {
    id: string;
    text: string;
    createdAt: number;
}

interface VoteData {
    id: string;
    type: string; 
    timestamp: number;
}

interface CaseData {
  internalId: string; // P-xxxx
  contentHash?: string; // For caching/token economy
  chamada: number;
  numero_processo: string;
  classe: string;
  partes: Party[];
  juiz_sentenciante?: string;
  ementa: string; 
  resumo_estruturado: string; 
  tags?: string[];
  observacao?: string;
  notes?: NoteData;
  status?: 'pending' | 'reviewed';
  voto?: VoteData;
}

interface ContentPayload {
  type: 'text' | 'pdf';
  data: string; 
  mimeType?: string;
  filename?: string;
}

interface SavedSession {
  id: string; // L-xxxx
  metadata: SessionMetadata;
  cases: CaseData[];
  dateSaved: number;
}

interface LogEntry {
    id: string;
    timestamp: number;
    action: string;
    details: string;
    targetId?: string;
}

interface AIProviderConfig {
    name: string;
    key: string;
    model: string;
}

interface AISettings {
    activeProvider: 'google' | 'openai' | 'anthropic';
    configs: {
        google: AIProviderConfig;
        openai: AIProviderConfig;
        anthropic: AIProviderConfig;
    };
    temperature: number;
}

// --- Icons ---

const Icons = {
    Google: () => (
        <svg viewBox="0 0 24 24" className="w-5 h-5">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
    ),
    OpenAI: () => (
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-black">
            <path fill="currentColor" d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.0462 6.0462 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.53-2.0226v-.356a4.47 4.47 0 0 1 1.2905-3.2046l.1418.082 4.7783 2.7582a.7948.7948 0 0 0 .7853 0l5.8365-3.3698 2.02 1.1686a.071.071 0 0 1 .012.063l-2.02 5.5826a4.504 4.504 0 0 1-4.4945 4.4944 4.4852 4.4852 0 0 1-3.32-1.6033zM6.619 3.0125a4.4755 4.4755 0 0 1 2.8764 1.0408l-.1419.0804-4.7783 2.7582a.7948.7948 0 0 0-.3927.6813v6.7369l-2.02-1.1686a.071.071 0 0 1-.038-.052V7.5066A4.504 4.504 0 0 1 6.619 3.0125zm9.6607 4.1254a4.4708 4.4708 0 0 1 .53 2.0226v.356a4.47 4.47 0 0 1-1.2905 3.2046l-.1418-.082-4.7783-2.7582a.7948.7948 0 0 0-.7853 0L3.9772 13.2507l-2.02-1.1686a.071.071 0 0 1-.012-.063l2.02-5.5826a4.504 4.504 0 0 1 4.4945-4.4944 4.4852 4.4852 0 0 1 3.32 1.6033zm2.5938 12.0125a4.47 4.47 0 0 1-3.2045 1.2905h-.356a4.47 4.47 0 0 1-2.0226-.53l.0819-.1418 2.7582-4.7783a.7948.7948 0 0 0 0-.7853L10.5101 8.369l1.1686-2.02a.071.071 0 0 1 .0632-.012l5.5826 2.02a4.504 4.504 0 0 1 1.6032 3.32v4.4945z"/>
        </svg>
    ),
    Anthropic: () => (
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-stone-800">
             <path fill="#D9Cbb3" d="M17.43 19.37H6.57L4.25 21H2l6.9-18h6.2l6.9 18h-2.25l-2.32-1.63zM9.32 17h5.36l-2.68-9.45L9.32 17z"/>
        </svg>
    ),
    Trash: () => (
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-400 hover:text-red-500 transition-colors">
            <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
    ),
    Eraser: () => (
        <svg viewBox="0 0 24 24" className="w-4 h-4">
            <path fill="currentColor" d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 0 1-5.66 0L2.81 17a4.008 4.008 0 0 1 0-5.66l9.66-9.66c.78-.78 2.05-.78 2.83 0l.94.94zM4.22 15.59l3.54 3.53c.78.79 2.04.79 2.83 0L12 17.71l-6.36-6.36-1.42 1.42a2.003 2.003 0 0 0 0 2.82z"/>
        </svg>
    ),
    Check: () => (
        <svg viewBox="0 0 24 24" className="w-5 h-5 text-emerald-500">
             <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
    ),
    ChevronDown: () => (
        <svg viewBox="0 0 24 24" className="w-4 h-4 text-slate-500">
            <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
        </svg>
    ),
    Eye: () => (
        <svg viewBox="0 0 24 24" className="w-4 h-4">
            <path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-1.34-3-3-1.34-3-3-1.34-3-3-1.34-3-3-1.34-3-3-3z"/>
        </svg>
    ),
    EyeOff: () => (
        <svg viewBox="0 0 24 24" className="w-4 h-4">
            <path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 3.1 0 5.9-1.5 7.67-3.89l1.05 1.05 1.28 1.28L23.73 21 21 21.01l-19-19 .01.26zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
        </svg>
    ),
    Edit: () => (
        <svg viewBox="0 0 24 24" className="w-4 h-4">
             <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
        </svg>
    ),
    Zap: () => (
        <svg viewBox="0 0 24 24" className="w-4 h-4">
            <path fill="currentColor" d="M7 2v11h3v9l7-12h-4l4-8z"/>
        </svg>
    )
};

// --- ID Generation, Logging & Caching Services ---

const getNextId = (prefix: string): string => {
    const key = `jurispanel_counter_${prefix}`;
    const current = parseInt(localStorage.getItem(key) || "0", 10);
    const next = current + 1;
    localStorage.setItem(key, next.toString());
    return `${prefix}-${String(next).padStart(3, '0')}`;
};

const getVotePrefix = (voteType: string) => {
    switch (voteType) {
        case 'Concordo': return 'VC';
        case 'Concordo em Parte': return 'VP';
        case 'Discordo': return 'VD';
        case 'Destaque': return 'VDE';
        case 'Vista': return 'VV';
        default: return 'VO';
    }
};

const addSystemLog = (action: string, details: string, targetId?: string) => {
    const logs: LogEntry[] = JSON.parse(localStorage.getItem('jurispanel_logs') || "[]");
    const newLog: LogEntry = {
        id: getNextId('LOG'),
        timestamp: Date.now(),
        action,
        details,
        targetId
    };
    logs.unshift(newLog);
    if (logs.length > 1000) logs.pop();
    localStorage.setItem('jurispanel_logs', JSON.stringify(logs));
    return newLog;
};

// Simple DJB2 hash for string content to identify duplicates
const generateContentHash = (str: string) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
};

// Database simulation (localStorage wrapper)
const DB = {
    getCachedAnalysis: (hash: string): CaseData[] | null => {
        const cache = localStorage.getItem(`jurispanel_cache_${hash}`);
        return cache ? JSON.parse(cache) : null;
    },
    saveToCache: (hash: string, data: CaseData[]) => {
        try {
            localStorage.setItem(`jurispanel_cache_${hash}`, JSON.stringify(data));
        } catch (e) {
            console.warn("Quota exceeded for cache");
        }
    }
};

// --- Gemini Configuration ---

// We initialize this dynamically based on settings in the real app, 
// but for the sake of the variable availability, we create a factory.
const getAIClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

const listParsingSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      chamada: { type: Type.INTEGER, description: "Número de ordem sequencial." },
      observacao: { type: Type.STRING, description: "Apenas se houver (Vista, Destaque, etc). Se vazio, retorne null." },
      numero_processo: { type: Type.STRING },
      classe: { type: Type.STRING },
      partes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            role: { type: Type.STRING, description: "Ex: Apelante, Agravado." },
            name: { type: Type.STRING, description: "Nome da parte." },
            advogado: { type: Type.STRING, description: "Nome do advogado desta parte específica (se houver)."}
          }
        }
      },
      ementa: { type: Type.STRING, description: "O texto original integral da Ementa." },
      resumo_estruturado: { type: Type.STRING, description: "Texto completo formatado com capítulos." },
      tags: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING }, 
          description: "Lista de 5 a 8 tags (expressões nominais curtas) com institutos jurídicos, temas decisórios ou categorias normativas relevantes." 
      }
    },
    required: ["chamada", "numero_processo", "resumo_estruturado", "partes", "ementa", "tags"]
  }
};

// --- Helpers ---

const cleanObservation = (obs?: string) => {
  if (!obs) return null;
  const lower = obs.trim().toLowerCase();
  if (['null', 'nulo', 'none', '', 'undefined'].includes(lower)) return null;
  return obs;
};

// --- Components ---

const EnhancedInput = ({ value, onChange, placeholder, type = "text" }: { value: string, onChange: (val: string) => void, placeholder: string, type?: string }) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";
    const actualType = isPassword && showPassword ? "text" : type;

    return (
        <div className="relative w-full">
            <input 
                type={actualType}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full p-3 pr-16 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none transition-all placeholder-slate-400"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {isPassword && (
                    <button 
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors rounded hover:bg-slate-100"
                        title={showPassword ? "Ocultar" : "Mostrar"}
                    >
                        {showPassword ? <Icons.EyeOff /> : <Icons.Eye />}
                    </button>
                )}
                {value && (
                    <button 
                        onClick={() => onChange("")}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors rounded hover:bg-slate-100 font-bold"
                        title="Limpar campo"
                    >
                        ✕
                    </button>
                )}
            </div>
        </div>
    );
};

const AIStatusBadge = ({ settings, onOpenSettings }: { settings: AISettings, onOpenSettings: () => void }) => {
    const activeConfig = settings.configs[settings.activeProvider];
    
    const renderProviderIcon = (p: string) => {
        if(p === 'google') return <Icons.Google />;
        if(p === 'openai') return <Icons.OpenAI />;
        return <Icons.Anthropic />;
    };

    return (
        <button 
            onClick={onOpenSettings}
            className="fixed bottom-4 right-4 z-[90] bg-white/90 backdrop-blur-sm border border-slate-200 shadow-lg rounded-full px-4 py-2 flex items-center gap-3 hover:scale-105 transition-transform hover:border-indigo-300 group animate-slide-up"
            title="Configurações de IA Ativa"
        >
            <div className="relative">
                <div className="p-1.5 bg-slate-50 rounded-full border border-slate-100 group-hover:bg-white transition-colors">
                     {renderProviderIcon(settings.activeProvider)}
                </div>
                <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"></div>
            </div>
            <div className="flex flex-col items-start leading-none">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">IA Ativa</span>
                <span className="text-xs font-bold text-indigo-900 flex items-center gap-1">
                    {activeConfig.name} 
                    <span className="text-slate-300 mx-0.5">•</span> 
                    <span className="text-slate-500 font-normal truncate max-w-[100px]">{activeConfig.model}</span>
                </span>
            </div>
        </button>
    );
};

const Header = ({ 
  toggleView, 
  currentView, 
  onExportDocx, 
  onPrint, 
  hasData,
  onSaveSession,
  onOpenLogs,
  onOpenTrash,
  onOpenSettings,
  onIngestLegacy,
  onNewList
}: { 
  toggleView: () => void, 
  currentView: 'dashboard' | 'report',
  onExportDocx: () => void,
  onPrint: () => void,
  hasData: boolean,
  onSaveSession: () => void,
  onOpenLogs: () => void,
  onOpenTrash: () => void,
  onOpenSettings: () => void,
  onIngestLegacy: (files: FileList) => void,
  onNewList: () => void
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const legacyInputRef = useRef<HTMLInputElement>(null);

    return (
      <header className="bg-gradient-to-r from-indigo-800 to-indigo-900 text-white p-4 shadow-lg flex justify-between items-center sticky top-0 z-50 no-print h-[70px]">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 backdrop-blur-sm p-2 rounded-xl border border-white/20">
            <span className="text-2xl">⚖️</span>
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-[0.25em] text-white font-serif">AGIL</h1>
            <p className="text-[10px] text-indigo-200 uppercase tracking-widest font-medium">Assistente de Gabinete e Inteligência Legal</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {hasData && (
            <>
              <button 
                 onClick={onSaveSession}
                 className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 rounded-md transition-all flex items-center gap-2 shadow-sm border border-emerald-400"
                 title="Salvar Sessão no Banco de Dados"
               >
                 <span>💾</span> Salvar
               </button>
               
              <div className="bg-white/10 rounded-lg p-1 flex items-center gap-1 border border-white/20 mr-2">
                 <button onClick={onExportDocx} className="px-3 py-1.5 text-xs font-bold hover:bg-white/20 rounded-md transition-all flex items-center gap-2" title="Baixar .doc">
                   DOCX
                 </button>
                 <div className="w-px h-4 bg-white/30"></div>
                 <button onClick={onPrint} className="px-3 py-1.5 text-xs font-bold hover:bg-white/20 rounded-md transition-all flex items-center gap-2" title="PDF">
                   PDF
                 </button>
              </div>
    
              <button
                onClick={toggleView}
                className="px-4 py-2 bg-indigo-700 hover:bg-indigo-600 border border-indigo-500 rounded-full text-xs font-bold uppercase tracking-wide transition-all flex items-center gap-2 shadow-lg"
              >
                {currentView === 'dashboard' ? '📄 Ver Relatório' : '🖥️ Modo Interativo'}
              </button>
            </>
          )}
          
          <div className="h-6 w-px bg-indigo-600 mx-1"></div>
    
          {/* Main Menu Button */}
          <div className="relative">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white font-bold transition-all flex items-center gap-2"
                title="Menu Principal"
              >
                <span>☰</span>
              </button>
              
              {isMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl z-50 overflow-hidden border border-slate-200 animate-slide-up text-slate-800">
                        <div className="bg-slate-50 p-3 border-b border-slate-100">
                            <span className="text-xs font-bold text-slate-400 uppercase">Sistema</span>
                        </div>
                        {/* Menu Items Reordered */}
                        <button onClick={() => { onOpenSettings(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center gap-3 text-sm font-medium text-indigo-700 bg-indigo-50/50 border-b border-indigo-100">
                            <span>⚙️</span> Chaves de IA
                        </button>
                        <button onClick={() => { onNewList(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center gap-3 text-sm font-medium border-b border-slate-100">
                            <span>📄</span> Nova Lista de Julgamento
                        </button>
                        <button onClick={() => { legacyInputRef.current?.click(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center gap-3 text-sm font-medium border-b border-slate-100">
                            <span>📥</span> Carregar Legado (Batch)
                        </button>
                        <button onClick={() => { onOpenLogs(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-indigo-50 flex items-center gap-3 text-sm font-medium border-b border-slate-100">
                            <span>📋</span> Acessar Logs
                        </button>
                        <button onClick={() => { onOpenTrash(); setIsMenuOpen(false); }} className="w-full text-left px-4 py-3 hover:bg-red-50 flex items-center gap-3 text-sm font-medium text-red-600">
                            <span>🗑️</span> Lixeira
                        </button>
                    </div>
                  </>
              )}
          </div>
        </div>
        <input type="file" ref={legacyInputRef} className="hidden" multiple accept=".pdf,.docx" onChange={e => e.target.files && onIngestLegacy(e.target.files)} />
      </header>
    );
};

const SettingsModal = ({ show, onClose, settings, setSettings }: { show: boolean, onClose: () => void, settings: AISettings, setSettings: (s: AISettings) => void }) => {
    // Form state for adding/editing a key
    const [selectedProvider, setSelectedProvider] = useState<'google' | 'openai' | 'anthropic'>('google');
    const [formName, setFormName] = useState('');
    const [formKey, setFormKey] = useState('');
    const [formModel, setFormModel] = useState('');

    const MODELS = {
        google: [
            { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash [$]' },
            { value: 'gemini-3-pro-preview', label: 'Gemini 3.0 Pro [$$]' },
            { value: 'gemini-2.0-flash-lite-preview-02-05', label: 'Gemini 2.0 Flash Lite [$]' }
        ],
        openai: [
            { value: 'gpt-4o', label: 'GPT-4o [$$]' },
            { value: 'gpt-4o-mini', label: 'GPT-4o Mini [$]' },
            { value: 'o1-preview', label: 'o1 Preview (Reasoning) [$$$]' },
            { value: 'o1-mini', label: 'o1 Mini (Reasoning) [$$]' },
            { value: 'gpt-4-turbo', label: 'GPT-4 Turbo [$$$]' }
        ],
        anthropic: [
            { value: 'claude-3-5-sonnet-20240620', label: 'Claude 3.5 Sonnet [$$]' },
            { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus [$$$]' },
            { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku [$]' }
        ]
    };

    useEffect(() => {
        if(show) {
            // Reset form on open, defaulting to Google
            setSelectedProvider('google');
            setFormName('');
            setFormKey('');
            setFormModel('gemini-2.5-flash');
        }
    }, [show]);

    // Update model dropdown when provider changes
    useEffect(() => {
        // Only reset model if it doesn't match the current provider's available models
        // Ideally we check if formModel is in MODELS[selectedProvider]
        const validModels = MODELS[selectedProvider].map(m => m.value);
        if (!validModels.includes(formModel)) {
             if (selectedProvider === 'google') setFormModel('gemini-2.5-flash');
             else if (selectedProvider === 'openai') setFormModel('gpt-4o');
             else if (selectedProvider === 'anthropic') setFormModel('claude-3-5-sonnet-20240620');
        }
    }, [selectedProvider]);

    if (!show) return null;
    
    const handleSaveKey = () => {
        const newConfigs = { ...settings.configs };
        
        // For security in this demo, Google key is always env-managed if empty
        let finalKey = formKey;
        if(selectedProvider === 'google' && !finalKey) finalKey = ""; // Use env

        newConfigs[selectedProvider] = {
            name: formName || `${selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)} Key`,
            key: finalKey,
            model: formModel
        };

        setSettings({
            ...settings,
            activeProvider: selectedProvider,
            configs: newConfigs
        });
        
        // Clear sensitive fields
        setFormKey('');
        setFormName('');
        alert(`Chave para ${selectedProvider} atualizada e definida como ativa!`);
    };

    const handleDeleteKey = (provider: 'google' | 'openai' | 'anthropic') => {
        if(confirm(`Remover configuração de ${provider}?`)) {
            const newConfigs = { ...settings.configs };
            newConfigs[provider] = { name: '', key: '', model: '' }; // Reset
            // If deleting active, switch to Google default
            let newActive = settings.activeProvider;
            if (settings.activeProvider === provider) newActive = 'google';
            
            setSettings({
                ...settings,
                activeProvider: newActive,
                configs: newConfigs
            });
        }
    };

    const handleEditKey = (provider: 'google' | 'openai' | 'anthropic') => {
        const config = settings.configs[provider];
        setSelectedProvider(provider);
        setFormName(config.name);
        setFormKey(config.key);
        setFormModel(config.model);
    };

    const handleActivateKey = (provider: 'google' | 'openai' | 'anthropic') => {
        setSettings({
            ...settings,
            activeProvider: provider
        });
    };

    const renderProviderIcon = (p: string) => {
        if(p === 'google') return <Icons.Google />;
        if(p === 'openai') return <Icons.OpenAI />;
        return <Icons.Anthropic />;
    };

    // Filter AND Sort: Active first, then alphabet or others
    const configuredProviders = Object.entries(settings.configs)
        .filter(([key, config]) => {
            if (key === 'google') return true;
            return !!config.key; 
        })
        .sort(([keyA], [keyB]) => {
            if (keyA === settings.activeProvider) return -1;
            if (keyB === settings.activeProvider) return 1;
            return 0;
        });

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white w-full max-w-2xl max-h-[90vh] rounded-xl shadow-2xl overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="p-8 pb-0">
                    <h2 className="text-2xl font-bold text-slate-800">Chaves de API</h2>
                    <p className="text-slate-500 text-sm mt-1">Configure os provedores de Inteligência Artificial.</p>
                </div>

                <div className="p-8 space-y-8">
                    
                    {/* Card de Cadastro */}
                    <div className="border border-slate-200 rounded-xl p-6 shadow-sm bg-white">
                        <h3 className="text-lg font-bold text-slate-700 flex items-center gap-2 mb-6">
                            <span className="text-indigo-600">+</span> Cadastrar / Atualizar Chave
                        </h3>
                        
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-700 mb-1 block">Provedor LLM</label>
                                    <div className="relative">
                                        <select 
                                            value={selectedProvider} 
                                            onChange={(e) => setSelectedProvider(e.target.value as any)}
                                            className="w-full p-3 pl-10 pr-8 border border-slate-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-indigo-100 outline-none"
                                        >
                                            <option value="google">Google Gemini</option>
                                            <option value="openai">OpenAI</option>
                                            <option value="anthropic">Anthropic</option>
                                        </select>
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            {renderProviderIcon(selectedProvider)}
                                        </div>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <Icons.ChevronDown />
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-700 mb-1 block">Modelo</label>
                                    <div className="relative">
                                        <select 
                                            value={formModel}
                                            onChange={(e) => setFormModel(e.target.value)}
                                            className="w-full p-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-100 outline-none appearance-none"
                                        >
                                            {MODELS[selectedProvider].map(m => (
                                                <option key={m.value} value={m.value}>{m.label}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                                            <Icons.ChevronDown />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 mb-1 block">Nome da Chave (Rótulo)</label>
                                <EnhancedInput 
                                    value={formName} 
                                    onChange={setFormName} 
                                    placeholder="Ex: Gemini Pessoal" 
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-700 mb-1 block">Chave de API (Secret Key)</label>
                                <EnhancedInput 
                                    value={formKey} 
                                    onChange={setFormKey} 
                                    placeholder={selectedProvider === 'google' ? "Deixe vazio para usar a chave segura do sistema" : "sk-..."} 
                                    type="password"
                                />
                                <p className="text-[10px] text-slate-400 mt-1">A chave é armazenada localmente no seu navegador.</p>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button 
                                    onClick={handleSaveKey}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-6 rounded-lg shadow-sm transition-all flex items-center gap-2"
                                >
                                    <span>💾</span> Salvar Chave
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Lista de Chaves */}
                    <div>
                         <h3 className="text-lg font-bold text-slate-800 mb-4">Chaves Cadastradas</h3>
                         <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                             {configuredProviders.length === 0 && <p className="text-slate-400 text-sm">Nenhuma chave configurada.</p>}
                             {configuredProviders.map(([key, config]) => {
                                 const isActive = settings.activeProvider === key;
                                 const providerKey = key as 'google' | 'openai' | 'anthropic';
                                 return (
                                     <div key={key} className={`bg-white p-4 rounded-lg border flex justify-between items-center shadow-sm transition-all ${isActive ? 'border-emerald-400 ring-1 ring-emerald-100 bg-emerald-50/10' : 'border-slate-200'}`}>
                                         <div className="flex items-center gap-4">
                                             <div className={`p-3 rounded-full ${isActive ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                                                {renderProviderIcon(key)}
                                             </div>
                                             <div>
                                                 <div className="flex items-center gap-2">
                                                     <h4 className="font-bold text-slate-800 text-sm">{config.name || (key === 'google' ? 'Gemini Default' : key)}</h4>
                                                     {isActive && <span className="text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wide">Ativa</span>}
                                                 </div>
                                                 <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                                                     <span className="flex items-center gap-1">
                                                         <span>⚙️</span> {config.model}
                                                     </span>
                                                     <span className="flex items-center gap-1 bg-slate-100 px-1.5 rounded text-slate-400 font-mono">
                                                         ••••_{config.key ? config.key.slice(-4) : 'ENV'}
                                                     </span>
                                                 </div>
                                             </div>
                                         </div>
                                         <div className="flex gap-2">
                                            {!isActive && (
                                                <button
                                                    onClick={() => handleActivateKey(providerKey)}
                                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors group"
                                                    title="Ativar esta chave"
                                                >
                                                    <Icons.Zap />
                                                </button>
                                            )}
                                            <button 
                                                onClick={() => handleEditKey(providerKey)}
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors group"
                                                title="Editar Chave"
                                            >
                                                <Icons.Edit />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteKey(providerKey)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors group"
                                                title="Remover Chave"
                                            >
                                                <Icons.Trash />
                                            </button>
                                         </div>
                                     </div>
                                 );
                             })}
                         </div>
                    </div>

                </div>
                <div className="p-4 bg-slate-50 border-t flex justify-end sticky bottom-0 z-10">
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800 px-6 py-2 text-sm font-bold transition-all">Fechar</button>
                </div>
            </div>
        </div>
    );
};

// ... Logs and Trash Modals remain similar, simplified for brevity ...
const Modals = ({ 
    showLogs, setShowLogs, showTrash, setShowTrash, trashItems, restoreSession, permanentDeleteSession 
}: any) => {
    // Reusing the logic from previous step, ensuring logs and trash are displayed
    const [logs, setLogs] = useState<LogEntry[]>([]);
    useEffect(() => { if(showLogs) setLogs(JSON.parse(localStorage.getItem('jurispanel_logs') || "[]")); }, [showLogs]);

    if(showLogs) return (
         <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm" onClick={() => setShowLogs(false)}>
            <div className="bg-white w-full max-w-4xl max-h-[80vh] rounded-xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-slate-50 rounded-t-xl"><h2 className="font-bold text-lg text-slate-800">📋 Logs do Sistema</h2><button onClick={() => setShowLogs(false)}>✕</button></div>
                <div className="flex-1 overflow-auto"><table className="w-full text-xs text-left"><thead className="bg-slate-100 sticky top-0"><tr><th className="p-3">Data</th><th className="p-3">Ação</th><th className="p-3">Detalhes</th></tr></thead><tbody className="divide-y">{logs.map(log => <tr key={log.id}><td className="p-3 font-mono">{new Date(log.timestamp).toLocaleString()}</td><td className="p-3 font-bold">{log.action}</td><td className="p-3">{log.details}</td></tr>)}</tbody></table></div>
            </div>
        </div>
    );
    if(showTrash) return (
         <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm" onClick={() => setShowTrash(false)}>
            <div className="bg-white w-full max-w-3xl max-h-[80vh] rounded-xl shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-4 border-b flex justify-between items-center bg-red-50 rounded-t-xl"><h2 className="font-bold text-lg text-red-900">🗑️ Lixeira</h2><button onClick={() => setShowTrash(false)}>✕</button></div>
                <div className="flex-1 overflow-auto p-4 space-y-2">{trashItems.map((item: SavedSession) => <div key={item.id} className="bg-white p-3 border rounded shadow-sm flex justify-between items-center"><div><h4 className="font-bold">{item.metadata.orgao}</h4><span className="text-xs text-slate-500">{item.id}</span></div><div className="flex gap-2"><button onClick={()=>restoreSession(item)} className="text-green-600 font-bold text-xs">Restaurar</button><button onClick={()=>permanentDeleteSession(item.id)} className="text-red-600 font-bold text-xs">Excluir</button></div></div>)}</div>
            </div>
        </div>
    );
    return null;
};

const SessionInfoBar = ({ metadata, sessionId }: { metadata: SessionMetadata, sessionId?: string }) => (
  <div className="bg-indigo-100 border-b border-indigo-200 p-2 flex justify-between items-center text-sm text-indigo-900 shadow-inner px-6 no-print">
    <div className="flex items-center gap-6">
      {sessionId && <span className="font-mono text-xs font-bold bg-indigo-200 text-indigo-800 px-2 py-1 rounded shadow-sm border border-indigo-300" title="ID da Lista">{sessionId}</span>}
      <div className="flex items-center gap-2">
        <span className="text-indigo-500 text-lg">🏛️</span>
        <div className="flex flex-col leading-tight">
             <span className="text-[10px] text-indigo-500 uppercase font-bold tracking-wider">Tribunal Regional Federal da 5ª Região</span>
             <span className="font-bold text-base">{metadata.orgao}</span>
        </div>
      </div>
      <div className="w-px h-8 bg-indigo-300/50 mx-2"></div>
      <div className="flex items-center gap-2">
        <span className="text-indigo-500">👤</span>
        <span className="font-semibold">{metadata.relator}</span>
      </div>
    </div>
    <div className="flex items-center gap-6 font-mono text-xs">
      <span className="bg-white px-2 py-1 rounded border border-indigo-200">📅 {metadata.data}</span>
      <span className="bg-white px-2 py-1 rounded border border-indigo-200">⏰ {metadata.hora}</span>
      <span className="bg-indigo-600 text-white px-2 py-1 rounded font-bold uppercase">{metadata.tipo}</span>
    </div>
  </div>
);

const ProgressBar = ({ progress, estimatedTime, message }: { progress: number, estimatedTime: string, message: string }) => (
  <div className="w-full max-w-xl mx-auto mt-6 bg-white p-6 rounded-xl shadow-2xl border border-indigo-100 z-50">
    <div className="flex justify-between items-end mb-2">
      <span className="text-indigo-900 font-bold text-lg">{Math.round(progress)}%</span>
      <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
        Tempo Restante: {estimatedTime}
      </span>
    </div>
    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden mb-3">
      <div 
        className="bg-indigo-600 h-3 rounded-full transition-all duration-300 ease-linear"
        style={{ width: `${progress}%` }}
      ></div>
    </div>
    <p className="text-center text-slate-600 text-sm font-medium animate-pulse">{message}</p>
  </div>
);

const InputView = ({ onProcess, onLoadSession, onDeleteSession, savedSessions }: { onProcess: (payload: ContentPayload, metadata: SessionMetadata) => void, onLoadSession: (session: SavedSession) => void, onDeleteSession: (id: string) => void, savedSessions: SavedSession[] }) => {
  const [text, setText] = useState("");
  const [pdfFile, setPdfFile] = useState<{ name: string, data: string } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [metadata, setMetadata] = useState<SessionMetadata>({ orgao: "", relator: "", data: "", tipo: "", hora: "", total_processos: "" });
  const [isAnalyzingMetadata, setIsAnalyzingMetadata] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const autoFillMetadata = async (content: string, type: 'text' | 'pdf') => {
    setIsAnalyzingMetadata(true);
    try {
      const parts: Part[] = [
        { text: `Analise o documento. Extraia metadados da sessão.
        1. Órgão Julgador: Apenas a Turma/Seção (Ex: "4ª Turma"). REMOVA o nome do Tribunal.
        2. Tipo de Sessão: "Sessão Virtual", "Sessão Ordinária", "Sessão Extraordinária" ou "Sessão Presencial" (seja exato).
        Retorne JSON: { orgao, relator, data, hora, tipo }.` }
      ];
      if (type === 'pdf') parts.push({ inlineData: { mimeType: 'application/pdf', data: content } });
      else parts.push({ text: content.substring(0, 30000) });

      const response = await getAIClient().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: { responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } }
      });

      if (response.text) {
        const extracted = JSON.parse(response.text);
        setMetadata(prev => ({ ...prev, ...extracted }));
      }
    } catch (e) { console.error(e); } finally { setIsAnalyzingMetadata(false); }
  };

  const processFile = (file: File) => {
    if (file.type === "application/pdf") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        setPdfFile({ name: file.name, data: base64 });
        autoFillMetadata(base64, 'pdf');
      };
      reader.readAsDataURL(file);
    } else if (file.name.endsWith(".docx")) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const result = await mammoth.extractRawText({ arrayBuffer });
            setText(result.value);
            autoFillMetadata(result.value, 'text');
        };
        reader.readAsArrayBuffer(file);
    } else { // Text
       const reader = new FileReader();
       reader.onload = (e) => {
           const c = e.target?.result as string;
           setText(c);
           autoFillMetadata(c, 'text');
       };
       reader.readAsText(file);
    }
  };

  const handleSubmit = async () => {
    if ((!text.trim() && !pdfFile)) return;
    setIsProcessing(true);
    try {
      await onProcess({ type: pdfFile ? 'pdf' : 'text', data: pdfFile ? pdfFile.data : text }, metadata);
    } finally { setIsProcessing(false); }
  };

  return (
    <div className="max-w-6xl mx-auto mt-8 p-6 pb-20 grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 bg-white rounded-2xl shadow-xl overflow-hidden border border-indigo-50">
        <div className="bg-indigo-50/50 p-6 border-b border-indigo-100">
          <h2 className="text-2xl font-serif font-bold text-indigo-900 flex items-center gap-2">📂 Nova Sessão</h2>
        </div>
        <div className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <input type="text" value={metadata.orgao} onChange={e => setMetadata({...metadata, orgao: e.target.value})} placeholder="Órgão Julgador" className="p-3 border rounded-lg bg-slate-50" />
                <input type="text" value={metadata.relator} onChange={e => setMetadata({...metadata, relator: e.target.value})} placeholder="Relator" className="p-3 border rounded-lg bg-slate-50" />
                <input type="text" value={metadata.data} onChange={e => setMetadata({...metadata, data: e.target.value})} placeholder="Data" className="p-3 border rounded-lg bg-slate-50" />
                <select value={metadata.tipo} onChange={e => setMetadata({...metadata, tipo: e.target.value})} className="p-3 border rounded-lg bg-slate-50">
                    <option value="">Tipo de Sessão...</option>
                    <option>Sessão Ordinária</option>
                    <option>Sessão Virtual</option>
                    <option>Sessão Extraordinária</option>
                </select>
            </div>
            
            <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-indigo-200 rounded-xl p-8 text-center cursor-pointer hover:bg-indigo-50 transition-colors"
            >
                {pdfFile ? <span className="text-indigo-600 font-bold">{pdfFile.name}</span> : text ? <span className="text-slate-600">Texto carregado ({text.length} chars)</span> : <span className="text-slate-400">Clique para selecionar PDF ou DOCX</span>}
            </div>

            <button onClick={handleSubmit} disabled={isProcessing} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg">
                {isProcessing ? "Processando..." : "🚀 Iniciar Análise"}
            </button>
        </div>
        <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.docx,.txt" onChange={e => e.target.files?.[0] && processFile(e.target.files[0])} />
      </div>

      <div className="bg-slate-50 rounded-2xl border border-slate-200 shadow-lg flex flex-col h-[500px]">
         <div className="p-4 border-b border-slate-200 bg-white rounded-t-2xl">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">💾 Sessões Salvas (Base de Dados)</h3>
         </div>
         <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {savedSessions.length === 0 && <p className="text-center text-slate-400 text-sm mt-10">Nenhuma sessão salva.</p>}
            {savedSessions.map(s => (
                <div key={s.id} onClick={() => onLoadSession(s)} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:border-indigo-300 cursor-pointer group relative">
                    <div className="flex justify-between items-start mb-1">
                        <span className="font-mono text-[10px] bg-slate-100 text-slate-500 px-1 rounded">{s.id}</span>
                    </div>
                    <h4 className="font-bold text-indigo-900 text-sm">{s.metadata.orgao}</h4>
                    <p className="text-xs text-slate-500">{s.metadata.data} • {s.cases.length} processos</p>
                    <p className="text-[10px] text-slate-400 mt-1">Salvo em: {new Date(s.dateSaved).toLocaleDateString()}</p>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteSession(s.id); }}
                        className="absolute top-2 right-2 p-1 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Mover para Lixeira"
                    >
                        🗑️
                    </button>
                </div>
            ))}
         </div>
      </div>
    </div>
  );
};

const HighlightRoman = ({ children }: { children?: React.ReactNode }) => {
    if (typeof children !== 'string') return <>{children}</>;
    // Split by roman numerals in parentheses, case insensitive
    // Matches (i), (ii), (iii), (iv), (v), (vi) etc.
    const parts = children.split(/(\([ivx]+\))/gi);
    return (
        <>
            {parts.map((part, i) =>
                // Check if part is a roman numeral marker
                /^\([ivx]+\)$/i.test(part) ? (
                    <span key={i} className="bg-purple-100 text-purple-700 font-bold px-1.5 py-0.5 rounded mx-1 text-xs border border-purple-200">{part}</span>
                ) : (
                    part
                )
            )}
        </>
    );
};

const CaseSummaryRenderer = ({ content }: { content: string }) => {
  return (
    <div className="text-slate-900 leading-relaxed text-sm">
      <ReactMarkdown
        components={{
          h3: ({node, ...props}) => (
             <h3 className="text-blue-700 font-bold text-center uppercase mt-6 mb-2 tracking-wide text-base" {...props} />
          ),
          strong: ({node, ...props}) => <strong className="font-bold text-black" {...props} />,
          li: ({node, children, ...props}) => <li className="mb-2 ml-4 list-disc text-justify pl-1" {...props}>
             <HighlightRoman>{children}</HighlightRoman>
          </li>,
          p: ({node, children, ...props}) => <p className="mb-3 text-justify indent-0" {...props}><HighlightRoman>{children}</HighlightRoman></p>
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

const Dashboard = ({ cases, handleVoteUnified, updateCase, selectedBatchIds, toggleBatchSelection, toggleSelectAll, metadata }: any) => {
  const getCaseKey = (c: CaseData, index: number) => c.internalId || `${c.chamada}-${index}`;
  const [selectedKey, setSelectedKey] = useState<string | null>(cases.length > 0 ? getCaseKey(cases[0], 0) : null);
  
  // Resizable Sidebar State
  const [sidebarWidth, setSidebarWidth] = useState(380);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);

  // Note editing state
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [tempNote, setTempNote] = useState("");

  // Ementa Modal State
  const [showEmenta, setShowEmenta] = useState(false);

  useEffect(() => {
    if (cases.length > 0 && !selectedKey) setSelectedKey(getCaseKey(cases[0], 0));
  }, [cases, selectedKey]);

  const selectedIndex = cases.findIndex((c: CaseData, i: number) => getCaseKey(c, i) === selectedKey);
  const selectedCase = selectedIndex >= 0 ? cases[selectedIndex] : null;

  useEffect(() => {
      if(selectedCase) {
          setTempNote(selectedCase.notes?.text || "");
          setIsEditingNote(!!selectedCase.notes);
          setShowEmenta(false);
      }
  }, [selectedCase]);

  // Handle Resize Logic
  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => { isResizing.current = true; }, []);
  const stopResizing = useCallback(() => { isResizing.current = false; }, []);
  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing.current) {
      const newWidth = mouseMoveEvent.clientX;
      if (newWidth > 250 && newWidth < 800) setSidebarWidth(newWidth);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const saveNote = () => {
      if (selectedCase) {
          const noteId = selectedCase.notes?.id || getNextId('N');
          const note: NoteData = { id: noteId, text: tempNote, createdAt: Date.now() };
          updateCase({ ...selectedCase, notes: note });
          setIsEditingNote(true);
          addSystemLog(selectedCase.notes ? "Anotação Atualizada" : "Anotação Criada", `Nota no processo ${selectedCase.numero_processo}`, noteId);
      }
  };

  const deleteNote = () => {
      if(confirm("Tem certeza que deseja excluir esta anotação?")) {
          if (selectedCase?.notes) addSystemLog("Anotação Excluída", `Nota ${selectedCase.notes.id} removida`, selectedCase.notes.id);
          updateCase({...selectedCase, notes: undefined});
          setTempNote('');
          setIsEditingNote(false);
      }
  };

  if (!selectedCase) return <div>Nenhum caso.</div>;
  
  const obs = cleanObservation(selectedCase.observacao);

  // Wrapper for vote buttons that uses the unified logic
  const onVoteClick = (type: string | null) => {
      handleVoteUnified(type, selectedCase);
  };

  return (
    <div className="flex h-[calc(100vh-112px)] overflow-hidden bg-slate-100 select-none">
      {/* Sidebar */}
      <div 
        ref={sidebarRef}
        style={{ width: sidebarWidth }} 
        className="bg-white border-r border-slate-200 flex flex-col shadow-xl z-20 shrink-0 relative"
      >
        <div className="p-3 bg-slate-50 border-b border-slate-200 shadow-sm relative h-12 flex items-center">
             {/* Left: Select All */}
             <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                 <input 
                     type="checkbox" 
                     checked={cases.length > 0 && selectedBatchIds.size === cases.length}
                     onChange={toggleSelectAll}
                     className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                     title="Marcar/Desmarcar Todos"
                 />
                 <span className="text-[10px] font-bold text-slate-500 uppercase cursor-pointer" onClick={toggleSelectAll}>Todos</span>
             </div>
             
             {/* Center: Title */}
             <div className="w-full text-center">
                <span className="text-xs font-bold text-indigo-900 uppercase tracking-widest">PAUTA DE JULGAMENTOS</span>
                <span className="ml-2 bg-indigo-100 text-indigo-700 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{cases.length}</span>
             </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-4">
          {cases.map((c: CaseData, idx: number) => {
            const currentKey = getCaseKey(c, idx);
            const active = selectedKey === currentKey;
            const itemObs = cleanObservation(c.observacao);
            const isBatchSelected = selectedBatchIds.has(currentKey);

            return (
              <div key={currentKey} onClick={() => setSelectedKey(currentKey)} className={`p-3 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-all group relative ${active ? 'bg-indigo-50/50' : ''}`}>
                
                {/* Visual Active Indicator (Left Border) */}
                {active && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-600"></div>}

                {itemObs && <div className="mb-1 ml-6"><span className="text-[10px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded uppercase">{itemObs}</span></div>}
                
                <div className="flex items-center gap-3">
                  {/* Left: Batch Checkbox */}
                  <div className="w-6 flex justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
                     <input 
                        type="checkbox" 
                        checked={isBatchSelected} 
                        onChange={(e) => toggleBatchSelection(e, currentKey)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                     />
                  </div>

                  {/* Chamada Badge (Emphasized/Styled) */}
                  <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-xl font-bold shrink-0 shadow-sm border-2 ${active ? 'bg-indigo-700 text-white border-indigo-800' : 'bg-white text-slate-700 border-indigo-100'}`}>
                      {c.chamada}
                  </span>
                  
                  {/* Details */}
                  <div className="flex-1 min-w-0">
                     <p className={`text-sm font-bold truncate ${active ? 'text-indigo-900' : 'text-slate-700'}`}>{c.classe}</p>
                     <div className="flex items-center gap-2">
                        <p className="text-xs text-slate-500 truncate font-mono">{c.numero_processo}</p>
                        {c.contentHash && <span className="text-[8px] text-emerald-500 font-bold" title="Análise do Cache">⚡</span>}
                     </div>
                  </div>

                  {/* Right: Vote - Updated Layout (Icon Top, Text Bottom) */}
                  <div className="w-16 flex justify-end shrink-0 ml-1" onClick={(e) => e.stopPropagation()}>
                      {c.voto ? (
                         <div className="flex flex-col items-center justify-center w-full" title={`Voto: ${c.voto.type} (ID: ${c.voto.id})`}>
                             <span className="text-xl mb-0.5 leading-none">
                                 {c.voto.type === 'Concordo' ? '👍' : c.voto.type === 'Discordo' ? '👎' : c.voto.type === 'Concordo em Parte' ? '👌' : c.voto.type === 'Destaque' ? '📍' : '👀'}
                             </span>
                             <span className="text-[9px] font-bold text-slate-600 uppercase whitespace-nowrap leading-none tracking-tight">{c.voto.type.split(' ')[0]}</span>
                         </div>
                      ) : (
                         <div className="w-5 h-5 border-2 border-slate-200 rounded-full"></div>
                      )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resize Handle */}
      <div
        className="w-1 bg-slate-200 hover:bg-indigo-400 cursor-col-resize z-30 transition-colors"
        onMouseDown={startResizing}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-slate-100 h-full overflow-hidden relative">
        {/* Detail Header */}
        <div className="bg-white p-6 pb-4 shadow-sm border-b border-slate-200 shrink-0 relative">
           <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                 {obs && <span className="inline-block bg-red-100 text-red-700 px-3 py-1 text-xs font-bold rounded mb-2 border border-red-200 shadow-sm uppercase">{obs}</span>}
                 <div className="flex items-center gap-4">
                     <h1 className="text-3xl font-mono font-bold text-slate-800 tracking-tight">{selectedCase.numero_processo}</h1>
                 </div>
                 <div className="flex items-center gap-2 mt-3">
                    <span className="bg-slate-800 text-white px-3 py-1 rounded-md text-sm font-bold shadow-sm">
                       Item {selectedCase.chamada}
                    </span>
                    <span className="bg-slate-100 text-slate-400 border border-slate-200 px-2 py-0.5 rounded text-[10px] font-mono">
                       {selectedCase.internalId}
                    </span>
                    <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-xs font-bold uppercase border border-slate-300">{selectedCase.classe}</span>
                 </div>
                 
                 {/* Removed Tags Row from Header as requested */}
              </div>
              
              {/* Voting Toolbar - Grid Layout */}
              <div className="flex flex-col gap-2 items-end shrink-0">
                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center w-full">
                     {selectedBatchIds.size > 0 ? `Votando em Lote (${selectedBatchIds.size})` : 'Painel de Votação'}
                 </span>
                 <div className="grid grid-cols-3 gap-2">
                    {/* Top Row */}
                    <button onClick={() => onVoteClick('Concordo')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all border ${selectedCase.voto?.type === 'Concordo' ? 'bg-green-600 text-white border-green-700 shadow-md transform scale-105' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-green-50 hover:text-green-700 hover:border-green-300'}`}>👍 Concordo</button>
                    <button onClick={() => onVoteClick('Concordo em Parte')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all border ${selectedCase.voto?.type === 'Concordo em Parte' ? 'bg-blue-600 text-white border-blue-700 shadow-md transform scale-105' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300'}`}>👌 Em Parte</button>
                    <button onClick={() => onVoteClick('Discordo')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all border ${selectedCase.voto?.type === 'Discordo' ? 'bg-red-600 text-white border-red-700 shadow-md transform scale-105' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300'}`}>👎 Discordo</button>
                    
                    {/* Bottom Row */}
                    <button onClick={() => onVoteClick('Destaque')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all border ${selectedCase.voto?.type === 'Destaque' ? 'bg-orange-500 text-white border-orange-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-300'}`}>📍 Destaque</button>
                    <button onClick={() => onVoteClick('Vista')} className={`px-4 py-2 text-xs font-bold rounded-lg transition-all border ${selectedCase.voto?.type === 'Vista' ? 'bg-purple-500 text-white border-purple-600 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300'}`}>👀 Vista</button>
                    <button onClick={() => onVoteClick(null)} className="px-4 py-2 text-xs font-bold rounded-lg transition-all border bg-slate-50 text-slate-400 border-slate-200 hover:bg-red-50 hover:text-red-500 hover:border-red-300 flex items-center justify-center" title="Limpar Voto">
                        <Icons.Eraser />
                    </button>
                 </div>
              </div>
           </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-8 relative">
            <div className="max-w-4xl mx-auto space-y-6">
                
                {/* Parties Card (Outside Summary) */}
                <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 border-b pb-2">Partes & Advogados</h4>
                    <div className="space-y-4 text-sm">
                         {selectedCase.partes.map((p: Party, i: number) => {
                             const hasLawyer = p.advogado && p.advogado.toLowerCase() !== 'null' && p.advogado.trim() !== '';
                             return (
                             <div key={i} className="flex flex-col md:flex-row md:items-start gap-1 md:gap-4">
                                <div className="md:w-1/3">
                                   <span className="font-bold text-slate-700 uppercase text-xs">{p.role}</span>
                                   <div className="text-slate-800 font-medium">{p.name}</div>
                                </div>
                                {hasLawyer && (
                                    <div className="md:w-2/3 md:border-l md:pl-4 border-slate-100">
                                       <span className="text-[10px] font-bold text-slate-400 uppercase">Advogado(s)</span>
                                       <div className="text-slate-600">{p.advogado}</div>
                                    </div>
                                )}
                             </div>
                             );
                         })}
                    </div>
                </div>

                {/* Resumo Inteligente */}
                <div className="bg-white rounded-xl shadow-md border border-indigo-100 overflow-hidden">
                    <div className="bg-indigo-600 px-6 py-3 flex justify-between items-center">
                        <h3 className="text-white font-bold tracking-wide flex items-center gap-2">
                             Resumo Estruturado Inteligente
                        </h3>
                        <button 
                             onClick={() => setShowEmenta(true)}
                             className="px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-all border border-white/20"
                             title="Ver texto original da ementa"
                         >
                             <span>📜</span> Ver Ementa Original
                         </button>
                    </div>
                    <div className="p-10 bg-white min-h-[400px]">
                        <CaseSummaryRenderer content={selectedCase.resumo_estruturado} />
                    </div>
                </div>

                {/* Cabinet Notes */}
                <div className="bg-yellow-50 rounded-lg border border-yellow-200 p-4 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-xs font-bold text-yellow-800 uppercase flex items-center gap-1">
                            <span>📝</span> Anotações de Gabinete {selectedCase.notes && <span className="font-mono text-[9px] text-yellow-600 bg-yellow-100 px-1 rounded ml-2">{selectedCase.notes.id}</span>}
                        </label>
                        {/* Only show controls if a note is already saved */}
                        {isEditingNote && (
                            <div className="flex gap-2">
                                <button onClick={() => setIsEditingNote(true)} className="p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100" title="Editar">✏️</button>
                                <button onClick={deleteNote} className="p-1.5 bg-red-50 text-red-500 rounded hover:bg-red-100" title="Excluir">🗑️</button>
                            </div>
                        )}
                        {/* If not saved yet, show Save button */}
                        {!isEditingNote && tempNote.length > 0 && (
                             <button onClick={saveNote} className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 text-xs font-bold px-3">Salvar Nota</button>
                        )}
                    </div>
                    
                    <textarea 
                        className="w-full p-3 text-sm border border-yellow-300 rounded bg-white focus:ring-2 focus:ring-yellow-400 outline-none resize-none transition-all placeholder-yellow-800/30" 
                        rows={isEditingNote || tempNote.length > 0 ? 5 : 2}
                        value={tempNote} 
                        onChange={(e) => setTempNote(e.target.value)}
                        placeholder="Clique para adicionar uma anotação..." 
                    />
                </div>
            </div>

            {/* Ementa Modal Overlay */}
            {showEmenta && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowEmenta(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b bg-slate-50 rounded-t-xl flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <span>📜</span> Ementa Original do Relator
                            </h3>
                            <button onClick={() => setShowEmenta(false)} className="hover:bg-slate-200 p-1 rounded-full text-slate-500">✕</button>
                        </div>
                        <div 
                            className="p-8 overflow-y-auto leading-relaxed text-justify whitespace-pre-wrap text-black" 
                            style={{ fontFamily: 'Arial, sans-serif', fontSize: '12pt' }}
                        >
                            {selectedCase.ementa || "Ementa não disponível neste processo."}
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

const App = () => {
    const [currentView, setCurrentView] = useState<'dashboard' | 'report'>('dashboard');
    const [cases, setCases] = useState<CaseData[]>([]);
    const [metadata, setMetadata] = useState<SessionMetadata | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [savedSessions, setSavedSessions] = useState<SavedSession[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [estimatedTime, setEstimatedTime] = useState("");
    const [progressMessage, setProgressMessage] = useState("");
    
    // Settings & Modals
    const [showSettings, setShowSettings] = useState(false);
    const [showLogs, setShowLogs] = useState(false);
    const [showTrash, setShowTrash] = useState(false);
    const [settings, setSettings] = useState<AISettings>({
        activeProvider: 'google',
        configs: {
            google: { name: 'Google', key: '', model: 'gemini-2.5-flash' },
            openai: { name: 'OpenAI', key: '', model: 'gpt-4o' },
            anthropic: { name: 'Anthropic', key: '', model: 'claude-3-5-sonnet-20240620' }
        },
        temperature: 0.2
    });

    const [trashItems, setTrashItems] = useState<SavedSession[]>([]);
    const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());

    // Load data on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem('jurispanel_sessions');
            if (saved) setSavedSessions(JSON.parse(saved));
            const trash = localStorage.getItem('jurispanel_trash');
            if (trash) setTrashItems(JSON.parse(trash));
            const s = localStorage.getItem('jurispanel_settings');
            if (s) setSettings(JSON.parse(s));
        } catch(e) { console.error("Error loading local storage", e); }
    }, []);

    // Handlers
    const toggleView = () => setCurrentView(v => v === 'dashboard' ? 'report' : 'dashboard');
    
    const handleSaveSession = () => {
        if (!metadata || cases.length === 0) return;
        const id = sessionId || getNextId('L');
        const session: SavedSession = {
            id,
            metadata,
            cases,
            dateSaved: Date.now()
        };
        
        // Update or add
        const existingIdx = savedSessions.findIndex(s => s.id === id);
        let newSessions = [...savedSessions];
        if (existingIdx >= 0) {
            newSessions[existingIdx] = session;
        } else {
            newSessions = [session, ...newSessions];
        }
        
        setSavedSessions(newSessions);
        setSessionId(id);
        localStorage.setItem('jurispanel_sessions', JSON.stringify(newSessions));
        addSystemLog("Sessão Salva", `Sessão ${id} salva com ${cases.length} processos`);
        alert("Sessão salva com sucesso!");
    };

    const handleLoadSession = (s: SavedSession) => {
        setMetadata(s.metadata);
        setCases(s.cases);
        setSessionId(s.id);
        addSystemLog("Sessão Carregada", `Sessão ${s.id} carregada`);
    };

    const handleDeleteSession = (id: string) => {
        const session = savedSessions.find(s => s.id === id);
        if (session) {
            const newTrash = [session, ...trashItems];
            setTrashItems(newTrash);
            localStorage.setItem('jurispanel_trash', JSON.stringify(newTrash));
            
            const newSaved = savedSessions.filter(s => s.id !== id);
            setSavedSessions(newSaved);
            localStorage.setItem('jurispanel_sessions', JSON.stringify(newSaved));
            addSystemLog("Sessão Movida para Lixeira", `Sessão ${id}`);
        }
    };

    const handleRestoreSession = (s: SavedSession) => {
        setSavedSessions([s, ...savedSessions]);
        localStorage.setItem('jurispanel_sessions', JSON.stringify([s, ...savedSessions]));
        
        const newTrash = trashItems.filter(t => t.id !== s.id);
        setTrashItems(newTrash);
        localStorage.setItem('jurispanel_trash', JSON.stringify(newTrash));
        addSystemLog("Sessão Restaurada", `Sessão ${s.id}`);
    };

    const handlePermanentDelete = (id: string) => {
        const newTrash = trashItems.filter(t => t.id !== id);
        setTrashItems(newTrash);
        localStorage.setItem('jurispanel_trash', JSON.stringify(newTrash));
        addSystemLog("Sessão Excluída Permanentemente", `Sessão ${id}`);
    };

    const handleProcess = async (payload: ContentPayload, meta: SessionMetadata) => {
        setIsProcessing(true);
        setMetadata(meta);
        setProgress(10);
        setEstimatedTime("Iniciando...");
        setProgressMessage("Enviando documento para análise...");
        
        try {
            const ai = getAIClient();
            
            // Construct prompt
            let prompt = "Analise o seguinte documento jurídico (pauta de julgamento/sessão). Extraia a lista de processos conforme o esquema JSON.";
            const parts: Part[] = [
        { text: `Atue como Assessor Jurídico Sênior de Gabinete de Desembargador Federal.
        
        Estrutura OBRIGATÓRIA do Resumo Estruturado (Markdown) para o campo 'resumo_estruturado'. Use EXATAMENTE estes títulos (Capítulos) como H3 ('### Título').
        
        ### Causa em Julgamento
        (Quem recorre, recorrido e o objeto central).
        
        ### Pedidos e Fundamentos
        (Teses e alegações do recorrente).
        
        ### Resistência e Fundamentos
        (Teses e alegações do recorrido).
        
        ### Questões Controversas
        (Pontos controvertidos a decidir - Ratio Decidendi).
        
        ### Razões de Decidir
        (Fundamentação jurídica e fática).
        
        ### Conclusão
        (Dispositivo do voto, Provimento/Desprovimento e Sucumbência).
        
        ### Legislação Aplicada
        (Lista de dispositivos legais citados).
        
        ### Precedentes Jurisprudenciais
        (Lista de precedentes citados, formatados rigorosamente).

        ### PALAVRAS-CHAVE (TAGS)
        (Lista de tags na mesma linha, separadas por ponto e vírgula).

        REGRAS DE FORMATAÇÃO E CONTEÚDO:

        1. **EMENTA (Campo JSON 'ementa'):** 
           - Deve conter o texto INTEGRAL da ementa constante no documento.
           - Não traga apenas o cabeçalho em CAIXA ALTA. Traga todo o corpo do texto da ementa.
           - RESPEITE RIGOROSAMENTE as quebras de linha e parágrafos originais. Não junte parágrafos.
           
        2. **MARCADORES NO RESUMO:**
           - Se um capítulo tiver apenas UM item/parágrafo, NÃO use marcador (bullet point). Escreva o texto diretamente.
           - Se houver múltiplos itens, use marcadores padrão ('- ').

        3. **TAGS (No Resumo):** 
           - No capítulo '### PALAVRAS-CHAVE (TAGS)', apresente as tags em uma ÚNICA LINHA, separadas por ponto e vírgula (ex: Tag A; Tag B; Tag C).

        4. **CITAÇÃO DE PRECEDENTES (Padronização Rigorosa):**
           - Utilize pontuação oficial nos números dos processos (pontos, hifens, barras).
           - STF: RE 1.234.567 (com pontos).
           - STJ: REsp 1.234.567/UF (com pontos e barra).
           - CNJ/TRF5: 0800123-45.2024.4.05.0000 (máscara completa).
           - Formato sugerido: [Classe] [Número Formatado], Rel. [Relator], [Órgão Julgador], Julgado em [Data].

        5. **GERAL:**
           - Vincule advogados às partes no JSON.
           - Destaque em **negrito** informações cruciais.
           - Nomes das partes em CAIXA ALTA no resumo.
           - Gere também o array 'tags' no JSON independentemente da seção no resumo.
        
        Retorne JSON Array conforme schema.` }
      ];

            if (payload.type === 'pdf') {
                parts.push({ inlineData: { mimeType: 'application/pdf', data: payload.data } });
            } else {
                parts.push({ text: payload.data });
            }

            setProgress(30);
            setProgressMessage("A IA está analisando os processos...");

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: { parts },
                config: {
                    responseMimeType: "application/json",
                    responseSchema: listParsingSchema
                }
            });

            setProgress(90);
            setProgressMessage("Processando resposta...");

            if (response.text) {
                const data = JSON.parse(response.text);
                // Map to CaseData
                const newCases: CaseData[] = data.map((item: any, index: number) => ({
                    internalId: getNextId('P'),
                    chamada: item.chamada || (index + 1),
                    numero_processo: item.numero_processo,
                    classe: item.classe,
                    partes: item.partes || [],
                    ementa: item.ementa || "",
                    resumo_estruturado: item.resumo_estruturado || "",
                    tags: item.tags || [],
                    observacao: item.observacao,
                    status: 'pending'
                }));
                setCases(newCases);
                addSystemLog("Processamento IA", `Análise concluída. ${newCases.length} processos identificados.`);
            }

        } catch (error) {
            console.error(error);
            alert("Erro ao processar com IA. Verifique a chave de API e o documento.");
            addSystemLog("Erro Processamento", "Falha na chamada da API");
        } finally {
            setIsProcessing(false);
            setProgress(0);
        }
    };

    const updateCase = (updated: CaseData) => {
        setCases(cases.map(c => c.internalId === updated.internalId ? updated : c));
    };

    const handleVoteUnified = (type: string | null, caseData: CaseData) => {
        const batch = selectedBatchIds.size > 0 && selectedBatchIds.has(caseData.internalId) 
             ? Array.from(selectedBatchIds) 
             : [caseData.internalId];
        
        const timestamp = Date.now();
        const voteId = getNextId(type ? getVotePrefix(type) : 'VX');
        
        const newCases = cases.map(c => {
            if (batch.includes(c.internalId)) {
                return {
                    ...c,
                    voto: type ? { id: voteId, type, timestamp } : undefined,
                    status: type ? 'reviewed' : 'pending'
                } as CaseData;
            }
            return c;
        });
        
        setCases(newCases);
        addSystemLog("Voto Registrado", `Voto ${type || 'Removido'} para ${batch.length} processos`);
        if (selectedBatchIds.size > 0) setSelectedBatchIds(new Set());
    };
    
    const toggleBatchSelection = (e: React.ChangeEvent<HTMLInputElement>, id: string) => {
        const newSet = new Set(selectedBatchIds);
        if (e.target.checked) newSet.add(id);
        else newSet.delete(id);
        setSelectedBatchIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedBatchIds.size === cases.length) setSelectedBatchIds(new Set());
        else setSelectedBatchIds(new Set(cases.map(c => c.internalId)));
    };

    const onNewList = () => {
        if (confirm("Deseja iniciar uma nova lista? Dados não salvos serão perdidos.")) {
            setCases([]);
            setMetadata(null);
            setSessionId(null);
            setSelectedBatchIds(new Set());
            setCurrentView('dashboard');
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
            <Header 
                toggleView={toggleView}
                currentView={currentView}
                hasData={cases.length > 0}
                onExportDocx={() => alert("Exportação DOCX não implementada nesta demo.")}
                onPrint={() => window.print()}
                onSaveSession={handleSaveSession}
                onOpenLogs={() => setShowLogs(true)}
                onOpenTrash={() => setShowTrash(true)}
                onOpenSettings={() => setShowSettings(true)}
                onIngestLegacy={(files) => alert("Importação legado não implementada nesta demo.")}
                onNewList={onNewList}
            />
            
            {isProcessing && (
                 <div className="fixed inset-0 z-[100] bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center">
                      <ProgressBar progress={progress} estimatedTime={estimatedTime} message={progressMessage} />
                 </div>
            )}
            
            {!cases.length && !isProcessing && (
                <InputView 
                    onProcess={handleProcess} 
                    onLoadSession={handleLoadSession}
                    onDeleteSession={handleDeleteSession}
                    savedSessions={savedSessions}
                />
            )}
            
            {cases.length > 0 && !isProcessing && (
                <>
                   {metadata && <SessionInfoBar metadata={metadata} sessionId={sessionId || undefined} />}
                   {currentView === 'dashboard' ? (
                       <Dashboard 
                           cases={cases}
                           handleVoteUnified={handleVoteUnified}
                           updateCase={updateCase}
                           selectedBatchIds={selectedBatchIds}
                           toggleBatchSelection={toggleBatchSelection}
                           toggleSelectAll={toggleSelectAll}
                           metadata={metadata}
                       />
                   ) : (
                       <div className="p-10 max-w-5xl mx-auto bg-white min-h-screen shadow-lg my-10">
                           <div className="text-center mb-10 border-b pb-6">
                               <h1 className="text-2xl font-bold uppercase tracking-wider text-slate-900">{metadata?.orgao}</h1>
                               <h2 className="text-xl text-slate-700 mt-2">Relator: {metadata?.relator}</h2>
                               <p className="text-sm text-slate-500 mt-1">{metadata?.data} - {metadata?.tipo}</p>
                           </div>
                           {cases.map((c, i) => (
                               <div key={c.internalId} className="mb-8 border-b border-slate-100 pb-6 break-inside-avoid">
                                   <div className="flex justify-between items-start mb-2">
                                       <h3 className="font-bold text-lg text-slate-800">{c.chamada}. {c.numero_processo}</h3>
                                       {c.voto && <span className="text-sm font-bold bg-slate-100 px-2 py-1 rounded border border-slate-200">{c.voto.type}</span>}
                                   </div>
                                   <p className="text-sm font-bold text-slate-600 mb-2">{c.classe}</p>
                                   <div className="text-sm text-justify leading-relaxed text-slate-800">
                                       <ReactMarkdown>{c.resumo_estruturado}</ReactMarkdown>
                                   </div>
                               </div>
                           ))}
                       </div>
                   )}
                </>
            )}
            
            <AIStatusBadge settings={settings} onOpenSettings={() => setShowSettings(true)} />

            <SettingsModal show={showSettings} onClose={() => setShowSettings(false)} settings={settings} setSettings={setSettings} />
            <Modals 
                showLogs={showLogs} setShowLogs={setShowLogs} 
                showTrash={showTrash} setShowTrash={setShowTrash} 
                trashItems={trashItems} 
                restoreSession={handleRestoreSession} 
                permanentDeleteSession={handlePermanentDelete} 
            />
        </div>
    );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);