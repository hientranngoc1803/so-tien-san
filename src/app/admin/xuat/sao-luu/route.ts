import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { dumpAll } from "@/lib/backup";
import { todayVN } from "@/lib/money";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const dump = await dumpAll();
  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="so-tien-san-${todayVN()}.json"`,
      "cache-control": "no-store",
    },
  });
}
