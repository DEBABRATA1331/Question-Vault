import { NextRequest, NextResponse } from "next/server";
import { ParsedQuestion } from "../../parse/route";

// Called after parsing a doc — writes rows to the sheet and returns their row IDs
export async function POST(req: NextRequest) {
  let body: { questions: ParsedQuestion[]; scriptUrl: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.scriptUrl) {
    return NextResponse.json({ error: "scriptUrl required" }, { status: 400 });
  }
  if (!body.questions?.length) {
    return NextResponse.json({ error: "No questions" }, { status: 400 });
  }

  try {
    const resp = await fetch(body.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "init", questions: body.questions }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Apps Script error ${resp.status}: ${text.slice(0, 200)}`);
    }

    const result = await resp.json().catch(() => ({ success: true, rowIds: [] }));
    // result.rowIds is an array of sheet row numbers matching questions order
    return NextResponse.json({ ok: true, rowIds: result.rowIds || [], written: body.questions.length });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Init sync failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
