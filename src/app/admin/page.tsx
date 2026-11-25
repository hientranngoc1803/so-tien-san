import Link from "next/link";
import { db } from "@/lib/supabase";
import { loadLedger } from "@/lib/data";
import { formatShortDate, vnd } from "@/lib/money";
import DebtTables, { type DebtRow } from "@/components/DebtTables";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const ledger = await loadLedger();
  const { count: drafts } = await db().from("sessions").select("id", { count: "exact", head: true }).eq("status", "draft");
  const rows: DebtRow[] = ledger.players.map((p) => {
    const book = ledger.books.get(p.id);
    const dates = [...new Set((book?.openDebits ?? []).map((d) => formatShortDate(d.date)))];
    return { id: p.id, code: p.short_code, name: p.display_name, balance: book?.balance ?? 0, openDates: dates.join(", ") };
  });
  const debtors = rows.filter((r) => r.balance < 0).sort((a, b) => a.balance - b.balance);
  const savers = rows.filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance);
  const totalDebt = debtors.reduce((s, r) => s - r.balance, 0);
  const totalCredit = savers.reduce((s, r) => s + r.balance, 0);

  return (
    <>
      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="muted small">Tổng còn phải thu</div>
          <div className="value debt">{vnd(totalDebt)}</div>
          <div className="muted small">{debtors.length} người</div>
        </div>
        <div className="stat">
          <div className="muted small">Tổng tiền người chơi đang dư</div>
          <div className="value credit">{vnd(totalCredit)}</div>
          <div className="muted small">{savers.length} người</div>
        </div>
        <div className="stat">
          <div className="muted small">Chủ sân</div>
          <div className="value" style={{ fontSize: 17 }}>
            {ledger.courtOwner ? ledger.courtOwner.display_name : <Link href="/admin/nguoi-choi">Chưa gắn</Link>}
          </div>
        </div>
        <div className="stat">
          <div className="muted small">Buổi nháp</div>
          <div className="value">{drafts ?? 0}</div>
          <Link href="/admin/buoi" className="small">
            Xem buổi →
          </Link>
        </div>
      </div>

      <div className="hstack" style={{ marginBottom: 16 }}>
        <Link href="/admin/buoi" className="btn primary">
          + Buổi mới
        </Link>
        <Link href="/admin/giao-dich/moi" className="btn">
          + Ghi nhận tiền
        </Link>
        <Link href="/admin/giao-dich/moi?mode=prepay" className="btn">
          + Nộp quỹ trước
        </Link>
        <Link href="/admin/giao-dich/moi?mode=adjust" className="btn">
          + Đầu kỳ / điều chỉnh
        </Link>
        <span className="spacer" />
        <a href="/admin/xuat/cong-no" className="btn">
          Xuất công nợ CSV
        </a>
        <a href="/admin/xuat/sao-luu" className="btn">
          Tải sao lưu JSON
        </a>
      </div>

      <DebtTables debtors={debtors} savers={savers} />
    </>
  );
}
