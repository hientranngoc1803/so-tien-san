import Link from "next/link";
import { loadLedger } from "@/lib/data";
import { formatDate, signedVnd, vnd } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function OwnerPage() {
  const ledger = await loadLedger();
  const owner = ledger.courtOwner;
  const ownerId = owner?.id ?? null;
  const received = ledger.txns
    .filter((t) => t.kind === "payment" && (!t.counterparty_player_id || t.counterparty_player_id === ownerId))
    .reduce((s, t) => s + Number(t.amount), 0);
  const refunded = ledger.txns
    .filter((t) => t.kind === "refund" && (!t.counterparty_player_id || t.counterparty_player_id === ownerId))
    .reduce((s, t) => s + Number(t.amount), 0);
  const totalDiff = ledger.sessions.reduce((s, x) => s + Number(x.rounding_diff), 0);
  const byMonth = new Map<string, { diff: number; count: number }>();
  for (const s of ledger.sessions) {
    const m = s.session_date.slice(0, 7);
    const cur = byMonth.get(m) ?? { diff: 0, count: 0 };
    cur.diff += Number(s.rounding_diff);
    cur.count += 1;
    byMonth.set(m, cur);
  }
  const months = [...byMonth.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return (
    <>
      <h1>Sổ chủ sân{owner ? ` · ${owner.display_name}` : ""}</h1>
      {!owner && (
        <div className="alert warn">
          Chưa gắn chủ sân. Vào <Link href="/admin/nguoi-choi">Người chơi</Link>.
        </div>
      )}
      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <div className="stat">
          <div className="muted small">Tổng tiền đã nhận</div>
          <div className="value">{vnd(received)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Tổng đã hoàn lại</div>
          <div className="value">{vnd(refunded)}</div>
        </div>
        <div className="stat">
          <div className="muted small">Tổng chênh lệch làm tròn</div>
          <div className={`value ${totalDiff < 0 ? "debt" : "credit"}`}>{signedVnd(totalDiff)}</div>
        </div>
      </div>

      <div className="card table-wrap">
        <h2>Chênh lệch theo tháng</h2>
        <table>
          <thead>
            <tr>
              <th>Tháng</th>
              <th className="num">Số buổi</th>
              <th className="num">Chênh lệch</th>
            </tr>
          </thead>
          <tbody>
            {months.map(([m, v]) => (
              <tr key={m}>
                <td>
                  {m.slice(5)}/{m.slice(0, 4)}
                </td>
                <td className="num">{v.count}</td>
                <td className="num">{signedVnd(v.diff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card table-wrap">
        <h2>Các buổi</h2>
        <table>
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Tên</th>
              <th className="num">Chi phí chung</th>
              <th className="num">Tổng thu</th>
              <th className="num">Chênh lệch</th>
            </tr>
          </thead>
          <tbody>
            {ledger.sessions.map((s) => (
              <tr key={s.id}>
                <td>
                  <Link href={`/admin/buoi/${s.id}`}>{formatDate(s.session_date)}</Link>
                </td>
                <td>{s.title ?? ""}</td>
                <td className="num">{vnd(Number(s.shared_total))}</td>
                <td className="num">{vnd(Number(s.total_due))}</td>
                <td className="num">{signedVnd(Number(s.rounding_diff))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
