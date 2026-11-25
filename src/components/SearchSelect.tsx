"use client";

import { useEffect, useId, useRef, useState } from "react";
import { normalizeName } from "@/lib/names";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export default function SearchSelect({
  options,
  value,
  defaultValue,
  onChange,
  placeholder = "— Chọn —",
  emptyLabel,
  name,
  ariaLabel,
  disabled,
}: {
  options: SelectOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
  name?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [inner, setInner] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const current = value ?? inner;

  const all: SelectOption[] = emptyLabel !== undefined ? [{ value: "", label: emptyLabel }, ...options] : options;
  const selected = all.find((o) => o.value === current);
  const nq = normalizeName(query);
  const list = nq ? all.filter((o) => normalizeName(`${o.label} ${o.hint ?? ""}`).includes(nq)) : all;

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const pick = (o: SelectOption) => {
    if (value === undefined) setInner(o.value);
    onChange?.(o.value);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setActive((a) => Math.min(a + 1, list.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      if (open && list[active]) {
        e.preventDefault();
        pick(list[active]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
  };

  return (
    <div className="ss">
      {name && <input type="hidden" name={name} value={current} />}
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        value={open ? query : selected?.label ?? ""}
        placeholder={open ? selected?.label ?? "Gõ để tìm…" : placeholder}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActive(Math.max(0, all.findIndex((o) => o.value === current)));
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <span className="ss-caret" aria-hidden>
        ▾
      </span>
      {open && (
        <ul className="ss-list" role="listbox" id={listId} ref={listRef}>
          {list.length === 0 && <li className="ss-empty">Không tìm thấy</li>}
          {list.map((o, i) => (
            <li
              key={o.value || "__empty"}
              role="option"
              aria-selected={o.value === current}
              className={`${i === active ? "active" : ""} ${o.value === current ? "selected" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={(e) => {
                e.preventDefault();
                pick(o);
              }}
            >
              <span>{o.label}</span>
              {o.hint && <span className="muted small">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
