import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdmin, getSignedInEmail } from "@/lib/auth";
import GoogleButton from "./GoogleButton";
import ThemeMenu from "@/components/ThemeMenu";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ loi?: string }> }) {
  const sp = await searchParams;
  const admin = await getAdmin();
  if (admin) redirect("/admin");
  const email = await getSignedInEmail();
  return (
    <main className="container" style={{ maxWidth: 440 }}>
      <div className="topbar">
        <Link href="/" className="brand">
          🏸 Sổ tiền sân
        </Link>
        <ThemeMenu />
      </div>
      <div className="card stack">
        <h1>Đăng nhập quản lý</h1>
        {sp.loi && <div className="alert error">Đăng nhập không thành công, thử lại nhé.</div>}
        {email ? (
          <>
            <div className="alert warn">
              Tài khoản <strong>{email}</strong> chưa có quyền quản lý. Nhờ quản lý hiện tại thêm email này.
            </div>
            <form action="/auth/signout" method="post">
              <button type="submit">Đăng xuất</button>
            </form>
          </>
        ) : (
          <GoogleButton />
        )}
      </div>
    </main>
  );
}
