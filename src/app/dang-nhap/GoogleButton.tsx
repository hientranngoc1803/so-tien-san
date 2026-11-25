"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export default function GoogleButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const sb = createBrowserClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        );
        const { error } = await sb.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${window.location.origin}/auth/callback?next=/admin` },
        });
        if (error) setBusy(false);
      }}
    >
      {busy ? "Đang chuyển tới Google…" : "Đăng nhập bằng Google"}
    </button>
  );
}
