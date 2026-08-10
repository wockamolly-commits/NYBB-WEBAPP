import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeStaffNextPath } from "@/lib/auth/redirect";

export const metadata: Metadata = {
  title: "Staff sign in",
  description: "Secure access to the NYBB pickup workspace.",
  robots: { index: false, follow: false },
};

export default async function StaffLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  redirect(`/login?next=${encodeURIComponent(safeStaffNextPath(next))}`);
}
