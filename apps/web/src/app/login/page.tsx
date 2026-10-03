import { AuthPage } from "@/components/auth-page";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in | Analytiq" };
export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return <AuthPage mode="login" />;
}
