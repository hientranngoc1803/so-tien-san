"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SearchSelect from "./SearchSelect";

export const STORAGE_KEY = "sts:player";

export default function PlayerPicker({
  options,
  forcePick,
}: {
  options: { code: string; label: string }[];
  forcePick: boolean;
}) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(!forcePick);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && options.some((o) => o.code === saved)) {
      if (!forcePick) {
        router.replace(`/so/${saved}`);
        return;
      }
      setCode(saved);
    }
    setChecking(false);
  }, [forcePick, options, router]);

  if (checking) return <p className="muted">Đang mở sổ…</p>;

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!code) return;
        window.localStorage.setItem(STORAGE_KEY, code);
        router.push(`/so/${code}`);
      }}
    >
      <SearchSelect
        options={options.map((o) => ({ value: o.code, label: o.label }))}
        value={code}
        onChange={setCode}
        placeholder="— Gõ hoặc chọn tên —"
        ariaLabel="Tên của bạn"
      />
      <button className="primary" type="submit" disabled={!code}>
        Xem sổ của tôi
      </button>
    </form>
  );
}

export function RememberPlayer({ code }: { code: string }) {
  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, code);
  }, [code]);
  return null;
}
