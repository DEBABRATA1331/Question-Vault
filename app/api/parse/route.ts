import { NextRequest, NextResponse } from "next/server";

export interface ParsedQuestion {
  qNumGlobal: number;
  qNumLocal: string;
  questionType: "MCQ" | "True/False" | "Multi-Correct" | "MSQ" | "Logical MCQ";
  seriesTitle: string;
  videoTitle: string;
  sourceVideoLink: string;
  question: string;
  options: string[];
  answer: string;
  difficulty: string;
  timeSec: string;
  clipRef: string;
  date: string;
  sourceDoc: string;
  status: "Pending" | "Review" | "Complete";
  editorVideoLink: string;
  remarks: string;
  superpower?: string;
  subCompetency?: string;
  /** Permanent Google Sheet row number assigned when first written to the sheet */
  rowId?: number;
}

function extractDocId(url: string): string | null {
  const patterns = [
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{25,})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function detectQuestionType(title: string): ParsedQuestion["questionType"] {
  const t = title.toLowerCase();
  if (t.includes("true/false") || t.includes("true or false")) return "True/False";
  if (t.includes("multi-correct") || t.includes("msq") || t.includes("multiple select") || t.includes("multi correct")) return "Multi-Correct";
  if (t.includes("logical mcq")) return "Logical MCQ";
  if (t.includes("mcq")) return "MCQ";
  // default
  return "MCQ";
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");
  if (!rawUrl) return NextResponse.json({ error: "Missing url param" }, { status: 400 });

  const docId = extractDocId(rawUrl);
  if (!docId) return NextResponse.json({ error: "Could not extract Google Doc ID from URL" }, { status: 400 });

  let text: string;
  try {
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const resp = await fetch(exportUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      next: { revalidate: 0 },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: Document may be private or not shared`);
    text = await resp.text();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch document";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const questions = parseDocument(text, rawUrl);
  return NextResponse.json({ questions, total: questions.length });
}

function parseDocument(text: string, sourceUrl: string): ParsedQuestion[] {
  const date = new Date().toISOString().split("T")[0];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const questions: ParsedQuestion[] = [];

  let currentSeries = "";
  let currentVideoTitle = "";
  let currentVideoLink = "";
  let globalCounter = 0;

  // State for building a question
  let inQuestion = false;
  let currentQNumLocal = "";
  let currentTitle = "";
  let currentType: ParsedQuestion["questionType"] = "MCQ";
  let currentQuestion = "";
  let currentOptions: string[] = [];
  let currentAnswer = "";
  let currentDifficulty = "";
  let currentTime = "";
  let currentClip = "";
  let currentSuperpower = "";
  let currentSubCompetency = "";
  let captureMode: "question" | "options" | "answer" | "none" = "none";

  const flush = () => {
    if (!inQuestion || !currentQNumLocal) return;
    globalCounter++;
    questions.push({
      qNumGlobal: globalCounter,
      qNumLocal: currentQNumLocal,
      questionType: currentType,
      seriesTitle: currentSeries,
      videoTitle: currentVideoTitle,
      sourceVideoLink: currentVideoLink,
      question: currentQuestion.trim(),
      options: [...currentOptions],
      answer: currentAnswer.trim(),
      difficulty: currentDifficulty,
      timeSec: currentTime,
      clipRef: currentClip,
      date,
      sourceDoc: sourceUrl,
      status: "Pending",
      editorVideoLink: "",
      remarks: "",
      superpower: currentSuperpower,
      subCompetency: currentSubCompetency,
    });
    inQuestion = false;
    currentQNumLocal = "";
    currentTitle = "";
    currentQuestion = "";
    currentOptions = [];
    currentAnswer = "";
    currentDifficulty = "";
    currentTime = "";
    currentClip = "";
    currentSuperpower = "";
    currentSubCompetency = "";
    captureMode = "none";
  };

  const qStartRegex = /^Q(\d+)\s*[:\-–]\s*(.+)/i;
  const qStartRegex2 = /^Question\s+(\d+)\s*[:\-–]\s*(.+)/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Series / Topic title detection (no video link, no question prefix)
    const isSeriesHeader =
      /^(Experiment|Series|Episode|Trivia|Question Series|Superpower|Mindful|Faltu|Magnetism|Funky|Mindful Eating)/i.test(line) &&
      !qStartRegex.test(line) &&
      !qStartRegex2.test(line);

    if (isSeriesHeader) {
      flush();
      currentSeries = line;
      currentVideoTitle = "";
      currentVideoLink = "";
      continue;
    }

    // Video Details block
    if (/^Video Details/i.test(line)) {
      flush();
      continue;
    }
    if (/^\*?\s*Title\s*:/i.test(line)) {
      currentVideoTitle = line.replace(/^\*?\s*Title\s*:/i, "").trim();
      continue;
    }
    if (/^\*?\s*(Creator|URL|URL\s*:)/i.test(line)) {
      const m = line.match(/https?:\/\/[^\s]+/);
      if (m) currentVideoLink = m[0];
      continue;
    }

    // Standalone video link line
    if (/^Video\s*Link\s*:/i.test(line)) {
      const m = line.match(/https?:\/\/[^\s]+/);
      if (m) currentVideoLink = m[0];
      continue;
    }

    // Question start — "Q5: Title (MCQ)" or "Question 39: Title (MCQ)"
    let qMatch = line.match(qStartRegex) || line.match(qStartRegex2);
    if (qMatch) {
      flush();
      inQuestion = true;
      currentQNumLocal = `Q${qMatch[1]}`;
      currentTitle = qMatch[2];
      currentType = detectQuestionType(qMatch[2]);
      captureMode = "none";
      continue;
    }

    if (!inQuestion) continue;

    // Clip reference
    if (/^\*?\s*Clip\s*Ref(erence)?\s*:/i.test(line)) {
      currentClip = line.replace(/^\*?\s*Clip\s*Ref(erence)?\s*:/i, "").trim();
      continue;
    }

    // Superpower
    if (/^\*?\s*Superpower\s*:/i.test(line)) {
      currentSuperpower = line.replace(/^\*?\s*Superpower\s*:/i, "").trim();
      continue;
    }

    // Sub-Competency
    if (/^\*?\s*Sub-?Competency\s*:/i.test(line) || /^\*?\s*Sub\s*Competency\s*:/i.test(line)) {
      currentSubCompetency = line.replace(/^\*?\s*Sub-?Competency\s*:/i, "").trim();
      continue;
    }

    // Question text
    if (/^\*?\s*Question\s*:/i.test(line)) {
      currentQuestion = line.replace(/^\*?\s*Question\s*:/i, "").trim();
      captureMode = "question";
      continue;
    }

    // Options block start
    if (/^\*?\s*Options?\s*:/i.test(line)) {
      // Sometimes options are inline: "Options: 1. TRUE | 2. FALSE"
      const inline = line.replace(/^\*?\s*Options?\s*:/i, "").trim();
      if (inline) {
        // Parse pipe-separated inline options
        const parts = inline.split(/\|/).map((s) => s.trim()).filter(Boolean);
        if (parts.length > 1) {
          currentOptions = parts;
          captureMode = "none";
        } else {
          captureMode = "options";
        }
      } else {
        captureMode = "options";
      }
      continue;
    }

    // Answer line
    if (/^\*?\s*Answer\s*:/i.test(line)) {
      currentAnswer = line.replace(/^\*?\s*Answer\s*:/i, "").trim();
      captureMode = "answer";
      continue;
    }

    // Difficulty + Time (inline: "4/10 | Time: 20s" OR "Level 3 | Time: 20s")
    if (/^\*?\s*Difficulty\s*:/i.test(line)) {
      const rest = line.replace(/^\*?\s*Difficulty\s*:/i, "").trim();
      // Match "4/10" format
      const diffM = rest.match(/(\d+\/\d+)/);
      if (diffM) {
        currentDifficulty = diffM[1];
      } else {
        // Match "Level 3" format → store as "Level 3"
        const levelM = rest.match(/Level\s*(\d+)/i);
        if (levelM) currentDifficulty = `Level ${levelM[1]}`;
      }
      const timeM = rest.match(/Time\s*:\s*(\d+s?)/i);
      if (timeM) currentTime = timeM[1];
      captureMode = "none";
      continue;
    }

    // Bracket-format Superpower: [⚙️ Smart Logic (Pattern Recognition)]
    // Can appear on its own line anywhere inside a question block
    // Strips emojis, variation selectors, and spaces before the name
    const bracketMatch = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (bracketMatch) {
      const inner = bracketMatch[1].trim();
      // Strip leading emoji / non-letter chars to get to the actual name
      const nameAndComp = inner.replace(/^[^a-zA-Z]+/, "");
      const parenIdx = nameAndComp.lastIndexOf("(");
      if (parenIdx !== -1) {
        currentSuperpower = nameAndComp.slice(0, parenIdx).trim();
        currentSubCompetency = nameAndComp.slice(parenIdx + 1).replace(/\).*$/, "").trim();
        continue;
      }
    }

    // Numbered option lines: "1. Something" or "   1. Something"
    if (captureMode === "options") {
      const optMatch = line.match(/^(\d+)\.\s+(.+)/);
      if (optMatch) {
        currentOptions.push(`${optMatch[1]}. ${optMatch[2]}`);
        continue;
      }
      // End of options if we see something else that's not a continuation
      if (/^\*/.test(line)) {
        captureMode = "none";
      }
    }

    // Scientific Fact / Logic — stop capturing answer
    if (/^\*?\s*(Scientific\s*Fact|Logic|Fact)\s*:/i.test(line)) {
      captureMode = "none";
      continue;
    }

    // Separator line (underscores)
    if (/^_{4,}/.test(line)) {
      continue;
    }

    // Multi-line question continuation
    if (captureMode === "question" && !/^\*/.test(line)) {
      currentQuestion += " " + line;
    }
  }

  flush();
  return questions;
}
