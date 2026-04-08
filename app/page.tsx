"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ParsedQuestion } from "./api/parse/route";

/* ── helpers ─────────────────────────────────────────── */
const LS_HISTORY = "qv_history";
const LS_SCRIPT  = "qv_script_url";
const LS_ROWS    = "qv_rows";

function saveRows(rows: ParsedQuestion[]) {
  try { localStorage.setItem(LS_ROWS, JSON.stringify(rows)); } catch {}
}
function loadRows(): ParsedQuestion[] {
  try { return JSON.parse(localStorage.getItem(LS_ROWS) || "[]"); } catch { return []; }
}
function loadHistory(): { url: string; label: string; date: string }[] {
  try { return JSON.parse(localStorage.getItem(LS_HISTORY) || "[]"); } catch { return []; }
}
function addHistory(url: string) {
  const hist = loadHistory();
  const trimmed = url.trim();
  const id = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || trimmed.slice(0, 20);
  const entry = { url: trimmed, label: `Doc ${id.slice(0, 12)}…`, date: new Date().toLocaleDateString("en-IN") };
  const filtered = hist.filter((h) => h.url !== trimmed).slice(0, 7);
  try { localStorage.setItem(LS_HISTORY, JSON.stringify([entry, ...filtered])); } catch {}
}

type Status = "Pending" | "Review" | "Complete";
type Toast = { id: number; type: "success" | "error" | "info"; msg: string };

const STATUS_OPTIONS: Status[] = ["Pending", "Review", "Complete"];
const TYPE_COLORS: Record<string, string> = {
  "MCQ": "mcq", "True/False": "tf", "Multi-Correct": "multi", "MSQ": "multi", "Logical MCQ": "logical"
};

function typeBadge(t: string) {
  const cls = TYPE_COLORS[t] || "mcq";
  const label = t === "Multi-Correct" ? "Multi" : t === "Logical MCQ" ? "Logic" : t;
  return <span className={`type-badge ${cls}`}>{label}</span>;
}

function statusBadge(s: Status) {
  const cls = s.toLowerCase() === "complete" ? "complete" : s.toLowerCase() === "review" ? "review" : "pending";
  return (
    <span className={`status-badge ${cls}`}>
      <span className="status-badge-dot" />
      {s}
    </span>
  );
}

function difficultyBar(d: string) {
  if (!d) return null;
  const [num] = d.split("/").map(Number);
  const max = 10;
  const dots = Array.from({ length: max }, (_, i) => {
    let color = "#2a2a40";
    if (i < num) {
      color = num <= 3 ? "#10b981" : num <= 6 ? "#f59e0b" : "#f87171";
    }
    return <span key={i} className="difficulty-dot" style={{ background: color }} />;
  });
  return (
    <div className="difficulty-bar">
      <div className="difficulty-dots">{dots}</div>
      <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{d}</span>
    </div>
  );
}

/* ── SETTINGS MODAL ──────────────────────────────────── */
function SettingsModal({
  scriptUrl, onSave, onClose,
}: { scriptUrl: string; onSave: (u: string) => void; onClose: () => void }) {
  const [val, setVal] = useState(scriptUrl);
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">⚙️ Settings</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-field" style={{ marginBottom: 20 }}>
          <label>Google Apps Script Web App URL</label>
          <input
            id="settings-script-url"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="https://script.google.com/macros/s/YOUR_ID/exec"
          />
          <p style={{ marginTop: 8, fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Paste the URL of your deployed Apps Script Web App. See the <strong style={{ color: "var(--accent-violet-light)" }}>Apps Script Setup Guide</strong> below to get this URL.
          </p>
        </div>

        <details style={{ marginBottom: 20 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--accent-violet-light)", fontWeight: 600, userSelect: "none" }}>
            📋 Apps Script Setup Guide
          </summary>
          <div style={{ marginTop: 12, padding: 16, background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.8, border: "1px solid var(--border-subtle)" }}>
            <ol style={{ paddingLeft: 16 }}>
              <li>Open <a href="https://sheets.google.com" target="_blank" style={{ color: "var(--accent-cyan)" }}>Google Sheets</a> → create a new sheet</li>
              <li>Go to <strong>Extensions → Apps Script</strong></li>
              <li>Delete existing code and paste the <strong>Apps Script code</strong> (provided below)</li>
              <li>Click <strong>Deploy → New Deployment</strong></li>
              <li>Type: <strong>Web App</strong>, Access: <strong>Anyone</strong></li>
              <li>Click <strong>Deploy</strong> → copy the Web App URL</li>
              <li>Paste it in the field above and hit Save</li>
            </ol>
          </div>
        </details>

        <div className="modal-footer">
          <button className="toolbar-btn" onClick={onClose}>Cancel</button>
          <button className="toolbar-btn primary" onClick={() => { onSave(val.trim()); onClose(); }}>
            💾 Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── ROW EDIT MODAL ──────────────────────────────────── */
function EditModal({
  row, onSave, onClose,
}: { row: ParsedQuestion; onSave: (r: ParsedQuestion) => void; onClose: () => void }) {
  const [r, setR] = useState<ParsedQuestion>({ ...row });
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <span className="modal-title">✏️ Edit {r.qNumLocal}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-row">
          <div className="modal-field">
            <label>Status</label>
            <select id="edit-status" value={r.status} onChange={(e) => setR({ ...r, status: e.target.value as Status })}>
              {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="modal-field">
            <label>Question Type</label>
            <select value={r.questionType} onChange={(e) => setR({ ...r, questionType: e.target.value as ParsedQuestion["questionType"] })}>
              {["MCQ","True/False","Multi-Correct","MSQ","Logical MCQ"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="modal-field" style={{ marginBottom: 12 }}>
          <label>Series / Topic Title</label>
          <input value={r.seriesTitle} onChange={(e) => setR({ ...r, seriesTitle: e.target.value })} />
        </div>

        <div className="modal-field" style={{ marginBottom: 12 }}>
          <label>Video Title</label>
          <input value={r.videoTitle} onChange={(e) => setR({ ...r, videoTitle: e.target.value })} />
        </div>

        <div className="modal-row">
          <div className="modal-field">
            <label>Source Video Link</label>
            <input value={r.sourceVideoLink} onChange={(e) => setR({ ...r, sourceVideoLink: e.target.value })} placeholder="https://youtu.be/..." />
          </div>
          <div className="modal-field">
            <label>🎬 Editor Video Link</label>
            <input id="edit-editor-link" value={r.editorVideoLink} onChange={(e) => setR({ ...r, editorVideoLink: e.target.value })} placeholder="https://youtu.be/..." />
          </div>
        </div>

        <div className="modal-field" style={{ marginBottom: 12 }}>
          <label>Question</label>
          <textarea rows={3} value={r.question} onChange={(e) => setR({ ...r, question: e.target.value })} />
        </div>

        <div className="modal-field" style={{ marginBottom: 12 }}>
          <label>Answer</label>
          <input value={r.answer} onChange={(e) => setR({ ...r, answer: e.target.value })} />
        </div>

        <div className="modal-field" style={{ marginBottom: 12 }}>
          <label>Remarks</label>
          <textarea rows={2} value={r.remarks} onChange={(e) => setR({ ...r, remarks: e.target.value })} placeholder="Add notes for editor..." />
        </div>

        <div className="modal-footer">
          <button className="toolbar-btn" onClick={onClose}>Cancel</button>
          <button className="toolbar-btn primary" onClick={() => { onSave(r); onClose(); }}>
            💾 Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── APPS SCRIPT CODE MODAL ──────────────────────────── */
const APPS_SCRIPT_CODE = `// QuestionVault — Google Apps Script
// Paste this in your sheet's Apps Script editor and deploy as a Web App

const SHEET_NAME = "Questions";

const HEADERS = [
  "Date", "Q# Global", "Q# Local", "Question Type",
  "Series / Topic", "Video Title", "Source Video Link",
  "Question", "Options", "Answer", "Difficulty", "Time (sec)",
  "Clip Reference", "Source Doc", "Status", "Editor Video Link", "Remarks"
];

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(HEADERS);
      formatHeaders(sheet);
    }
    const data = JSON.parse(e.postData.contents);
    const questions = data.questions || [];
    
    // Determine global offset from existing rows
    const lastRow = sheet.getLastRow();
    let globalOffset = lastRow <= 1 ? 0 : lastRow - 1;

    questions.forEach((q, idx) => {
      const row = [
        q.date,
        globalOffset + idx + 1,
        q.qNumLocal,
        q.questionType,
        q.seriesTitle,
        q.videoTitle,
        q.sourceVideoLink,
        q.question,
        (q.options || []).join(" | "),
        q.answer,
        q.difficulty,
        q.timeSec,
        q.clipRef,
        q.sourceDoc,
        q.status || "Pending",
        q.editorVideoLink || "",
        q.remarks || ""
      ];
      const r = sheet.appendRow(row);
      colorRowByStatus(sheet, sheet.getLastRow(), q.status || "Pending");
    });

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, written: questions.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return ContentService.createTextOutput(JSON.stringify({ rows: [] })).setMimeType(ContentService.MimeType.JSON);
  const data = sheet.getDataRange().getValues();
  return ContentService
    .createTextOutput(JSON.stringify({ rows: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatHeaders(sheet) {
  const header = sheet.getRange(1, 1, 1, HEADERS.length);
  header.setBackground("#1e1b4b");
  header.setFontColor("#a78bfa");
  header.setFontWeight("bold");
  header.setFontSize(11);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(8, 300); // Question column wider
  sheet.setColumnWidth(5, 200);
  sheet.setColumnWidth(6, 200);
}

function colorRowByStatus(sheet, rowNum, status) {
  const range = sheet.getRange(rowNum, 1, 1, HEADERS.length);
  const colors = { "Pending": "#2d2000", "Review": "#001a40", "Complete": "#001a14" };
  range.setBackground(colors[status] || "#0e0e1a");
}`;

function ScriptModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 800, maxHeight: "90vh", overflow: "auto" }}>
        <div className="modal-header">
          <span className="modal-title">📄 Google Apps Script Code</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
          Copy this code → open your Google Sheet → <strong>Extensions → Apps Script</strong> → paste it → <strong>Deploy as Web App (Anyone)</strong>.
        </p>
        <pre style={{
          background: "var(--bg-elevated)", padding: 16, borderRadius: "var(--radius-md)",
          fontSize: 12, fontFamily: "'JetBrains Mono', monospace", overflowX: "auto",
          color: "var(--text-secondary)", border: "1px solid var(--border-subtle)",
          lineHeight: 1.6, maxHeight: 480, overflowY: "auto", whiteSpace: "pre-wrap"
        }}>
          {APPS_SCRIPT_CODE}
        </pre>
        <div className="modal-footer">
          <button className="toolbar-btn" onClick={onClose}>Close</button>
          <button className="toolbar-btn primary" onClick={copy}>
            {copied ? "✅ Copied!" : "📋 Copy Code"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── MAIN PAGE ───────────────────────────────────────── */
export default function Home() {
  const [url, setUrl] = useState("");
  const [rows, setRows] = useState<ParsedQuestion[]>([]);
  const [filteredRows, setFilteredRows] = useState<ParsedQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [history, setHistory] = useState<{ url: string; label: string; date: string }[]>([]);
  const [scriptUrl, setScriptUrl] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [editRow, setEditRow] = useState<ParsedQuestion | null>(null);
  const [filterStatus, setFilterStatus] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [filterSeries, setFilterSeries] = useState("All");
  const [search, setSearch] = useState("");
  const toastId = useRef(0);

  useEffect(() => {
    setRows(loadRows());
    setHistory(loadHistory());
    setScriptUrl(localStorage.getItem(LS_SCRIPT) || "");
  }, []);

  const addToast = useCallback((type: Toast["type"], msg: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, type, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  // Apply filters
  useEffect(() => {
    let r = [...rows];
    if (filterStatus !== "All") r = r.filter((q) => q.status === filterStatus);
    if (filterType !== "All") r = r.filter((q) => q.questionType === filterType);
    if (filterSeries !== "All") r = r.filter((q) => q.seriesTitle === filterSeries);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter((q) =>
        q.question.toLowerCase().includes(s) ||
        q.seriesTitle.toLowerCase().includes(s) ||
        q.qNumLocal.toLowerCase().includes(s) ||
        q.answer.toLowerCase().includes(s)
      );
    }
    setFilteredRows(r);
  }, [rows, filterStatus, filterType, filterSeries, search]);

  const seriesList = [...new Set(rows.map((r) => r.seriesTitle).filter(Boolean))];
  const typeList   = [...new Set(rows.map((r) => r.questionType))];

  const stats = {
    total:    rows.length,
    pending:  rows.filter((r) => r.status === "Pending").length,
    review:   rows.filter((r) => r.status === "Review").length,
    complete: rows.filter((r) => r.status === "Complete").length,
    docs:     new Set(rows.map((r) => r.sourceDoc)).size,
  };

  const handleParse = async () => {
    if (!url.trim()) { addToast("error", "Please paste a Google Drive document URL"); return; }
    setLoading(true);
    try {
      const resp = await fetch(`/api/parse?url=${encodeURIComponent(url.trim())}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Parse failed");
      if (!data.questions?.length) { addToast("info", "No questions found in this document"); return; }
      const merged = [...rows, ...data.questions];
      setRows(merged);
      saveRows(merged);
      addHistory(url.trim());
      setHistory(loadHistory());
      addToast("success", `✅ Parsed ${data.questions.length} questions successfully`);
      setUrl("");
    } catch (err: unknown) {
      addToast("error", err instanceof Error ? err.message : "Parse error");
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async () => {
    if (!scriptUrl) { setShowSettings(true); return; }
    if (!rows.length) { addToast("error", "No questions to push"); return; }
    setPushing(true);
    try {
      const resp = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: rows, scriptUrl }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Push failed");
      addToast("success", `🚀 Pushed ${data.written} rows to Google Sheet!`);
    } catch (err: unknown) {
      addToast("error", err instanceof Error ? err.message : "Push error");
    } finally {
      setPushing(false);
    }
  };

  const handleStatusChange = (idx: number, status: Status) => {
    const updated = rows.map((r, i) => i === idx ? { ...r, status } : r);
    setRows(updated);
    saveRows(updated);
  };

  const handleSaveEdit = (updated: ParsedQuestion) => {
    const newRows = rows.map((r) =>
      r.qNumGlobal === updated.qNumGlobal ? updated : r
    );
    setRows(newRows);
    saveRows(newRows);
    addToast("success", "Row updated");
  };

  const handleClear = () => {
    if (!confirm("Clear all imported questions from local view? (Sheet data is unaffected)")) return;
    setRows([]);
    saveRows([]);
  };

  const handleUndo = () => {
    // Remove last batch (same date)
    if (!rows.length) return;
    const lastDate = rows[rows.length - 1].date;
    const trimmed = rows.filter((r) => r.date !== lastDate);
    setRows(trimmed);
    saveRows(trimmed);
    addToast("info", "Undid last import");
  };

  const handleExportCSV = () => {
    const headers = ["Date","Q# Global","Q# Local","Type","Series","Video Title","Source Link","Question","Answer","Difficulty","Time","Status","Editor Link","Remarks"];
    const csvRows = [headers, ...rows.map((r) => [
      r.date, r.qNumGlobal, r.qNumLocal, r.questionType, r.seriesTitle,
      r.videoTitle, r.sourceVideoLink, `"${r.question.replace(/"/g,'""')}"`,
      r.answer, r.difficulty, r.timeSec, r.status, r.editorVideoLink, r.remarks
    ])];
    const csv = csvRows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `questionvault_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  };

  const removeHistory = (hUrl: string) => {
    const h = loadHistory().filter((x) => x.url !== hUrl);
    localStorage.setItem(LS_HISTORY, JSON.stringify(h));
    setHistory(h);
  };

  return (
    <>
      {/* HEADER */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-icon">📊</div>
            <span className="logo-text">QuestionVault</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="toolbar-btn" onClick={() => setShowScript(true)}>📄 Apps Script</button>
            <button id="settings-btn" className="toolbar-btn" onClick={() => setShowSettings(true)}>⚙️ Settings</button>
            <div className="header-badge">
              <span className="header-badge-dot" />
              Drive → Sheets
            </div>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero-badge">⚡ Google Drive Parser</div>
        <h1 className="hero-title">
          From Drive to Sheet,{" "}
          <span className="hero-title-gradient">Instantly.</span>
        </h1>
        <p className="hero-subtitle">
          Paste any Google Drive document link, auto-parse all questions, and sync directly
          to your Google Sheet — complete with status tracking for your editorial team.
        </p>

        {/* IMPORT BOX */}
        <div className="import-box">
          <div className="import-row">
            <input
              id="drive-url-input"
              className="import-input"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleParse()}
              placeholder="Paste Google Drive document URL here…"
            />
            <button
              id="parse-btn"
              className="import-btn"
              disabled={loading}
              onClick={handleParse}
            >
              {loading ? <><span className="spinner" /> Parsing…</> : <><span>⚡</span> Parse & Import</>}
            </button>
          </div>
          <div className="import-hint">
            <span className="import-hint-item">🔗 docs.google.com/document/d/…</span>
            <span className="import-hint-item">🔒 Doc must be publicly shared</span>
            <span className="import-hint-item">⏎ Press Enter to parse</span>
          </div>
        </div>
      </section>

      {/* STATS */}
      <div className="stats-bar">
        {[
          { label: "Total Questions", value: stats.total, cls: "violet" },
          { label: "Pending",         value: stats.pending,  cls: "amber" },
          { label: "Review",          value: stats.review,   cls: "blue"  },
          { label: "Complete",        value: stats.complete, cls: "green" },
          { label: "Docs Imported",   value: stats.docs,     cls: "cyan"  },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className={`stat-value ${s.cls}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* HISTORY STRIP */}
      {history.length > 0 && (
        <div className="history-strip">
          <div className="history-label">Import History</div>
          <div className="history-chips">
            {history.map((h) => (
              <div
                key={h.url}
                className="history-chip"
                onClick={() => setUrl(h.url)}
                title={h.url}
              >
                📄 {h.label} · {h.date}
                <span className="history-chip-remove" onClick={(e) => { e.stopPropagation(); removeHistory(h.url); }}>✕</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TOOLBAR */}
      <div className="section-toolbar">
        <div className="toolbar-left">
          <select
            id="filter-status"
            className="filter-select"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option>All</option>
            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
          </select>

          <select
            id="filter-type"
            className="filter-select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option>All</option>
            {typeList.map((t) => <option key={t}>{t}</option>)}
          </select>

          <select
            id="filter-series"
            className="filter-select"
            value={filterSeries}
            onChange={(e) => setFilterSeries(e.target.value)}
            style={{ maxWidth: 200 }}
          >
            <option>All</option>
            {seriesList.map((s) => <option key={s}>{s}</option>)}
          </select>

          <input
            id="search-input"
            className="search-input"
            placeholder="Search questions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="toolbar-right">
          <button className="toolbar-btn" onClick={handleUndo} disabled={!rows.length}>↩ Undo</button>
          <button className="toolbar-btn danger" onClick={handleClear} disabled={!rows.length}>🗑 Clear All</button>
          <button id="export-csv-btn" className="toolbar-btn" onClick={handleExportCSV} disabled={!rows.length}>⬇ Export CSV</button>
          <button
            id="push-sheet-btn"
            className="toolbar-btn primary"
            onClick={handlePush}
            disabled={pushing || !rows.length}
          >
            {pushing ? <><span className="spinner" /> Pushing…</> : <>🚀 Push to Sheet</>}
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="table-wrapper">
        <div className="table-container">
          {filteredRows.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">{rows.length > 0 ? "🔍" : "📋"}</div>
              <div className="empty-title">{rows.length > 0 ? "No results match your filters" : "No questions imported yet"}</div>
              <div className="empty-sub">
                {rows.length > 0
                  ? "Try adjusting your filters or search term."
                  : "Paste a Google Drive document link above and click Parse & Import to get started."}
              </div>
            </div>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Q# Global</th>
                    <th>Q# Local</th>
                    <th>Type</th>
                    <th>Series / Topic</th>
                    <th>Video Title</th>
                    <th>Source Link</th>
                    <th style={{ minWidth: 280 }}>Question</th>
                    <th>Answer</th>
                    <th>Difficulty</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Editor Link</th>
                    <th>Edit</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((q, i) => {
                    const origIdx = rows.findIndex((r) => r.qNumGlobal === q.qNumGlobal);
                    return (
                      <tr key={q.qNumGlobal}>
                        <td className="td-number">{i + 1}</td>
                        <td className="td-date">{q.date}</td>
                        <td className="td-qnum">G{q.qNumGlobal}</td>
                        <td className="td-qnum">{q.qNumLocal}</td>
                        <td>{typeBadge(q.questionType)}</td>
                        <td className="td-topic">{q.seriesTitle || "—"}</td>
                        <td style={{ fontSize: 12, color: "var(--text-secondary)", maxWidth: 160 }}>
                          {q.videoTitle || "—"}
                        </td>
                        <td className="td-link">
                          {q.sourceVideoLink
                            ? <a href={q.sourceVideoLink} target="_blank" rel="noreferrer">▶ Watch</a>
                            : <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                        <td className="td-question">{q.question || "—"}</td>
                        <td className="td-answer">{q.answer || "—"}</td>
                        <td>{q.difficulty ? difficultyBar(q.difficulty) : <span style={{ color: "var(--text-muted)" }}>—</span>}</td>
                        <td style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                          {q.timeSec || "—"}
                        </td>
                        <td>
                          <select
                            className="filter-select"
                            value={q.status}
                            onChange={(e) => handleStatusChange(origIdx, e.target.value as Status)}
                            style={{
                              fontSize: 12,
                              padding: "4px 28px 4px 8px",
                              color: q.status === "Complete" ? "var(--status-complete)"
                                   : q.status === "Review" ? "var(--status-review)"
                                   : "var(--status-pending)",
                              borderColor: q.status === "Complete" ? "var(--status-complete-border)"
                                         : q.status === "Review" ? "var(--status-review-border)"
                                         : "var(--status-pending-border)",
                              background: q.status === "Complete" ? "var(--status-complete-bg)"
                                        : q.status === "Review" ? "var(--status-review-bg)"
                                        : "var(--status-pending-bg)",
                            }}
                          >
                            {STATUS_OPTIONS.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </td>
                        <td className="td-link">
                          {q.editorVideoLink
                            ? <a href={q.editorVideoLink} target="_blank" rel="noreferrer">🎬 View</a>
                            : <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>}
                        </td>
                        <td>
                          <button
                            className="toolbar-btn"
                            style={{ padding: "4px 10px", fontSize: 12 }}
                            onClick={() => setEditRow(q)}
                          >
                            ✏️
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER */}
      <footer className="footer">
        <span>QuestionVault</span>
        <span style={{ color: "var(--border-normal)" }}>·</span>
        <span>Drive → Sheet Production Tracker</span>
        <span style={{ color: "var(--border-normal)" }}>·</span>
        <span>{rows.length} questions loaded</span>
      </footer>

      {/* MODALS */}
      {showSettings && (
        <SettingsModal
          scriptUrl={scriptUrl}
          onSave={(u) => { setScriptUrl(u); localStorage.setItem(LS_SCRIPT, u); addToast("success", "Settings saved"); }}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showScript && <ScriptModal onClose={() => setShowScript(false)} />}
      {editRow && (
        <EditModal row={editRow} onSave={handleSaveEdit} onClose={() => setEditRow(null)} />
      )}

      {/* TOASTS */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>
        ))}
      </div>
    </>
  );
}
