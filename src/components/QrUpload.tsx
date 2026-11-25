"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeQrAction, saveQrAction } from "@/app/admin/actions";

export default function QrUpload({ hasQr }: { hasQr: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const onFile = (file: File | undefined) => {
    setError("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError("Chỉ nhận ảnh PNG, JPG hoặc WebP.");
      return;
    }
    if (file.size > 1_400_000) {
      setError("Ảnh cần nhỏ hơn 1,4 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      const res = await saveQrAction(String(reader.result));
      setBusy(false);
      if (!res.ok) setError(res.error ?? "Không lưu được ảnh.");
      else router.refresh();
    };
    reader.onerror = () => setError("Không đọc được ảnh.");
    reader.readAsDataURL(file);
  };

  return (
    <div className="stack">
      <label>
        {hasQr ? "Thay ảnh QR" : "Tải ảnh QR"}
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {hasQr && (
        <div>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await removeQrAction();
              setBusy(false);
              router.refresh();
            }}
          >
            Xoá ảnh QR
          </button>
        </div>
      )}
      {error && <div className="alert error">{error}</div>}
    </div>
  );
}
