import Link from "next/link";
import { db, fetchAll } from "@/lib/supabase";
import { formatDate, signedVnd, vnd } from "@/lib/money";
import { createSessionAction } from "../actions";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  session_date: string;
  title: string | null;
  status: "draft" | "closed";
  total_due: number;
  rounding_diff: number;
  session_participants: { count: number }[];
}

export default async function SessionsPage() {
  const rows = await fetchAll<Row>((from, to) =>
    db()
      .from("sessions")
      .select("id, session_date, title, status, total_due, rounding_diff, session_participants(count)")
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to),
  );
  return (
    <>
      <div className="hstack" style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Buổi</h1>
        <span className="spacer" />
        <form action={createSessionAction}>
          <input type="hidden" name="from" value="previous" />
          <button className="primary" type="submit">
            Dùng danh sách buổi trước
          </button>
        </form>
        <form action={createSessionAction}>
          <button type="submit">Buổi trống</button>
        </form>
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ngày</th>
              <th>Tên</th>
              <th>Trạng thái</th>
              <th className="num">Người</th>
              <th className="num">Tổng thu</th>
              <th className="num">Chênh lệch</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/buoi/${r.id}`}>{formatDate(r.session_date)}</Link>
                </td>
                <td>{r.title ?? ""}</td>
                <td>
                  <span className={`badge ${r.status === "draft" ? "draft" : "paid"}`}>
                    {r.status === "draft" ? "Nháp" : "Đã chốt"}
                  </span>
                </td>
                <td className="num">{r.session_participants?.[0]?.count ?? 0}</td>
                <td className="num">{r.status === "closed" ? vnd(r.total_due) : "—"}</td>
                <td className="num">{r.status === "closed" ? signedVnd(r.rounding_diff) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted">Chưa có buổi nào.</p>}
      </div>
    </>
  );
}
