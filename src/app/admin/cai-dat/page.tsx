import { getPaymentSettings } from "@/lib/settings";
import { saveBankInfoAction } from "../actions";
import QrUpload from "@/components/QrUpload";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string }> }) {
  const sp = await searchParams;
  const s = await getPaymentSettings();
  return (
    <>
      <h1>Cài đặt thanh toán</h1>
      {sp.ok && <div className="alert ok">Đã lưu.</div>}
      <div className="card stack">
        <h2>Mã QR nhận tiền</h2>
        <p className="muted small">Ảnh này hiện trên phiếu thanh toán trong sổ của từng người. PNG, JPG hoặc WebP, dưới 1,4 MB.</p>
        {s.hasQr ? (
          <img src={`/api/qr?v=${s.qrVersion}`} alt="Mã QR nhận tiền" style={{ width: 240, maxWidth: "100%", borderRadius: 8 }} />
        ) : (
          <p className="muted">Chưa có ảnh QR.</p>
        )}
        <QrUpload hasQr={s.hasQr} />
      </div>
      <div className="card">
        <h2>Thông tin chuyển khoản</h2>
        <form action={saveBankInfoAction} className="stack">
          <label>
            Hiện dưới mã QR (VD: ngân hàng, số tài khoản, tên chủ tài khoản)
            <textarea name="bankInfo" defaultValue={s.bankInfo ?? ""} maxLength={300} />
          </label>
          <div>
            <button type="submit" className="primary">
              Lưu
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
