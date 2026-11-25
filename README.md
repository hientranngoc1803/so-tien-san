# Sổ tiền sân

Web app quản lý tiền sân cho đội cầu lông: Next.js trên Vercel, dữ liệu trên Supabase. Cả hai đều dùng gói miễn phí.

## Deploy lần đầu

Làm theo thứ tự. Tổng thời gian khoảng 30 phút.

### Bước 1. Tạo project Supabase

1. Vào https://supabase.com, đăng nhập bằng GitHub và bấm **New project**.
   - Name: `so-tien-san`
   - Database password: tạo một mật khẩu mạnh và lưu lại.
   - Region: **Southeast Asia (Singapore)**
2. Đợi khoảng 2 phút cho project khởi tạo xong.
3. Vào **SQL Editor** → **New query**. Dán toàn bộ nội dung file `supabase/migrations/0001_init.sql`, bấm **Run**. Kết quả phải là `Success`.
4. Thêm email Google của quản lý đầu tiên. Vẫn trong SQL Editor, chạy:
   ```sql
   insert into admins (email) values ('email-cua-ban@gmail.com');
   ```
   Email phải viết thường. Các quản lý sau có thể thêm ngay trong app, ở mục **Người chơi**.
5. Vào **Project Settings → API Keys** và ghi lại 3 giá trị:
   - **Project URL**, dạng `https://abcdxyz.supabase.co`
   - **Publishable key** (hoặc `anon` key ở tab Legacy)
   - **Secret key** (hoặc `service_role` key ở tab Legacy). **Tuyệt đối không chia sẻ hay đưa key này vào code.**

### Bước 2. Bật đăng nhập Google

1. Vào https://console.cloud.google.com, tạo project mới, ví dụ `so-tien-san`.
2. Vào **APIs & Services → OAuth consent screen**:
   - User type: **External**
   - App name: `Sổ tiền sân`, điền support email của bạn.
   - Scopes: giữ mặc định (email, profile).
   - Có hai lựa chọn: thêm email các quản lý vào **Test users**, hoặc bấm **Publish app**. App chỉ dùng email và profile nên không cần Google xét duyệt.
3. Vào **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback` (thay `<project-ref>` bằng phần đầu trong Project URL ở bước 1)
   - Ghi lại **Client ID** và **Client secret**.
4. Quay lại Supabase → **Authentication → Sign In / Providers → Google** → bật **Enable**, dán Client ID và Client secret → **Save**.

### Bước 3. Đưa code lên GitHub

1. Tạo repo **Private** trên GitHub, ví dụ `so-tien-san`. Không tick tạo README.
2. Trên máy, trong thư mục project, chạy:
   ```bash
   git add .
   git commit -m "Sổ tiền sân: bản đầu"
   git branch -M main
   git remote add origin https://github.com/<tai-khoan>/so-tien-san.git
   git push -u origin main
   ```
   File `.env.local` và thư mục `import/` (chứa dữ liệu thật) đã có trong `.gitignore`, nên sẽ không bị đẩy lên.

### Bước 4. Deploy lên Vercel

1. Vào https://vercel.com và đăng nhập bằng GitHub. Chọn gói **Hobby** (miễn phí).
2. Bấm **Add New → Project**, chọn repo `so-tien-san` → **Import**.
3. Mở mục **Environment Variables** và thêm 4 biến:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL ở bước 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable / anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Secret / service_role key |
   | `CRON_SECRET` | Một chuỗi ngẫu nhiên dài, ví dụ tạo bằng https://1password.com/password-generator |

4. Bấm **Deploy** và đợi khoảng 2 phút. Bạn sẽ nhận được địa chỉ dạng `https://so-tien-san-xxxx.vercel.app`.

### Bước 5. Khai báo địa chỉ app cho Supabase

Vào Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://so-tien-san-xxxx.vercel.app`
- **Redirect URLs**, thêm hai dòng:
  - `https://so-tien-san-xxxx.vercel.app/auth/callback`
  - `http://localhost:3100/auth/callback` (để chạy thử trên máy)

### Bước 6. Kiểm tra

1. Mở `https://so-tien-san-xxxx.vercel.app/dang-nhap` → **Đăng nhập bằng Google** bằng email đã thêm ở bước 1.4.
2. Vào **Người chơi**: thêm vài người và bấm **Gắn làm chủ sân** cho chủ sân.
3. Vào **Cài đặt**: tải ảnh QR nhận tiền và nhập thông tin tài khoản.
4. Tạo thử một buổi, chốt, ghi tiền.
5. Gửi link trang chủ cho người chơi. Họ chỉ cần chọn tên là xem được sổ của mình.

Sao lưu tự chạy mỗi ngày lúc 3 giờ sáng giờ Việt Nam. File được lưu ở Supabase → **Storage → backups**.

## Chuyển dữ liệu từ Google Sheets (tuỳ chọn)

Chỉ làm khi muốn đưa số nợ/dư thật vào. Bản test có thể bỏ qua bước này và thêm người bằng tay.

1. Tạo file `.env.local` ở thư mục gốc project:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```
2. Tải file Sheets về dạng `.xlsx`, rồi chạy:
   ```bash
   npm run import:extract -- "duong-dan/TDTT - NCSK.xlsx" --cutoff 2026-11-24
   ```
   Lệnh này tạo hai file trong thư mục `import/`:
   - `names.csv`: các tên đang có nợ/dư hoặc đã chơi trong 60 ngày gần nhất.
     - Cột `action`: `member` (người chơi), `guest` (khách của ai đó, điền `host_name`) hoặc `skip`.
     - Cột `player_name`: tên hiển thị trong app. Nhiều nhãn có thể gộp về một tên, ví dụ `TTP` → `Phương`.
     - Cột `gender`: `M` hoặc `F`.
     - Những dòng có `review = 1` cần xem kỹ.
   - `opening.csv`: từng khoản nợ cũ (số âm) và tiền dư (số dương). Kiểm tra lại số tiền trước khi nhập.
3. Chạy thử, lệnh này không ghi gì vào database:
   ```bash
   npm run import:apply -- --cutoff 2026-11-24 --owner "Tạ Anh" --dry-run
   ```
4. Đối chiếu tổng nợ và tổng dư in ra với Sheets. Nếu khớp, chạy thật:
   ```bash
   npm run import:apply -- --cutoff 2026-11-24 --owner "Tạ Anh"
   ```
   Chạy lại nhiều lần không tạo khoản trùng.

## Chạy trên máy

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # test phần tính tiền
npm run build        # kiểm tra build trước khi push
```

## Cập nhật sau này

Mỗi lần `git push` lên nhánh `main`, Vercel tự build và deploy lại.

Khi có thay đổi database, file migration mới sẽ nằm trong `supabase/migrations/`. Chạy file đó trong SQL Editor của Supabase **trước khi** push code.
