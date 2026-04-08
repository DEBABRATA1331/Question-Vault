import { NextRequest, NextResponse } from "next/server";

// Live cell-level update — fires on every status/field change
export async function POST(req: NextRequest) {
  let body: { scriptUrl: string; rowId: number; field: string; value: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.scriptUrl) {
    return NextResponse.json({ error: "scriptUrl required" }, { status: 400 });
  }
  if (!body.rowId) {
    return NextResponse.json({ error: "rowId required" }, { status: 400 });
  }

  try {
    const resp = await fetch(body.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "update",
        rowId: body.rowId,
        field: body.field,
        value: body.value,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Apps Script error ${resp.status}: ${text.slice(0, 200)}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Live update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
