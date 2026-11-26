import Link from "next/link";
import { db, fetchAll } from "@/lib/supabase";
import { getPlayers } from "@/lib/data";
import { formatDate, vnd } from "@/lib/money";
import { voidTransactionAction } from "../actions";
import SearchSelect from "@/components/SearchSelect";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  player_id: string;
  kind: "payment" | "refund" | "opening" | "transfer";
  label: string | null;
  amount: number;
  counterparty_player_id: string | null;
  txn_date: string;
  bank_ref: string | null;
  group_ref: string | null;
  public_note: string | null;
  internal_note: string | null;
  created_by: string;
  voided_at: string | null;
  void_reason: string | null;
}

const KIND: Record<Row["kind"], string> = { payment: "Nộp tiền", refund: "Hoàn tiền", opening: "Điều chỉnh", transfer: "Được trả hộ" };

export default async function TxnListPage({
  searchParams,
}: {
  searchParams: Promise<{ player?: string; from?: string; to?: string; huy?: string; loi?: string }>;
}) {
  const sp = await searchParams;
  const players = await getPlayers();
  const name = new Map(players.map((p) => [p.id, `${p.display_name} · ${p.short_code}`]));
  const rows = await fetchAll<Row>((from, to) => {
    let q = db()
      .from("transactions")
      .select("id, player_id, kind, label, amount, counterparty_player_id, txn_date, bank_ref, group_ref, public_note, internal_note, created_by, voided_at, void_reason")
      .order("txn_date", { ascending: false })
      .order("id", { ascending: false });
    if (sp.player && /^[0-9a-f-]{36}$/i.test(sp.player)) {
      q = q.or(`player_id.eq.${sp.player},counterparty_player_id.eq.${sp.player}`);
    }
    if (sp.from && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)) q = q.gte("txn_date", sp.from);
    if (sp.to && /^\d{4}-\d{2}-\d{2}$/.test(sp.to)) q = q.lte("txn_date", sp.to);
    if (sp.huy !== "1") q = q.is("voided_at", null);
    return q.range(from, to);
  });
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const back = `/admin/giao-dich${qs ? `?${qs}` : ""}`;

  return (
    <>
      <div className="hstack" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Giao dịch</h1>
        <span className="spacer" />
        <Link className="btn primary" href="/admin/giao-dich/moi">
          + Ghi nhận tiền
        </Link>
      </div>
      <form className="card row" method="get">
        <label>
          Người
          <SearchSelect
            name="player"
            defaultValue={sp.player ?? ""}
            emptyLabel="Tất cả"
            options={players.map((p) => ({ value: p.id, label: p.display_name, hint: p.short_code }))}
          />
        </label>
        <label>
          Từ ngày
          <input type="date" name="from" defaultValue={sp.from ?? ""} />
        </label>
        <label>
          Đến ngày
          <input type="date" name="to" defaultValue={sp.to ?? ""} />
        </label>
        <label className="inline" style={{ flex: "0 0 auto" }}>
          <input type="checkbox" name="huy" value="1" defaultChecked={sp.huy === "1"} /> Hiện cả đã huỷ
        </label>
        <button type="submit" style={{ flex: "0 0 auto" }}>
          Lọc
        </button>
      </form>
      {sp.loi === "ly-do" && <div className="alert error">Cần nhập lý do huỷ.</div>}
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Người</th>
              <th>Loại</th>
              <th className="num">Số tiền</th>
              <th>Ghi chú</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={r.voided_at ? { opacity: 0.5 } : undefined}>
                <td>{formatDate(r.txn_date)}</td>
                <td>
                  {name.get(r.player_id)}
                  {r.counterparty_player_id && (
                    <div className="muted small">
                      {r.kind === "refund" ? "Người chuyển trả" : r.kind === "transfer" ? "Người trả" : "Người nhận"}: {name.get(r.counterparty_player_id)}
                    </div>
                  )}
                </td>
                <td>{r.label ?? KIND[r.kind]}</td>
                <td className="num">{vnd(Number(r.amount))}</td>
                <td className="small">
                  {r.public_note}
                  {r.bank_ref && <div className="muted">Mã NH: {r.bank_ref}</div>}
                  {r.internal_note && <div className="muted">Nội bộ: {r.internal_note}</div>}
                  <div className="muted">Bởi {r.created_by}</div>
                  {r.voided_at && <div className="debt">Đã huỷ: {r.void_reason}</div>}
                </td>
                <td>
                  {!r.voided_at && (
                    <details>
                      <summary className="small" style={{ color: "var(--err)" }}>
                        Huỷ
                      </summary>
                      <form action={voidTransactionAction} className="stack" style={{ marginTop: 6, minWidth: 180 }}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="back" value={back} />
                        {r.group_ref && <span className="muted small">Huỷ cả nhóm giao dịch đi cùng.</span>}
                        <input type="text" name="reason" placeholder="Lý do huỷ" required />
                        <button type="submit" className="danger">
                          Xác nhận huỷ
                        </button>
                      </form>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted">Không có giao dịch.</p>}
      </div>
    </>
  );
}
