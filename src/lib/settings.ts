import "server-only";
import { db } from "./supabase";

export const QR_KEY = "qr_image";
export const BANK_KEY = "bank_info";
export const QR_MAX_BYTES = 1_400_000;
export const QR_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+=*)$/;

export interface PaymentSettings {
  hasQr: boolean;
  qrVersion: string | null;
  bankInfo: string | null;
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const { data } = await db().from("settings").select("key, value, updated_at").in("key", [QR_KEY, BANK_KEY]);
  const qr = data?.find((r) => r.key === QR_KEY);
  const bank = data?.find((r) => r.key === BANK_KEY);
  return {
    hasQr: Boolean(qr?.value),
    qrVersion: qr?.updated_at ? String(new Date(qr.updated_at).getTime()) : null,
    bankInfo: bank?.value ?? null,
  };
}

export async function getQrImage(): Promise<{ mime: string; bytes: Buffer } | null> {
  const { data } = await db().from("settings").select("value").eq("key", QR_KEY).maybeSingle();
  const m = data?.value ? QR_DATA_URL.exec(data.value) : null;
  if (!m) return null;
  return { mime: m[1], bytes: Buffer.from(m[2], "base64") };
}
