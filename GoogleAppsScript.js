// QuestionVault v2 — Google Apps Script
// Paste this in your sheet's Apps Script editor and deploy as a Web App (Anyone)

const SHEET_NAME = "Questions";

const HEADERS = [
  "Date", "Q# Global", "Q# Local", "Question Type",
  "Superpower", "Sub-Competency",
  "Series / Topic", "Video Title", "Source Video Link",
  "Question", "Options", "Answer", "Difficulty", "Time (sec)",
  "Clip Reference", "Source Doc", "Status", "Editor Video Link", "Remarks"
];

// Column index map (1-based) — must match HEADERS order exactly
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
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    formatHeaders(sheet);
  }
  return sheet;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || "init";

    if (action === "init") return handleInit(data);
    if (action === "update") return handleUpdate(data);
    if (action === "full_sync") return handleFullSync(data);

    return jsonResponse({ error: "Unknown action" });
  } finally {
    lock.releaseLock();
  }
}

// Write new rows, return their sheet row numbers as rowIds
function handleInit(data) {
  const sheet = getOrCreateSheet();
  const questions = data.questions || [];
  const rowIds = [];

  questions.forEach((q) => {
    const row = buildRow(q);
    sheet.appendRow(row);
    const rowNum = sheet.getLastRow();
    colorRowByStatus(sheet, rowNum, q.status || "Pending");
    rowIds.push(rowNum);
  });

  return jsonResponse({ success: true, written: questions.length, rowIds });
}

// Update a single cell by sheet row number
function handleUpdate(data) {
  const sheet = getOrCreateSheet();
  const { rowId, field, value } = data;

  const colNum = COL[field];
  if (!colNum || !rowId) return jsonResponse({ error: "Invalid rowId or field" });

  sheet.getRange(rowId, colNum).setValue(value);

  // Re-color the whole row if status changed
  if (field === "status") {
    colorRowByStatus(sheet, rowId, value);
  }

  return jsonResponse({ success: true });
}

// Full re-sync: find row by rowId (stored in col 2 as a marker) and overwrite
// For rows that have a rowId, we look up by row number directly
function handleFullSync(data) {
  const sheet = getOrCreateSheet();
  const questions = data.questions || [];
  let updated = 0;

  questions.forEach((q) => {
    if (!q.rowId) return; // skip questions not yet synced
    const rowNum = q.rowId;
    const row = buildRow(q);
    const range = sheet.getRange(rowNum, 1, 1, HEADERS.length);
    range.setValues([row]);
    colorRowByStatus(sheet, rowNum, q.status || "Pending");
    updated++;
  });

  return jsonResponse({ success: true, updated });
}

function buildRow(q) {
  return [
    q.date,
    q.qNumGlobal,
    q.qNumLocal,
    q.questionType,
    q.superpower || "",
    q.subCompetency || "",
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
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ rows: [] });
  const data = sheet.getDataRange().getValues();
  return jsonResponse({ rows: data });
}

function formatHeaders(sheet) {
  const header = sheet.getRange(1, 1, 1, HEADERS.length);
  header.setBackground("#4f46e5");
  header.setFontColor("#ffffff");
  header.setFontWeight("bold");
  header.setFontSize(11);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(10, 320); // Question column
  sheet.setColumnWidth(5, 180);  // Superpower
  sheet.setColumnWidth(6, 200);  // Sub-Competency
}

function colorRowByStatus(sheet, rowNum, status) {
  if (rowNum < 2) return;
  const range = sheet.getRange(rowNum, 1, 1, HEADERS.length);
  // Vibrant pastel colors — easy on the eyes, clearly distinct
  const colors = {
    "Pending":  "#FFF3CD", // warm amber
    "Review":   "#CCE5FF", // cool sky blue
    "Complete": "#D4EDDA", // fresh mint green
  };
  range.setBackground(colors[status] || "#F8F9FA");
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
