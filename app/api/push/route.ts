import { NextRequest, NextResponse } from "next/server";
import { ParsedQuestion } from "../parse/route";

/**
 * Smart Re-Sync All
 *
 * Questions WITHOUT a rowId  → sent via "init" (appended, get fresh rowIds back)
 * Questions WITH    a rowId  → sent via "full_sync" (overwrite in-place)
 *
 * Returns the full questions array with rowIds filled in so the client can
 * persist them to localStorage and future live-updates will work.
 */
export async function POST(req: NextRequest) {
  let body: { questions: ParsedQuestion[]; scriptUrl: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.scriptUrl) {
    return NextResponse.json(
      { error: "scriptUrl is required. Please configure your Apps Script URL in Settings." },
      { status: 400 }
    );
  }

  if (!body.questions || body.questions.length === 0) {
    return NextResponse.json({ error: "No questions to sync" }, { status: 400 });
  }

  const withId    = body.questions.filter((q) => q.rowId !== undefined);
  const withoutId = body.questions.filter((q) => q.rowId === undefined);

  let newRowIds: number[] = [];

  try {
    // ── 1. Append questions that have never been synced ──────────────────
    if (withoutId.length > 0) {
      const resp = await fetch(body.scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "init", questions: withoutId }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Apps Script init error ${resp.status}: ${text.slice(0, 200)}`);
      }

      const result = await resp.json().catch(() => ({ rowIds: [] }));
      newRowIds = result.rowIds || [];
    }

    // ── 2. Overwrite questions that already have rowIds ──────────────────
    if (withId.length > 0) {
      const resp = await fetch(body.scriptUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "full_sync", questions: withId }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Apps Script full_sync error ${resp.status}: ${text.slice(0, 200)}`);
      }
    }

    // ── 3. Build updated questions list with rowIds assigned ─────────────
    let withoutIdIdx = 0;
    const updatedQuestions = body.questions.map((q) => {
      if (q.rowId !== undefined) return q; // already had a rowId
      const rowId = newRowIds[withoutIdIdx++];
      return rowId !== undefined ? { ...q, rowId } : q;
    });

    return NextResponse.json({
      success: true,
      written: body.questions.length,
      newlyAssigned: withoutId.length,
      updatedQuestions,   // ← client merges these back into localStorage
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to sync to Apps Script";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
