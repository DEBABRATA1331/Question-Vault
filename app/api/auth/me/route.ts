import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "../login/route";

const COOKIE_NAME = "qv_session";

export async function GET(req: NextRequest) {
  // Suppress unused warning
  void req;
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });
  const username = verifySessionToken(token);
  if (!username) return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, username });
}
