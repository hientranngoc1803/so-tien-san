export function formatNumber(n: number): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.round(Math.abs(n));
  return sign + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function vnd(n: number): string {
  return `${formatNumber(n)} đ`;
}

export function signedVnd(n: number): string {
  if (n > 0) return `+${vnd(n)}`;
  return vnd(n);
}

export function parseAmount(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? Math.round(input) : null;
  const raw = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;
  let negative = false;
  let s = raw;
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = true;
    s = s.slice(1);
  }
  let multiplier = 1;
  if (s.endsWith("k")) {
    multiplier = 1000;
    s = s.slice(0, -1);
  } else if (s.endsWith("đ")) {
    s = s.slice(0, -1);
  }
  if (multiplier === 1000) s = s.replace(",", ".");
  else s = s.replace(/[.,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const value = Math.round(parseFloat(s) * multiplier);
  return negative ? -value : value;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatShortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

export function todayVN(): string {
  const now = new Date(Date.now() + 7 * 3600 * 1000);
  return now.toISOString().slice(0, 10);
}

export function lastWeekdayOnOrBefore(isoDate: string, weekday: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const back = (d.getUTCDay() - weekday + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}
