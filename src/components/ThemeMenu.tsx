"use client";

import { useEffect, useRef, useState } from "react";

type Theme = "system" | "light" | "dark";
type Font = "md" | "lg" | "xl";

const THEMES: { value: Theme; label: string }[] = [
  { value: "system", label: "Theo máy" },
  { value: "light", label: "Sáng" },
  { value: "dark", label: "Tối" },
];

const FONTS: { value: Font; label: string }[] = [
  { value: "md", label: "Vừa" },
  { value: "lg", label: "Lớn" },
  { value: "xl", label: "Rất lớn" },
];

function apply(theme: Theme, font: Font) {
  const d = document.documentElement;
  if (theme === "system") delete d.dataset.theme;
  else d.dataset.theme = theme;
  if (font === "md") delete d.dataset.font;
  else d.dataset.font = font;
  try {
    localStorage.setItem("sts:theme", theme);
    localStorage.setItem("sts:font", font);
  } catch {}
}

export default function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [font, setFont] = useState<Font>("md");
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const t = localStorage.getItem("sts:theme") as Theme | null;
      const f = localStorage.getItem("sts:font") as Font | null;
      if (t && THEMES.some((x) => x.value === t)) setTheme(t);
      if (f && FONTS.some((x) => x.value === f)) setFont(f);
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) apply(theme, font);
  }, [loaded, theme, font]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="theme-menu" ref={ref}>
      <button type="button" className="small" aria-expanded={open} title="Giao diện" onClick={() => setOpen(!open)}>
        Aa
      </button>
      {open && (
        <div className="theme-pop" role="dialog" aria-label="Giao diện">
          <div className="muted small">Màu</div>
          <div className="seg">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                className={theme === t.value ? "on" : ""}
                onClick={() => setTheme(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="muted small">Cỡ chữ</div>
          <div className="seg">
            {FONTS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={font === f.value ? "on" : ""}
                onClick={() => setFont(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
