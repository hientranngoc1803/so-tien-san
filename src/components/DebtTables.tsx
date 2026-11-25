"use client";

import { useState } from "react";
import Link from "next/link";
import { vnd } from "@/lib/money";
import { normalizeName } from "@/lib/names";

export interface DebtRow {
  id: string;
  code: string;
  name: string;
  balance: number;
  openDates: string;
}

export default function DebtTables({ debtors, savers }: { debtors: DebtRow[]; savers: DebtRow[] }) {
  const [q, setQ] = useState("");
  const nq = normalizeName(q);
  const match = (r: DebtRow) => !nq || normalizeName(r.name).includes(nq) || r.code.toLowerCase().includes(nq);
  const d = debtors.filter(match);
  const s = savers.filter(match);
  return (
    <>
      <input type="search" placeholder="Tìm tên hoặc mã…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 16 }} />
      <div className="card">
        <h2>Người cần thu</h2>
        {d.length === 0 && <p className="muted">{debtors.length === 0 ? "Không ai nợ." : "Không có kết quả."}</p>}
        <div className="table-wrap">
          <table>
            {d.length > 0 && (
              <thead>
                <tr>
                  <th>Người</th>
                  <th className="num">Còn phải trả</th>
                  <th>Ngày chưa thanh toán</th>
                  <th></th>
                </tr>
              </thead>
            )}
            <tbody>
              {d.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/so/${r.code}`}>{r.name}</Link> <span className="muted small">{r.code}</span>
                  </td>
                  <td className="num debt">{vnd(-r.balance)}</td>
                  <td className="small">{r.openDates}</td>
                  <td className="right">
                    <div className="hstack" style={{ justifyContent: "flex-end" }}>
                      <Link className="btn" href={`/so/${r.code}#thanh-toan`}>
                        Phiếu QR
                      </Link>
                      <Link className="btn" href={`/admin/giao-dich/moi?player=${r.id}&amount=${-r.balance}`}>
                        Ghi nhận tiền
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Người đang dư quỹ</h2>
        {s.length === 0 && <p className="muted">{savers.length === 0 ? "Chưa ai nộp trước." : "Không có kết quả."}</p>}
        <div className="table-wrap">
          <table>
            <tbody>
              {s.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/so/${r.code}`}>{r.name}</Link> <span className="muted small">{r.code}</span>
                  </td>
                  <td className="num credit">{vnd(r.balance)}</td>
                  <td className="right">
                    <Link className="btn" href={`/admin/giao-dich/moi?player=${r.id}&mode=refund`}>
                      Hoàn tiền
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
