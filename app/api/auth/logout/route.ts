import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const COOKIE_NAME = "qv_session";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return NextResponse.json({ ok: true });
}
