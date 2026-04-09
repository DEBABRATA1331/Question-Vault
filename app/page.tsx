"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
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
type Toast = { id: number; type: "success" | "error" | "info" | "sync"; msg: string };

// Undo stack item
type UndoEntry = {
  type: "status" | "edit" | "import";
  rowGlobal: number;
  field?: string;
  oldValue: unknown;
  newValue: unknown;
  // For import undo — the batch date to remove
  batchDate?: string;
};

const STATUS_OPTIONS: Status[] = ["Pending", "Review", "Complete"];
const TYPE_COLORS: Record<string, string> = {
  "MCQ": "mcq", "True/False": "tf", "Multi-Correct": "multi", "MSQ": "multi", "Logical MCQ": "logical"
};

const SUPERPOWERS: Record<string, string[]> = {
  "Smart Logic": ["Pattern Recognition", "Logical Deduction", "Reasoning Speed"],
  "Master Builder": ["Mechanical Reasoning", "Systems Thinking", "Structural Planning"],
  "Super Vision": ["Spatial Rotation", "Visual Mapping", "Object Relationship"],
  "Idea Magic": ["Creative Divergence", "Innovation Thinking", "Solution Flexibility"],
  "Rocket Speed": ["Reaction Time", "Processing Speed", "Rapid Decision"],
  "Target Focus": ["Attention Span", "Distraction Resistance", "Persistence Focus"],
};

const FIELD_TO_COL: Record<string, number> = {
  status: 17,
  editorVideoLink: 18,
  remarks: 19,
  seriesTitle: 7,
  videoTitle: 8,
  sourceVideoLink: 9,
  question: 10,
  answer: 12,
  questionType: 4,
  superpower: 5,
  subCompetency: 6,
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

// Suppress unused warning for statusBadge
void statusBadge;

function difficultyBar(d: string) {
  if (!d) return null;
  // Support both "4/10" and "Level 3" formats
  let num: number;
  const fractionM = d.match(/(\d+)\/\d+/);
  const levelM = d.match(/Level\s*(\d+)/i);
  if (fractionM) {
    num = Number(fractionM[1]);
  } else if (levelM) {
    num = Number(levelM[1]);
  } else {
    num = 0;
  }
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
            Paste the URL of your deployed Apps Script Web App. See the <strong style={{ color: "var(--accent-violet-light)" }}>Apps Script Setup Guide</strong> below.
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
              <li>Delete existing code and paste the <strong>Apps Script code</strong> (click "📄 Apps Script" button in header)</li>
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

        <div className="modal-row" style={{ marginBottom: 12 }}>
          <div className="modal-field">
            <label>Superpower</label>
            <select value={r.superpower || ""} onChange={(e) => setR({ ...r, superpower: e.target.value, subCompetency: "" })}>
              <option value="">— Select —</option>
              {Object.keys(SUPERPOWERS).map((sp) => <option key={sp}>{sp}</option>)}
            </select>
          </div>
          <div className="modal-field">
            <label>Sub-Competency</label>
            <select value={r.subCompetency || ""} onChange={(e) => setR({ ...r, subCompetency: e.target.value })} disabled={!r.superpower}>
              <option value="">— Select —</option>
              {(SUPERPOWERS[r.superpower || ""] || []).map((sc) => <option key={sc}>{sc}</option>)}
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

/* ── APPS SCRIPT CODE (UPDATED) ──────────────────────── */
const APPS_SCRIPT_CODE = `// QuestionVault v2 — Google Apps Script
// Paste this in your sheet's Apps Script editor and deploy as a Web App (Anyone)

const SHEET_NAME = "Questions";

const HEADERS = [
  "Date", "Q# Global", "Q# Local", "Question Type",
  "Superpower", "Sub-Competency",
  "Series / Topic", "Video Title", "Source Video Link",
  "Question", "Options", "Answer", "Difficulty", "Time (sec)",
  "Clip Reference", "Source Doc", "Status", "Editor Video Link", "Remarks"
];

const COL = {
  date: 1, qNumGlobal: 2, qNumLocal: 3, questionType: 4,
  superpower: 5, subCompetency: 6,
  seriesTitle: 7, videoTitle: 8, sourceVideoLink: 9,
  question: 10, options: 11, answer: 12, difficulty: 13,
  timeSec: 14, clipRef: 15, sourceDoc: 16,
  status: 17, editorVideoLink: 18, remarks: 19
};

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  ensureHeaders(sheet);
  return sheet;
}

// Runs on EVERY request — self-healing headers
function ensureHeaders(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  if (firstRow[0] !== HEADERS[0]) {
    if (firstRow.some(cell => cell !== "")) sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    formatHeaders(sheet);
  }
}

// Run manually from Apps Script editor to repair missing headers
function fixHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    formatHeaders(sheet);
    SpreadsheetApp.getUi().alert("Sheet created and headers written!");
    return;
  }
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const ok = firstRow[0] === HEADERS[0] && firstRow[HEADERS.length - 1] === HEADERS[HEADERS.length - 1];
  if (ok) {
    formatHeaders(sheet);
    SpreadsheetApp.getUi().alert("Headers correct — formatting refreshed!");
  } else {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    formatHeaders(sheet);
    SpreadsheetApp.getUi().alert("Headers inserted! Click Re-Sync All in the dashboard.");
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || "init";
    if (action === "init")      return handleInit(data);
    if (action === "update")    return handleUpdate(data);
    if (action === "full_sync") return handleFullSync(data);
    return jsonResponse({ error: "Unknown action" });
  } finally { lock.releaseLock(); }
}

function handleInit(data) {
  const sheet = getOrCreateSheet();
  const questions = data.questions || [];
  const rowIds = [];
  questions.forEach((q) => {
    sheet.appendRow(buildRow(q));
    const rowNum = sheet.getLastRow();
    colorRowByStatus(sheet, rowNum, q.status || "Pending");
    rowIds.push(rowNum);
  });
  return jsonResponse({ success: true, written: questions.length, rowIds });
}

function handleUpdate(data) {
  const sheet = getOrCreateSheet();
  const { rowId, field, value } = data;
  const colNum = COL[field];
  if (!colNum || !rowId) return jsonResponse({ error: "Invalid rowId or field" });
  sheet.getRange(rowId, colNum).setValue(value);
  if (field === "status") colorRowByStatus(sheet, rowId, value);
  return jsonResponse({ success: true });
}

function handleFullSync(data) {
  const sheet = getOrCreateSheet();
  const questions = data.questions || [];
  let updated = 0;
  questions.forEach((q) => {
    if (!q.rowId) return;
    sheet.getRange(q.rowId, 1, 1, HEADERS.length).setValues([buildRow(q)]);
    colorRowByStatus(sheet, q.rowId, q.status || "Pending");
    updated++;
  });
  return jsonResponse({ success: true, updated });
}

function buildRow(q) {
  return [
    q.date, q.qNumGlobal, q.qNumLocal, q.questionType,
    q.superpower || "", q.subCompetency || "",
    q.seriesTitle, q.videoTitle, q.sourceVideoLink,
    q.question, (q.options || []).join(" | "),
    q.answer, q.difficulty, q.timeSec, q.clipRef,
    q.sourceDoc, q.status || "Pending",
    q.editorVideoLink || "", q.remarks || ""
  ];
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ rows: [] });
  return jsonResponse({ rows: sheet.getDataRange().getValues() });
}

function formatHeaders(sheet) {
  const h = sheet.getRange(1, 1, 1, HEADERS.length);
  h.setValues([HEADERS]);
  h.setBackground("#4f46e5");
  h.setFontColor("#ffffff");
  h.setFontWeight("bold");
  h.setFontSize(11);
  h.setWrap(false);
  sheet.setFrozenRows(1);
  [100,90,80,110,160,180,180,160,200,340,200,100,100,90,130,200,100,200,200]
    .forEach((w, i) => sheet.setColumnWidth(i + 1, w));
}

function colorRowByStatus(sheet, rowNum, status) {
  if (rowNum < 2) return;
  const colors = { "Pending": "#FFF3CD", "Review": "#CCE5FF", "Complete": "#D4EDDA" };
  sheet.getRange(rowNum, 1, 1, HEADERS.length).setBackground(colors[status] || "#F8F9FA");
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
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
          <span className="modal-title">📄 Google Apps Script Code (v2)</span>
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
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [username, setUsername] = useState("");

  const [url, setUrl] = useState("");
  const [rows, setRows] = useState<ParsedQuestion[]>([]);
  const [filteredRows, setFilteredRows] = useState<ParsedQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [syncingRowId, setSyncingRowId] = useState<number | null>(null);

  const toastId = useRef(0);

  /* ── Auth check on mount ──── */
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) { router.replace("/login"); return; }
        setUsername(d.username);
        setAuthChecked(true);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  useEffect(() => {
    if (!authChecked) return;
    setRows(loadRows());
    setHistory(loadHistory());
    setScriptUrl(localStorage.getItem(LS_SCRIPT) || "");
  }, [authChecked]);

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

  /* ── Live cell update ───────────── */
  const liveUpdate = useCallback(async (rowId: number, field: string, value: string) => {
    if (!scriptUrl) return; // silent if no script url
    setSyncingRowId(rowId);
    try {
      await fetch("/api/sync/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptUrl, rowId, field, value }),
      });
      // Show a brief sync indicator, no full toast for every change
    } catch {
      addToast("error", "⚠️ Live sync failed — change saved locally");
    } finally {
      setSyncingRowId(null);
    }
  }, [scriptUrl, addToast]);

  /* ── Parse & auto-sync to sheet ── */
  const handleParse = async () => {
    if (!url.trim()) { addToast("error", "Please paste a Google Drive document URL"); return; }
    setLoading(true);
    try {
      const resp = await fetch(`/api/parse?url=${encodeURIComponent(url.trim())}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Parse failed");
      if (!data.questions?.length) { addToast("info", "No questions found in this document"); return; }

      let newQuestions: ParsedQuestion[] = data.questions;

      // Auto-sync to sheet if script URL configured
      if (scriptUrl) {
        setSyncing(true);
        addToast("info", `⚡ Syncing ${newQuestions.length} questions to sheet…`);
        try {
          const syncResp = await fetch("/api/sync/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ questions: newQuestions, scriptUrl }),
          });
          const syncData = await syncResp.json();
          if (syncResp.ok && syncData.rowIds?.length) {
            // Attach permanent rowId to each question
            newQuestions = newQuestions.map((q, i) => ({
              ...q,
              rowId: syncData.rowIds[i] ?? undefined,
            }));
          }
        } catch {
          addToast("error", "⚠️ Sheet sync failed — questions saved locally only");
        } finally {
          setSyncing(false);
        }
      }

      const merged = [...rows, ...newQuestions];
      setRows(merged);
      saveRows(merged);
      addHistory(url.trim());
      setHistory(loadHistory());

      // Push undo entry for the entire import batch
      const batchDate = newQuestions[0]?.date || new Date().toISOString().split("T")[0];
      setUndoStack((s) => [
        { type: "import", rowGlobal: -1, oldValue: null, newValue: newQuestions.length, batchDate },
        ...s.slice(0, 19),
      ]);

      addToast("success", `✅ Parsed & synced ${newQuestions.length} questions${scriptUrl ? " to sheet" : " locally"}`);
      setUrl("");
    } catch (err: unknown) {
      addToast("error", err instanceof Error ? err.message : "Parse error");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  /* ── Full re-sync (safety net) ── */
  const handleFullSync = async () => {
    if (!scriptUrl) { setShowSettings(true); return; }
    if (!rows.length) { addToast("error", "No questions to sync"); return; }
    setSyncing(true);
    try {
      const resp = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: rows, scriptUrl }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Sync failed");

      // If the server returned updatedQuestions (with new rowIds assigned),
      // merge them back so live-updates work going forward
      if (data.updatedQuestions?.length) {
        setRows(data.updatedQuestions);
        saveRows(data.updatedQuestions);
      }

      const newly = data.newlyAssigned ?? 0;
      addToast(
        "success",
        `🔄 Re-sync done: ${data.written} rows synced${newly > 0 ? ` (${newly} new rowIds assigned)` : ""}`
      );
    } catch (err: unknown) {
      addToast("error", err instanceof Error ? err.message : "Sync error");
    } finally {
      setSyncing(false);
    }
  };


  /* ── Status inline change (live) ── */
  const handleStatusChange = async (origIdx: number, status: Status) => {
    const row = rows[origIdx];
    const oldStatus = row.status;
    const updated = rows.map((r, i) => i === origIdx ? { ...r, status } : r);
    setRows(updated);
    saveRows(updated);

    setUndoStack((s) => [
      { type: "status", rowGlobal: row.qNumGlobal, field: "status", oldValue: oldStatus, newValue: status },
      ...s.slice(0, 19),
    ]);

    // Live cell update
    if (row.rowId) {
      await liveUpdate(row.rowId, "status", status);
    }
  };

  /* ── Edit modal save (live multi-field update) ── */
  const handleSaveEdit = async (updated: ParsedQuestion) => {
    const original = rows.find((r) => r.qNumGlobal === updated.qNumGlobal);
    const newRows = rows.map((r) =>
      r.qNumGlobal === updated.qNumGlobal ? updated : r
    );
    setRows(newRows);
    saveRows(newRows);

    if (original) {
      setUndoStack((s) => [
        { type: "edit", rowGlobal: updated.qNumGlobal, oldValue: original, newValue: updated },
        ...s.slice(0, 19),
      ]);
    }

    addToast("success", "Row updated");

    // Live update all changed fields
    if (updated.rowId && scriptUrl) {
      const fields: (keyof ParsedQuestion)[] = ["status","editorVideoLink","remarks","seriesTitle","videoTitle","sourceVideoLink","question","answer","questionType","superpower","subCompetency"];
      for (const field of fields) {
        if (!original || original[field] !== updated[field]) {
          if (FIELD_TO_COL[field]) {
            await liveUpdate(updated.rowId, field, String(updated[field] ?? ""));
          }
        }
      }
    }
  };

  /* ── Undo ── */
  const handleUndo = async () => {
    if (!undoStack.length) return;
    const [last, ...rest] = undoStack;
    setUndoStack(rest);

    if (last.type === "import" && last.batchDate) {
      // Remove entire batch by date
      const trimmed = rows.filter((r) => r.date !== last.batchDate);
      setRows(trimmed);
      saveRows(trimmed);
      addToast("info", `↩ Undid import of ${Number(last.newValue)} questions`);
      return;
    }

    if (last.type === "status") {
      const oldStatus = last.oldValue as Status;
      const updated = rows.map((r) =>
        r.qNumGlobal === last.rowGlobal ? { ...r, status: oldStatus } : r
      );
      setRows(updated);
      saveRows(updated);
      addToast("info", `↩ Reverted status to "${oldStatus}"`);
      // Live revert the sheet cell
      const row = updated.find((r) => r.qNumGlobal === last.rowGlobal);
      if (row?.rowId) await liveUpdate(row.rowId, "status", oldStatus);
      return;
    }

    if (last.type === "edit") {
      const oldRow = last.oldValue as ParsedQuestion;
      const updated = rows.map((r) =>
        r.qNumGlobal === last.rowGlobal ? oldRow : r
      );
      setRows(updated);
      saveRows(updated);
      addToast("info", "↩ Reverted row edit");
      // Full re-sync for this row (re-apply all old fields)
      if (oldRow.rowId && scriptUrl) {
        await liveUpdate(oldRow.rowId, "status", String(oldRow.status));
        await liveUpdate(oldRow.rowId, "editorVideoLink", oldRow.editorVideoLink);
        await liveUpdate(oldRow.rowId, "remarks", oldRow.remarks);
      }
    }
  };

  const handleClear = () => {
    if (!confirm("Clear all imported questions from local view? (Sheet data is unaffected)")) return;
    setRows([]);
    saveRows([]);
    setUndoStack([]);
  };

  const handleExportCSV = () => {
    const headers = ["Date","Q# Global","Q# Local","Type","Superpower","Sub-Competency","Series","Video Title","Source Link","Question","Answer","Difficulty","Time","Status","Editor Link","Remarks"];
    const csvRows = [headers, ...rows.map((r) => [
      r.date, r.qNumGlobal, r.qNumLocal, r.questionType, r.superpower || "", r.subCompetency || "", r.seriesTitle,
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

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  };

  if (!authChecked) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-base)" }}>
        <div className="spinner" style={{ width: 32, height: 32 }} />
      </div>
    );
  }

  return (
    <>
      {/* HEADER */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <div className="logo-icon">📊</div>
            <span className="logo-text">QuestionVault</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {scriptUrl && (
              <div className="live-indicator">
                <span className="live-dot" />
                Live Sync
              </div>
            )}
            <button className="toolbar-btn" onClick={() => setShowScript(true)}>📄 Apps Script</button>
            <button id="settings-btn" className="toolbar-btn" onClick={() => setShowSettings(true)}>⚙️ Settings</button>
            <div className="header-user">
              <span className="header-user-avatar">👤</span>
              <span className="header-user-name">{username}</span>
              <button className="header-logout-btn" onClick={handleLogout} title="Sign out">
                ⏏ Logout
              </button>
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
          to your Google Sheet — every edit updates the sheet in real-time, no duplicates ever.
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
              disabled={loading || syncing}
              onClick={handleParse}
            >
              {loading ? <><span className="spinner" /> Parsing…</> :
               syncing ? <><span className="spinner" /> Syncing…</> :
               <><span>⚡</span> Parse & Import</>}
            </button>
          </div>
          <div className="import-hint">
            <span className="import-hint-item">🔗 docs.google.com/document/d/…</span>
            <span className="import-hint-item">🔒 Doc must be publicly shared</span>
            <span className="import-hint-item">
              {scriptUrl ? "✅ Live sync enabled" : "⚠️ Configure Apps Script for live sync"}
            </span>
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
          <button
            className={`toolbar-btn${undoStack.length > 0 ? " undo-ready" : ""}`}
            onClick={handleUndo}
            disabled={!undoStack.length}
            title={undoStack.length > 0 ? `Undo: ${undoStack[0]?.type}` : "Nothing to undo"}
          >
            ↩ Undo {undoStack.length > 0 && <span className="undo-count">{undoStack.length}</span>}
          </button>
          <button className="toolbar-btn danger" onClick={handleClear} disabled={!rows.length}>🗑 Clear All</button>
          <button id="export-csv-btn" className="toolbar-btn" onClick={handleExportCSV} disabled={!rows.length}>⬇ Export CSV</button>
          <button
            id="push-sheet-btn"
            className="toolbar-btn primary"
            onClick={handleFullSync}
            disabled={syncing || !rows.length}
          >
            {syncing ? <><span className="spinner" /> Syncing…</> : <>🔄 Re-Sync All</>}
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
                    <th>Superpower</th>
                    <th>Competency</th>
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
                    const isSyncingThis = q.rowId !== undefined && syncingRowId === q.rowId;
                    return (
                      <tr key={q.qNumGlobal} className={isSyncingThis ? "row-syncing" : ""}>
                        <td className="td-number">{i + 1}</td>
                        <td className="td-date">{q.date}</td>
                        <td className="td-qnum">G{q.qNumGlobal}</td>
                        <td className="td-qnum">{q.qNumLocal}</td>
                        <td>{typeBadge(q.questionType)}</td>
                        <td className="td-superpower">
                          {q.superpower
                            ? <span style={{ fontSize: 12, fontWeight: 600, color: "var(--accent-cyan)", whiteSpace: "nowrap", background: "rgba(34,211,238,0.10)", borderRadius: 6, padding: "2px 7px" }}>{q.superpower}</span>
                            : <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
                        <td style={{ fontSize: 11, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                          {q.subCompetency || <span style={{ color: "var(--text-muted)" }}>—</span>}
                        </td>
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
                          <div style={{ position: "relative" }}>
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
                            {isSyncingThis && <span className="cell-sync-dot" title="Syncing…" />}
                          </div>
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
        {scriptUrl && (
          <>
            <span style={{ color: "var(--border-normal)" }}>·</span>
            <span style={{ color: "var(--status-complete)" }}>● Live sync active</span>
          </>
        )}
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
