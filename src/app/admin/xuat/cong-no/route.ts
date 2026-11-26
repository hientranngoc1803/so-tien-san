import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/auth";
import { loadLedger } from "@/lib/data";
import { formatShortDate, todayVN } from "@/lib/money";

export const dynamic = "force-dynamic";

function cell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v === "string") s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ ok: false }, { status: 401 });
  const ledger = await loadLedger();
  const rows: (string | number)[][] = [
    ["Mã", "Tên", "Đang chơi", "Số dư", "Còn phải trả", "Đang dư", "Tổng đã nộp", "Ngày chưa thanh toán"],
  ];
  const sorted = [...ledger.players].sort(
    (a, b) => (ledger.books.get(a.id)?.balance ?? 0) - (ledger.books.get(b.id)?.balance ?? 0),
  );
  for (const p of sorted) {
    const b = ledger.books.get(p.id);
    const bal = b?.balance ?? 0;
    rows.push([
      p.short_code,
      p.display_name,
      p.is_active ? "Có" : "Không",
      bal,
      bal < 0 ? -bal : 0,
      bal > 0 ? bal : 0,
      b?.totalPaid ?? 0,
      [...new Set((b?.openDebits ?? []).map((d) => formatShortDate(d.date)))].join(", "),
    ]);
  }
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cong-no-${todayVN()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
