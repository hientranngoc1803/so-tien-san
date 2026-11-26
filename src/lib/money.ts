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

const WD_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const WD_LONG = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export function weekdayOf(iso: string): number {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).getUTCDay();
}

export function weekdayName(iso: string): string {
  return WD_LONG[weekdayOf(iso)];
}

export function formatDateWd(iso: string): string {
  return `${weekdayName(iso)}, ${formatDate(iso)}`;
}

export function formatShortDateWd(iso: string): string {
  return `${WD_SHORT[weekdayOf(iso)]} ${formatShortDate(iso)}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isoOf(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export interface DateInTitle {
  iso: string;
  stripped: string;
}

export function findDateInTitle(title: string, sessionDate: string): DateInTitle | null {
  const re = /(^|[^\d])(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{4}|\d{2}))?(?!\d)/g;
  const base = new Date(`${sessionDate.slice(0, 10)}T00:00:00Z`).getTime();
  let m: RegExpExecArray | null;
  let iso: string | null = null;
  while ((m = re.exec(title)) !== null) {
    const day = Number(m[2]);
    const month = Number(m[3]);
    if (m[4]) {
      const y = m[4].length === 2 ? 2000 + Number(m[4]) : Number(m[4]);
      iso = isoOf(y, month, day);
    } else {
      const y0 = Number(sessionDate.slice(0, 4));
      const candidates = [y0 - 1, y0, y0 + 1]
        .map((y) => isoOf(y, month, day))
        .filter((x): x is string => x !== null)
        .sort((a, b) => Math.abs(Date.parse(a) - base) - Math.abs(Date.parse(b) - base));
      iso = candidates[0] ?? null;
    }
    if (iso) break;
    re.lastIndex = m.index + m[1].length + 1;
  }
  if (!iso || !m) return null;
  const without = title.slice(0, m.index + m[1].length) + title.slice(m.index + m[0].length);
  const stripped = without
    .replace(/(^|[\s\-–·,:|(])(?:thứ|thu|t)\s*[2-7](?=$|[\s\-–·,:|)])/giu, "$1")
    .replace(/(^|[\s\-–·,:|(])(?:chủ nhật|chu nhat|cn)(?=$|[\s\-–·,:|)])/giu, "$1")
    .replace(/\(\s*\)/g, "")
    .replace(/\s*([\-–·,:|])\s*(?:[\-–·,:|]\s*)+/g, " $1 ")
    .replace(/^[\s\-–·,:|]+|[\s\-–·,:|]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return { iso, stripped };
}
