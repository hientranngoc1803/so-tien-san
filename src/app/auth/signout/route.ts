import { NextResponse, type NextRequest } from "next/server";
import { authClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const sb = await authClient();
  await sb.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
