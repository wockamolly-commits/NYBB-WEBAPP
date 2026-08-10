import "server-only";

import { z } from "zod";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";

const branchSchema = z.object({ short_name: z.string().min(1) });

/** A readable branch label for the staff profile page. */
export async function getStaffBranchLabel(branchId: string | null): Promise<string> {
  if (!branchId) return "All branches";

  const supabase = await createReadOnlyStaffClient();
  const { data, error } = await supabase
    .from("branches")
    .select("short_name")
    .eq("id", branchId)
    .maybeSingle();

  if (error) {
    console.error("[staff-profile] branch lookup failed:", error.message);
    return "Assigned branch";
  }

  const parsed = branchSchema.safeParse(data);
  return parsed.success ? parsed.data.short_name : "Assigned branch";
}
