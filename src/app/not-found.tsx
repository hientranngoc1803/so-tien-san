import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container" style={{ maxWidth: 480 }}>
      <div className="card">
        <h1>Không tìm thấy</h1>
        <p className="muted">Trang này không tồn tại hoặc buổi chưa được chốt.</p>
        <Link href="/?chon=1">← Về trang chọn tên</Link>
      </div>
    </main>
  );
}
