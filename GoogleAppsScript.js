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

// ── Sheet bootstrap ────────────────────────────────────────────────────────
function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  ensureHeaders(sheet);
  return sheet;
}

/**
 * Checks row 1 of the sheet.
 * • If row 1 is empty → writes HEADERS and formats them.
 * • If row 1 exists but doesn't match HEADERS → inserts a new row 1,
 *   writes HEADERS, and formats it (preserves existing data).
 */
function ensureHeaders(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeaders = firstRow[0] === HEADERS[0]; // quick check on first cell

  if (!hasHeaders) {
    // If row 1 has data (but wrong headers), insert a blank row at top first
    if (firstRow.some(cell => cell !== "")) {
      sheet.insertRowBefore(1);
    }
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    formatHeaders(sheet);
  }
}

/**
 * Standalone function — run this manually from the Apps Script editor
 * if your sheet header row is missing or corrupt.
 * It will insert/overwrite row 1 with the correct column headers.
 */
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
  const alreadyCorrect = firstRow[0] === HEADERS[0] && firstRow[HEADERS.length - 1] === HEADERS[HEADERS.length - 1];

  if (alreadyCorrect) {
    // Just re-apply formatting
    formatHeaders(sheet);
    SpreadsheetApp.getUi().alert("Headers already correct — formatting refreshed!");
  } else {
    // Insert a new row 1 and write clean headers
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    formatHeaders(sheet);
    SpreadsheetApp.getUi().alert("Headers inserted at row 1! Your data rows were shifted down — check that rowIds are still correct, then click Re-Sync All in the dashboard.");
  }
}

// ── HTTP handlers ──────────────────────────────────────────────────────────
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action || "init";

    if (action === "init")       return handleInit(data);
    if (action === "update")     return handleUpdate(data);
    if (action === "full_sync")  return handleFullSync(data);

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

// Full re-sync — overwrites each row at its stored rowId
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
    q.superpower    || "",
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
    q.remarks         || ""
  ];
}

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ rows: [] });
  const data = sheet.getDataRange().getValues();
  return jsonResponse({ rows: data });
}

// ── Formatting helpers ─────────────────────────────────────────────────────
function formatHeaders(sheet) {
  const header = sheet.getRange(1, 1, 1, HEADERS.length);
  header.setValues([HEADERS]);           // ensure values are written
  header.setBackground("#4f46e5");
  header.setFontColor("#ffffff");
  header.setFontWeight("bold");
  header.setFontSize(11);
  header.setWrap(false);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1,  100);  // Date
  sheet.setColumnWidth(2,  90);   // Q# Global
  sheet.setColumnWidth(3,  80);   // Q# Local
  sheet.setColumnWidth(4,  110);  // Question Type
  sheet.setColumnWidth(5,  160);  // Superpower
  sheet.setColumnWidth(6,  180);  // Sub-Competency
  sheet.setColumnWidth(7,  180);  // Series / Topic
  sheet.setColumnWidth(8,  160);  // Video Title
  sheet.setColumnWidth(9,  200);  // Source Video Link
  sheet.setColumnWidth(10, 340);  // Question
  sheet.setColumnWidth(11, 200);  // Options
  sheet.setColumnWidth(12, 100);  // Answer
  sheet.setColumnWidth(13, 100);  // Difficulty
  sheet.setColumnWidth(14, 90);   // Time (sec)
  sheet.setColumnWidth(15, 130);  // Clip Reference
  sheet.setColumnWidth(16, 200);  // Source Doc
  sheet.setColumnWidth(17, 100);  // Status
  sheet.setColumnWidth(18, 200);  // Editor Video Link
  sheet.setColumnWidth(19, 200);  // Remarks
}

function colorRowByStatus(sheet, rowNum, status) {
  if (rowNum < 2) return;
  const range = sheet.getRange(rowNum, 1, 1, HEADERS.length);
  const colors = {
    "Pending":  "#FFF3CD",  // warm amber
    "Review":   "#CCE5FF",  // cool sky blue
    "Complete": "#D4EDDA",  // fresh mint green
  };
  range.setBackground(colors[status] || "#F8F9FA");
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
