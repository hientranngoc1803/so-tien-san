import type { OpenDebit } from "@/lib/ledger";
import { formatShortDate, vnd } from "@/lib/money";
import { toAscii } from "@/lib/names";
import type { PaymentSettings } from "@/lib/settings";
import CopyButton from "./CopyButton";

export function transferNote(name: string, code: string): string {
  return `${toAscii(name)} ${code} tien san`;
}

export default function PaymentCard({
  name,
  code,
  owed,
  openDebits,
  settings,
}: {
  name: string;
  code: string;
  owed: number;
  openDebits: OpenDebit[];
  settings: PaymentSettings;
}) {
  const note = transferNote(name, code);
  return (
    <div className="card" id="thanh-toan">
      <h2>Phiếu thanh toán</h2>
      <div className="stack">
        <div className="hstack">
          <span className="muted">Cần chuyển</span>
          <strong className="debt" style={{ fontSize: 20 }}>
            {vnd(owed)}
          </strong>
          <CopyButton text={String(owed)} label="Chép số tiền" />
        </div>
        <div className="hstack">
          <span className="muted">Nội dung</span>
          <code>{note}</code>
          <CopyButton text={note} label="Chép nội dung" />
        </div>
        {settings.hasQr && (
          <img
            src={`/api/qr?v=${settings.qrVersion}`}
            alt="Mã QR nhận tiền của chủ sân"
            style={{ width: 260, maxWidth: "100%", margin: "4px auto", display: "block", borderRadius: 8 }}
          />
        )}
        {settings.bankInfo && <div className="small" style={{ whiteSpace: "pre-wrap", textAlign: "center" }}>{settings.bankInfo}</div>}
        {!settings.hasQr && !settings.bankInfo && <div className="muted small">Quản lý chưa cài mã QR nhận tiền.</div>}
        {openDebits.length > 0 && (
          <div>
            <h3>Các khoản chưa thanh toán</h3>
            {openDebits.map((d) => (
              <div key={d.id} className="hstack line-item small">
                <span>{formatShortDate(d.date)}</span>
                <span>{d.label}</span>
                <span className="spacer" />
                <span className="num">
                  {d.remaining < d.amount ? `${vnd(d.remaining)} / ${vnd(d.amount)}` : vnd(d.remaining)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
