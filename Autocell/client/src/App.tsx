import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles, Upload, Undo2, Redo2, Download, Send,
  FileSpreadsheet, Plus, Trash2, Bot, User,
  CheckCircle2, ChevronDown, Zap, Eye
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  logs?: string[];
  isNew?: boolean;
}

interface SheetMap {
  [key: string]: any[][];
}

// ─── Typewriter Component for Typing Animation ────────────────────────────────

function TypewriterText({ text, isNew, onComplete }: { text: string; isNew?: boolean; onComplete?: () => void }) {
  const [displayedLength, setDisplayedLength] = useState(isNew ? 0 : text.length);
  const [isTyping, setIsTyping] = useState(isNew);

  useEffect(() => {
    if (!isNew) {
      setDisplayedLength(text.length);
      setIsTyping(false);
      return;
    }

    let current = 0;
    const speed = 12; // ms per tick
    const charsPerTick = 3; // 3 chars per tick for snappy, smooth typing

    const interval = setInterval(() => {
      current += charsPerTick;
      if (current >= text.length) {
        setDisplayedLength(text.length);
        setIsTyping(false);
        clearInterval(interval);
        onComplete?.();
      } else {
        setDisplayedLength(current);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, isNew]);

  const visibleText = text.slice(0, displayedLength);

  return (
    <div className="leading-relaxed">
      {visibleText.split('\n').map((line, li) => {
        // Simple markdown formatting: bold **word**
        const parts = line.split(/(\*\*.*?\*\*)/g);
        return (
          <p key={li} className={li > 0 ? 'mt-1.5' : ''}>
            {parts.map((part, pi) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={pi} className="font-semibold text-white">{part.slice(2, -2)}</strong>;
              }
              if (part.startsWith('`') && part.endsWith('`')) {
                return <code key={pi} className="px-1 py-0.5 rounded bg-slate-900 text-indigo-300 font-mono text-[11px]">{part.slice(1, -1)}</code>;
              }
              return part;
            })}
          </p>
        );
      })}
      {isTyping && (
        <span className="inline-block w-1.5 h-3.5 ml-1 bg-indigo-400 animate-pulse align-middle" />
      )}
    </div>
  );
}

// ─── Cell Display Helper ──────────────────────────────────────────────────────

function cellDisplay(val: any) {
  if (val === null || val === undefined || val === '') {
    return <span className="text-slate-600 italic text-[11px]">—</span>;
  }
  return <span>{String(val)}</span>;
}

// ─── App Component ────────────────────────────────────────────────────────────

export default function App() {
  const [sheets, setSheets] = useState<SheetMap>({});
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState('');
  const [filename, setFilename] = useState('');
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Highlighting cells when updated
  const [justUpdated, setJustUpdated] = useState(false);
  const [updateToast, setUpdateToast] = useState('');

  const [chatLog, setChatLog] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      text: "Hello! I am your Autocell AI Agent by MEDU.\n\nI can analyze patterns, execute mathematical transformations, and clean your data in real time.\n\nTry asking me:\n• **\"Recognize patterns\"**\n• **\"Change the MRR, 2x by every serial number\"**\n• **\"Fix all patterns\"**\n• **\"Remove duplicate rows\"**\n• **\"What is the average MRR?\"**",
      isNew: false
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Suggestions shown above input
  const suggestions = [
    '🔍 Recognize patterns',
    '⚡ Change MRR 2x by serial',
    '✨ Fix all patterns',
    '🗑️ Remove duplicates',
    '📊 What is total MRR?'
  ];

  // ── Load spreadsheet ────────────────────────────────────────────────────────

  const applySheetData = (data: any, toastMsg?: string) => {
    if (!data.sheets) return;
    setSheets(data.sheets);
    const names: string[] = data.sheetNames || Object.keys(data.sheets);
    setSheetNames(names);
    setActiveSheet(prev => (names.includes(prev) ? prev : names[0]));
    setFilename(data.filename || '');
    setCanUndo(data.canUndo ?? false);
    setCanRedo(data.canRedo ?? false);

    if (toastMsg) {
      setUpdateToast(toastMsg);
      setJustUpdated(true);
      setTimeout(() => setJustUpdated(false), 2500);
    }
  };

  useEffect(() => {
    fetch('/api/spreadsheet')
      .then(r => r.json())
      .then(data => applySheetData(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog, sending]);

  // ── File upload ─────────────────────────────────────────────────────────────

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (data.sheets) {
        applySheetData(data, `Loaded ${data.filename}`);
        setChatLog(prev => [...prev, {
          id: String(Date.now()),
          role: 'assistant',
          text: `Loaded **${data.filename}** (${data.sheetNames?.length || 1} sheet(s) ready). Ask me anything to inspect or transform!`,
          isNew: true
        }]);
      }
    } catch {
      alert('Upload failed. Please check file format.');
    }
    e.target.value = '';
  };

  // ── Undo / Redo ──────────────────────────────────────────────────────────────

  const doUndo = async () => {
    const res = await fetch('/api/undo', { method: 'POST' });
    const data = await res.json();
    if (data.success) applySheetData(data, 'Undo applied');
  };

  const doRedo = async () => {
    const res = await fetch('/api/redo', { method: 'POST' });
    const data = await res.json();
    if (data.success) applySheetData(data, 'Redo applied');
  };

  // ── Sheet tabs ───────────────────────────────────────────────────────────────

  const addSheet = async () => {
    const res = await fetch('/api/sheet/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Sheet ${sheetNames.length + 1}` }),
    });
    const data = await res.json();
    if (data.success) applySheetData(data, `Added Sheet ${sheetNames.length + 1}`);
  };

  const deleteSheet = async (name: string) => {
    if (sheetNames.length <= 1) return;
    if (!confirm(`Delete sheet "${name}"?`)) return;
    const res = await fetch('/api/sheet/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.success) applySheetData(data, `Deleted ${name}`);
  };

  // ── Chat send ────────────────────────────────────────────────────────────────

  const sendMessage = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;
    setInput('');
    setSending(true);

    const userMsgId = `user-${Date.now()}`;
    setChatLog(prev => [...prev, { id: userMsgId, role: 'user', text: msg, isNew: false }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, activeSheet }),
      });
      const data = await res.json();

      const assistantMsgId = `assistant-${Date.now()}`;
      setChatLog(prev => [...prev, {
        id: assistantMsgId,
        role: 'assistant',
        text: data.reply || 'Done!',
        logs: data.logs,
        isNew: true, // triggers typewriter animation
      }]);

      if (data.modified) {
        applySheetData(data, data.logs?.[0] || 'Spreadsheet updated in real-time');
      }
    } catch {
      setChatLog(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'assistant',
        text: 'Something went wrong processing your request. Please try again.',
        isNew: true
      }]);
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Cell edit ────────────────────────────────────────────────────────────────

  const [editCell, setEditCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (row: number, col: number, val: any) => {
    setEditCell({ row, col });
    setEditValue(String(val ?? ''));
  };

  const commitEdit = async () => {
    if (!editCell) return;
    const res = await fetch('/api/cell/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheet: activeSheet, row: editCell.row, col: editCell.col, value: editValue }),
    });
    const data = await res.json();
    if (data.success) applySheetData(data, `Updated cell [${editCell.row}, ${editCell.col}]`);
    setEditCell(null);
  };

  // ── Derived Data ─────────────────────────────────────────────────────────────

  const currentData = sheets[activeSheet] || [];
  const headers = currentData[0] || [];
  const rows = currentData.slice(1);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans">

      {/* ── Top Header ── */}
      <header className="flex-shrink-0 bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
              Autocell
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-semibold border border-indigo-500/30">
                MEDU Agent
              </span>
            </div>
            {filename && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span className="truncate max-w-[220px] font-medium text-slate-300">{filename}</span>
              </div>
            )}
          </div>
        </div>

        {/* Live Status Toast Banner */}
        {justUpdated && (
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs font-semibold rounded-full animate-bounce">
            <Zap className="w-3.5 h-3.5" />
            <span>{updateToast}</span>
          </div>
        )}

        {/* Toolbar Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={doUndo}
            disabled={!canUndo}
            title="Undo"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition text-slate-200"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={doRedo}
            disabled={!canRedo}
            title="Redo"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition text-slate-200"
          >
            <Redo2 className="w-4 h-4" />
          </button>

          <label className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-semibold cursor-pointer transition shadow-md shadow-indigo-600/20">
            <Upload className="w-3.5 h-3.5" />
            <span>Upload File</span>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleUpload} className="hidden" />
          </label>

          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
            <a
              href="/api/export/xlsx"
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px] font-medium text-slate-200 transition"
            >
              <Download className="w-3 h-3" /> .xlsx
            </a>
            <a
              href="/api/export/csv"
              className="flex items-center gap-1 px-2.5 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px] font-medium text-slate-200 transition"
            >
              <Download className="w-3 h-3" /> .csv
            </a>
          </div>
        </div>
      </header>

      {/* ── Main Split View ── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ════ Left: AI Chat with Typing Animation ════ */}
        <div className="w-[400px] flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/70 backdrop-blur">

          {/* Chat header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/30 flex items-center justify-center text-indigo-400">
                <Bot className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xs font-bold text-white uppercase tracking-wider">Autocell Agent</p>
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Real-time Sync Active</span>
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded-md font-mono">
              Sheet: {activeSheet}
            </div>
          </div>

          {/* Message History */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {chatLog.map(msg => (
              <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${
                  msg.role === 'assistant'
                    ? 'bg-indigo-600/30 text-indigo-400 border border-indigo-500/30'
                    : 'bg-slate-700 text-slate-200'
                }`}>
                  {msg.role === 'assistant' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>

                {/* Message Bubble */}
                <div className={`max-w-[86%] rounded-2xl px-3.5 py-2.5 text-xs ${
                  msg.role === 'assistant'
                    ? 'bg-slate-800/90 border border-slate-700/60 text-slate-200 rounded-tl-sm shadow-md'
                    : 'bg-indigo-600 text-white rounded-tr-sm shadow-md shadow-indigo-600/20'
                }`}>
                  {msg.role === 'assistant' ? (
                    <TypewriterText text={msg.text} isNew={msg.isNew} />
                  ) : (
                    <p className="leading-relaxed">{msg.text}</p>
                  )}

                  {/* Operation Checklist / Logs */}
                  {msg.logs && msg.logs.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-700/60 space-y-1">
                      {msg.logs.map((log, li) => (
                        <div key={li} className="flex items-start gap-1.5 text-[11px] text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                          <span>{log}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* In-Flight Typing / Processing Animation */}
            {sending && (
              <div className="flex gap-2.5 items-start">
                <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Bot className="w-4 h-4 animate-spin" />
                </div>
                <div className="bg-slate-800/90 border border-slate-700/60 rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-2">
                  <span className="text-xs text-indigo-300 font-medium">Agent is typing & analyzing sheet</span>
                  <span className="flex gap-1 ml-1 items-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Pattern & Action Suggestion Pills */}
          <div className="flex-shrink-0 px-3 pt-2 pb-1.5 flex gap-1.5 flex-wrap border-t border-slate-800/80 bg-slate-950/40">
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => sendMessage(s.replace(/^[^\w\s]+\s*/, ''))}
                disabled={sending}
                className="px-2.5 py-1 bg-slate-800/90 hover:bg-indigo-600/25 border border-slate-700/70 hover:border-indigo-500/50 rounded-full text-[11px] font-medium text-slate-300 hover:text-indigo-200 transition disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <div className="flex-shrink-0 p-3 pt-1">
            <div className="flex gap-2 items-end bg-slate-800/90 border border-slate-700 focus-within:border-indigo-500 rounded-xl px-3 py-2 transition shadow-inner">
              <textarea
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask agent: 'Recognize patterns', 'Change MRR 2x by serial'..."
                disabled={sending}
                className="flex-1 bg-transparent resize-none text-xs text-slate-100 placeholder-slate-500 outline-none leading-relaxed max-h-28"
                style={{ minHeight: '1.5rem' }}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || sending}
                className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed transition flex-shrink-0 shadow-md shadow-indigo-600/30 text-white"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 text-center">Press Enter to send · Shift+Enter for new line</p>
          </div>
        </div>

        {/* ════ Right: Visible Realtime Excel Spreadsheet ════ */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">

          {/* Top Sheet Toolbar */}
          <div className="flex-shrink-0 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-3 pt-2">
            
            {/* Sheet Tabs */}
            <div className="flex items-center gap-1 overflow-x-auto">
              {sheetNames.map(name => (
                <div
                  key={name}
                  onClick={() => setActiveSheet(name)}
                  className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-semibold border-b-2 cursor-pointer transition select-none ${
                    activeSheet === name
                      ? 'border-indigo-500 bg-slate-950 text-white shadow-sm'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
                  <span>{name}</span>
                  {sheetNames.length > 1 && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteSheet(name); }}
                      className="opacity-0 group-hover:opacity-100 hover:text-rose-400 transition ml-1"
                      title="Delete Sheet"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={addSheet}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
                title="Add New Sheet"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Quick Stats & Live Tag */}
            {currentData.length > 0 && (
              <div className="flex items-center gap-3 mb-1 text-[11px] text-slate-400 font-mono">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync
                </span>
                <span>{rows.length} rows</span>
                <span>•</span>
                <span>{headers.length} columns</span>
              </div>
            )}
          </div>

          {/* Spreadsheet Grid */}
          <div className="flex-1 overflow-auto">
            {currentData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <FileSpreadsheet className="w-12 h-12 mb-3 opacity-20 text-indigo-400" />
                <p className="text-sm font-semibold text-slate-400">No active spreadsheet</p>
                <p className="text-xs text-slate-500 mt-1">Upload a file or ask the agent to populate data</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                {/* Column Headers */}
                <thead className="sticky top-0 z-10 bg-slate-900 border-b border-slate-800 shadow-sm">
                  <tr>
                    {/* Row gutter index header */}
                    <th className="w-12 px-2 py-2 text-center text-[11px] font-mono text-slate-500 border-r border-slate-800 bg-slate-900">
                      #
                    </th>
                    {headers.map((h: any, ci: number) => (
                      <th
                        key={ci}
                        className="px-3 py-2 font-semibold text-slate-200 border-r border-slate-800 whitespace-nowrap bg-slate-900/95"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span>{h !== '' ? String(h) : <span className="text-slate-600 italic">Column {ci + 1}</span>}</span>
                          <span className="text-[10px] text-slate-500 font-mono uppercase">{String.fromCharCode(65 + (ci % 26))}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Table Rows */}
                <tbody className="divide-y divide-slate-800/60">
                  {rows.map((row: any[], ri: number) => {
                    const actualRowIdx = ri + 1; // 0 is header row
                    return (
                      <tr
                        key={ri}
                        className={`group transition-colors duration-500 hover:bg-slate-800/40 ${
                          justUpdated ? 'bg-indigo-500/5' : ''
                        }`}
                      >
                        {/* Serial / Row number */}
                        <td className="px-2 py-1.5 text-center text-[11px] text-slate-500 border-r border-slate-800 bg-slate-900/40 font-mono select-none">
                          {ri + 1}
                        </td>

                        {/* Cells */}
                        {headers.map((_h: any, ci: number) => {
                          const isEditing = editCell?.row === actualRowIdx && editCell?.col === ci;
                          const val = row[ci];

                          return (
                            <td
                              key={ci}
                              className={`px-0 py-0 border-r border-slate-800/60 align-middle transition-all duration-700 ${
                                justUpdated ? 'bg-emerald-500/10 text-emerald-200' : ''
                              }`}
                              onDoubleClick={() => startEdit(actualRowIdx, ci, val)}
                              title="Double-click to edit cell"
                            >
                              {isEditing ? (
                                <input
                                  autoFocus
                                  value={editValue}
                                  onChange={e => setEditValue(e.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') commitEdit();
                                    if (e.key === 'Escape') setEditCell(null);
                                  }}
                                  className="w-full h-full px-3 py-1.5 bg-indigo-950 border border-indigo-500 text-slate-100 outline-none text-xs font-mono"
                                />
                              ) : (
                                <div className="px-3 py-1.5 min-h-[28px] text-slate-300 truncate max-w-[240px] cursor-text">
                                  {cellDisplay(val)}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
