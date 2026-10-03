import { AuthPage } from "@/components/auth-page";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create account | Analytiq" };
export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/");
  return <AuthPage mode="signup" />;
}
