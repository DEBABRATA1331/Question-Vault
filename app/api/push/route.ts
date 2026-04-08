import { NextRequest, NextResponse } from "next/server";
import { ParsedQuestion } from "../parse/route";

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
    return NextResponse.json({ error: "No questions to push" }, { status: 400 });
  }

  try {
    const resp = await fetch(body.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions: body.questions }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Apps Script responded with ${resp.status}: ${text.slice(0, 200)}`);
    }

    const result = await resp.json().catch(() => ({ success: true }));
    return NextResponse.json({ success: true, written: body.questions.length, result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to push to Apps Script";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
