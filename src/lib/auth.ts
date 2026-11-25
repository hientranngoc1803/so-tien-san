import "server-only";
import { redirect } from "next/navigation";
import { authClient, db } from "./supabase";

export interface Admin {
  email: string;
}

export async function getSignedInEmail(): Promise<string | null> {
  const sb = await authClient();
  const { data } = await sb.auth.getUser();
  return data.user?.email?.toLowerCase() ?? null;
}

export async function getAdmin(): Promise<Admin | null> {
  const email = await getSignedInEmail();
  if (!email) return null;
  const { data } = await db().from("admins").select("email").eq("email", email).maybeSingle();
  return data ? { email } : null;
}

export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin();
  if (!admin) redirect("/dang-nhap");
  return admin;
}
