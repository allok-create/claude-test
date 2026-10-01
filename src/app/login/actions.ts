"use server";

import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth/session";
import { authenticate } from "@/lib/services/users";
import { str, type ActionState } from "@/lib/action";

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = str(formData, "username");
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return { error: "請輸入帳號與密碼" };
  const userId = authenticate(username, password);
  if (!userId) return { error: "帳號或密碼錯誤，或帳號已停用" };
  await createSession(userId);
  const next = str(formData, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
