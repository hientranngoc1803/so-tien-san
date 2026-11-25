import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import ThemeMenu from "@/components/ThemeMenu";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return (
    <div className="container">
      <div className="topbar">
        <Link href="/admin" className="brand">
          🏸 Quản lý sổ tiền sân
        </Link>
        <nav className="nav">
          <Link href="/admin">Tổng quan</Link>
          <Link href="/admin/buoi">Buổi</Link>
          <Link href="/admin/giao-dich">Giao dịch</Link>
          <Link href="/admin/nguoi-choi">Người chơi</Link>
          <Link href="/admin/chu-san">Chủ sân</Link>
          <Link href="/admin/cai-dat">Cài đặt</Link>
          <Link href="/">Trang người chơi</Link>
          <ThemeMenu />
        </nav>
      </div>
      {children}
      <div className="hstack muted small" style={{ marginTop: 24 }}>
        <span>Đăng nhập: {admin.email}</span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="link small">
            Đăng xuất
          </button>
        </form>
      </div>
    </div>
  );
}
