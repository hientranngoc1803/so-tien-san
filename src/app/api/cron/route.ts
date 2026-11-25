import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { dumpAll } from "@/lib/backup";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const dump = await dumpAll();
  const storage = db().storage;
  const { data: buckets } = await storage.listBuckets();
  if (!buckets?.some((b) => b.name === "backups")) {
    await storage.createBucket("backups", { public: false });
  }
  const day = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  const { error } = await storage.from("backups").upload(`${day}.json`, JSON.stringify(dump), {
    contentType: "application/json",
    upsert: true,
  });
  return NextResponse.json({
    ok: !error,
    error: error?.message,
    counts: Object.fromEntries(Object.entries(dump.tables).map(([k, v]) => [k, v.length])),
  });
}
