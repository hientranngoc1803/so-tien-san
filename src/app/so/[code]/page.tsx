import Link from "next/link";
import { notFound } from "next/navigation";
import { loadLedger } from "@/lib/data";
import { headline } from "@/lib/ledger";
import { formatShortDate, signedVnd, vnd } from "@/lib/money";
import StatusBadge from "@/components/Status";
import { RememberPlayer } from "@/components/PlayerPicker";
import PaymentCard from "@/components/PaymentCard";
import ThemeMenu from "@/components/ThemeMenu";
import { getPaymentSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

function formatStamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} ${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export default async function MyBook({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [ledger, paySettings] = await Promise.all([loadLedger(), getPaymentSettings()]);
  const player = ledger.players.find((p) => p.short_code.toUpperCase() === code.toUpperCase());
  if (!player) notFound();
  const book = ledger.books.get(player.id)!;
  const h = headline(book.balance);
  const sessionById = new Map(ledger.sessions.map((s) => [s.id, s]));

  return (
    <main className="container" style={{ maxWidth: 720 }}>
      <RememberPlayer code={player.short_code} />
      <div className="topbar">
        <Link href="/?chon=1" className="brand">
          🏸 Sổ tiền sân
        </Link>
        <div className="hstack">
          <Link href="/?chon=1" className="small">
            Đổi người
          </Link>
          <ThemeMenu />
        </div>
      </div>

      <div className="card">
        <div className="muted small">
          {player.display_name} · {player.short_code}
          {player.is_court_owner ? " · Chủ sân" : ""}
        </div>
        <div className="muted" style={{ marginTop: 8 }}>
          {h.label}
        </div>
        <div className={`big-number ${h.tone === "credit" ? "credit" : h.tone === "debt" ? "debt" : ""}`}>
          {h.tone === "even" ? "0 đ" : vnd(Math.abs(book.balance))}
        </div>
        <div className="muted small">Cập nhật {formatStamp(ledger.lastUpdated)}</div>
        {book.fundDeposits > 0 && <div className="muted small">Tổng đã đóng quỹ: {vnd(book.fundDeposits)}</div>}
      </div>

      {book.balance < 0 && (
        <PaymentCard
          name={player.display_name}
          code={player.short_code}
          owed={-book.balance}
          openDebits={book.openDebits}
          settings={paySettings}
        />
      )}

      <div className="card">
        <h2>Buổi đã chơi</h2>
        {book.sessionLines.length === 0 && <p className="muted">Chưa có buổi nào.</p>}
        {book.sessionLines.map((line) => {
          const s = sessionById.get(line.sessionId);
          return (
            <details key={line.sessionId} className="line-item" style={{ display: "block" }}>
              <summary>
                <div className="hstack">
                  <strong>{formatShortDate(line.date)}</strong>
                  <span className="muted">{line.title ?? ""}</span>
                  <span className="spacer" />
                  <span className="num">{vnd(line.amount)}</span>
                  <StatusBadge status={line.status} />
                </div>
                {line.status !== "owner" && line.amount > 0 && (
                  <div className="muted small">
                    Đã bù {vnd(line.covered)} · Còn thiếu {vnd(line.remaining)}
                  </div>
                )}
              </summary>
              <div className="small" style={{ marginTop: 8 }}>
                {line.parts.map((p, i) => (
                  <div key={i} className="hstack">
                    <span>{p.label}</span>
                    <span className="spacer" />
                    <span className="num">{vnd(p.amount)}</span>
                  </div>
                ))}
                {line.coveredBy.length > 0 && (
                  <div className="muted" style={{ marginTop: 6 }}>
                    Bù bởi: {line.coveredBy.map((c) => `${c.label} ${vnd(c.amount)}`).join(" · ")}
                  </div>
                )}
                {s && s.explanation.length > 0 && (
                  <div className="muted" style={{ marginTop: 6 }}>
                    {s.explanation.join(" ")}
                  </div>
                )}
                <div style={{ marginTop: 6 }}>
                  <Link href={`/buoi/${line.sessionId}`}>Chi tiết buổi →</Link>
                </div>
              </div>
            </details>
          );
        })}
      </div>

      <div className="card">
        <h2>Giao dịch của tôi</h2>
        {book.txnLines.length === 0 && <p className="muted">Chưa có giao dịch.</p>}
        {book.txnLines.map((t) => (
          <div key={`${t.txn.id}-${t.role}`} className="line-item" style={{ display: "block" }}>
            <div className="hstack">
              <strong>{formatShortDate(t.txn.date)}</strong>
              <span>{t.label}</span>
              <span className="spacer" />
              <span className={`num ${t.effect > 0 ? "credit" : "debt"}`}>{signedVnd(t.effect)}</span>
            </div>
            {t.txn.publicNote && <div className="small">{t.txn.publicNote}</div>}
            {t.allocations.length > 0 && (
              <div className="muted small">
                Đã bù: {t.allocations.map((a) => `${a.date ? formatShortDate(a.date) : ""} ${a.label} ${vnd(a.amount)}`.trim()).join(" · ")}
              </div>
            )}
            <div className="muted small">Số dư sau giao dịch: {signedVnd(t.balanceAfter)}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
