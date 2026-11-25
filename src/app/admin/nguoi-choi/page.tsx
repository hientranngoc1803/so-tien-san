import Link from "next/link";
import { db } from "@/lib/supabase";
import { getPlayers } from "@/lib/data";
import { addAdminAction, deletePlayerAction, removeAdminAction, setCourtOwnerAction, updatePlayerAction } from "../actions";
import AddPlayerForm from "@/components/AddPlayerForm";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  "du-lieu": "Tên hoặc nhóm tính phí không hợp lệ.",
  email: "Email không hợp lệ.",
  "tu-xoa": "Không thể tự xoá quyền của chính mình.",
  "co-lich-su": "Không xoá được: hồ sơ đã có buổi, giao dịch hoặc đang là chủ sân. Hãy chuyển sang “Đã nghỉ”.",
};

export default async function PlayersPage({ searchParams }: { searchParams: Promise<{ loi?: string }> }) {
  const sp = await searchParams;
  const players = await getPlayers();
  const { data: admins } = await db().from("admins").select("email").order("email");
  const sorted = [...players].sort((a, b) => Number(b.is_active) - Number(a.is_active) || a.display_name.localeCompare(b.display_name, "vi"));

  return (
    <>
      <h1>Người chơi</h1>
      {sp.loi && ERRORS[sp.loi] && <div className="alert error">{ERRORS[sp.loi]}</div>}
      <div className="card">
        <h2>Thêm người</h2>
        <AddPlayerForm />
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên hiển thị</th>
              <th>Nhóm</th>
              <th>Hoạt động</th>
              <th></th>
              <th>Chủ sân</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} style={p.is_active ? undefined : { opacity: 0.6 }}>
                <td>
                  <Link href={`/so/${p.short_code}`}>{p.short_code}</Link>
                </td>
                <td colSpan={4}>
                  <form action={updatePlayerAction} className="hstack">
                    <input type="hidden" name="id" value={p.id} />
                    <input type="text" name="name" defaultValue={p.display_name} style={{ maxWidth: 200 }} />
                    <select name="gender" defaultValue={p.gender} style={{ maxWidth: 90 }}>
                      <option value="M">Nam</option>
                      <option value="F">Nữ</option>
                    </select>
                    <select name="active" defaultValue={p.is_active ? "1" : "0"} style={{ maxWidth: 120 }}>
                      <option value="1">Đang chơi</option>
                      <option value="0">Đã nghỉ</option>
                    </select>
                    <button type="submit">Lưu</button>
                  </form>
                  {!p.is_court_owner && (
                    <details style={{ marginTop: 4 }}>
                      <summary className="small" style={{ color: "var(--err)" }}>
                        Xoá hồ sơ tạo nhầm
                      </summary>
                      <form action={deletePlayerAction} className="hstack" style={{ marginTop: 4 }}>
                        <input type="hidden" name="id" value={p.id} />
                        <span className="muted small">Chỉ xoá được khi hồ sơ chưa có lịch sử.</span>
                        <button type="submit" className="danger small">
                          Xác nhận xoá
                        </button>
                      </form>
                    </details>
                  )}
                </td>
                <td>
                  {p.is_court_owner ? (
                    <span className="badge paid">Chủ sân</span>
                  ) : (
                    <form action={setCourtOwnerAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="link small">
                        Gắn làm chủ sân
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Quản lý (đăng nhập Google)</h2>
        {(admins ?? []).map((a) => (
          <div key={a.email} className="hstack line-item">
            <span>{a.email}</span>
            <span className="spacer" />
            <form action={removeAdminAction}>
              <input type="hidden" name="email" value={a.email} />
              <button type="submit" className="link danger small">
                Bỏ quyền
              </button>
            </form>
          </div>
        ))}
        <form action={addAdminAction} className="row" style={{ marginTop: 10 }}>
          <label>
            Thêm email Google
            <input type="email" name="email" required placeholder="ten@gmail.com" />
          </label>
          <button type="submit" style={{ flex: "0 0 auto" }}>
            Thêm quản lý
          </button>
        </form>
      </div>
    </>
  );
}
