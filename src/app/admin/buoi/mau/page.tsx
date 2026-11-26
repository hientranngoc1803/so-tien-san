import Link from "next/link";
import { getPlayers, getTemplates } from "@/lib/data";
import { vnd } from "@/lib/money";
import { WEEKDAYS } from "@/lib/types";
import { createSessionAction, deleteTemplateAction, updateTemplateMetaAction } from "../../actions";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ loi?: string }> }) {
  const sp = await searchParams;
  const [templates, players] = await Promise.all([getTemplates(), getPlayers()]);
  const byId = new Map(players.map((p) => [p.id, p]));

  return (
    <>
      <div className="hstack" style={{ marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Mẫu buổi</h1>
        <span className="spacer" />
        <Link href="/admin/buoi">← Danh sách buổi</Link>
      </div>
      {sp.loi === "du-lieu" && <div className="alert error">Tên hoặc thứ không hợp lệ.</div>}
      <div className="alert warn">
        Sửa danh sách người hoặc số tiền của mẫu: bấm <strong>Tạo buổi</strong> từ mẫu, chỉnh lại, rồi ở cuối trang buổi chọn{" "}
        <strong>Lưu thành mẫu → Ghi đè</strong>. Xoá buổi nháp nếu chỉ muốn sửa mẫu.
      </div>
      {templates.length === 0 && (
        <p className="muted">
          Chưa có mẫu. Mở một buổi nháp, nhập đủ người và tiền, rồi bấm <strong>Lưu thành mẫu</strong> ở cuối trang.
        </p>
      )}
      {templates.map((t) => {
        const people = t.player_ids
          .map((id) => byId.get(id))
          .filter((p) => p && p.is_active)
          .map((p) => p!.display_name)
          .sort((a, b) => a.localeCompare(b, "vi"));
        return (
          <div key={t.id} className="card stack">
            <form action={updateTemplateMetaAction} className="row">
              <input type="hidden" name="id" value={t.id} />
              <label>
                Tên mẫu
                <input type="text" name="name" defaultValue={t.name} required maxLength={80} />
              </label>
              <label style={{ flex: "0 1 160px" }}>
                Thứ chơi
                <select name="weekday" defaultValue={t.weekday === null ? "" : String(t.weekday)}>
                  <option value="">Không cố định</option>
                  {WEEKDAYS.map((w, i) => (
                    <option key={i} value={i}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" style={{ flex: "0 0 auto" }}>
                Lưu
              </button>
            </form>
            <div className="small">
              <strong>{people.length} người:</strong> <span className="muted">{people.join(", ") || "—"}</span>
            </div>
            <div className="small">
              <strong>Chi phí chung:</strong>{" "}
              <span className="muted">
                {t.items.length
                  ? t.items
                      .map((i) => `${i.label} ${i.amount ? vnd(i.amount) : "(nhập khi tạo buổi)"}${i.paidBy ? ` – ${byId.get(i.paidBy)?.display_name ?? "?"} trả` : ""}`)
                      .join(" · ")
                  : "—"}
              </span>
            </div>
            <div className="small">
              <strong>Phí nữ:</strong>{" "}
              <span className="muted">
                {t.female_mode === "discount"
                  ? t.female_value
                    ? `giảm ${vnd(t.female_value)} so với nam`
                    : "bằng nam"
                  : `cố định ${vnd(t.female_value)}`}
              </span>
            </div>
            <div className="hstack">
              <form action={createSessionAction}>
                <input type="hidden" name="from" value={`template:${t.id}`} />
                <button type="submit" className="primary">
                  Tạo buổi từ mẫu này
                </button>
              </form>
              <span className="spacer" />
              <details>
                <summary className="small" style={{ color: "var(--err)" }}>
                  Xoá mẫu
                </summary>
                <form action={deleteTemplateAction} className="hstack" style={{ marginTop: 4 }}>
                  <input type="hidden" name="id" value={t.id} />
                  <span className="muted small">Các buổi đã tạo từ mẫu không bị ảnh hưởng.</span>
                  <button type="submit" className="danger small">
                    Xác nhận xoá
                  </button>
                </form>
              </details>
            </div>
          </div>
        );
      })}
    </>
  );
}
