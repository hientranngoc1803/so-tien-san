import Link from "next/link";
import { db, fetchAll } from "@/lib/supabase";
import { formatDate, formatShortDate, lastWeekdayOnOrBefore, signedVnd, todayVN, vnd } from "@/lib/money";
import { getTemplates } from "@/lib/data";
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
  const [rows, templates] = await Promise.all([
    fetchAll<Row>((from, to) =>
      db()
        .from("sessions")
        .select("id, session_date, title, status, total_due, rounding_diff, session_participants(count)")
        .order("session_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    getTemplates(),
  ]);
  const today = todayVN();
  const todayWd = new Date(`${today}T00:00:00Z`).getUTCDay();
  const sortedTemplates = [...templates].sort((a, b) => {
    const da = a.weekday === null ? 7 : (todayWd - a.weekday + 7) % 7;
    const dbb = b.weekday === null ? 7 : (todayWd - b.weekday + 7) % 7;
    return da - dbb || a.name.localeCompare(b.name, "vi");
  });
  return (
    <>
      <h1>Buổi</h1>
      <div className="card">
        <div className="hstack">
          <h2 style={{ margin: 0 }}>Tạo buổi mới</h2>
          <span className="spacer" />
          <Link href="/admin/buoi/mau" className="small">
            Quản lý mẫu ({templates.length})
          </Link>
        </div>
        {sortedTemplates.length > 0 ? (
          <div className="hstack" style={{ marginTop: 10, flexWrap: "wrap" }}>
            {sortedTemplates.map((t, i) => (
              <form key={t.id} action={createSessionAction}>
                <input type="hidden" name="from" value={`template:${t.id}`} />
                <button type="submit" className={i === 0 ? "primary" : undefined}>
                  + {t.name}
                  {t.weekday !== null && (
                    <span className="small" style={{ opacity: 0.8 }}>
                      {" "}
                      · {formatShortDate(lastWeekdayOnOrBefore(today, t.weekday))}
                    </span>
                  )}
                </button>
              </form>
            ))}
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 8 }}>
            Chưa có mẫu. Tạo một buổi, nhập đủ người và tiền, rồi bấm <strong>Lưu thành mẫu</strong> ở cuối trang buổi.
          </p>
        )}
        <div className="hstack" style={{ marginTop: 10 }}>
          <form action={createSessionAction}>
            <input type="hidden" name="from" value="previous" />
            <button type="submit" className={sortedTemplates.length ? undefined : "primary"}>
              Giống buổi trước
            </button>
          </form>
          <form action={createSessionAction}>
            <button type="submit">Buổi trống</button>
          </form>
        </div>
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
