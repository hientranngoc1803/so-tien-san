import { NextResponse } from "next/server";
import { getQrImage } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const img = await getQrImage();
  if (!img) return NextResponse.json({ ok: false }, { status: 404 });
  return new NextResponse(new Uint8Array(img.bytes), {
    headers: {
      "content-type": img.mime,
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
