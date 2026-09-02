import "server-only";

import { cache } from "react";
import { z } from "zod";
import { createReadOnlyStaffClient } from "@/lib/supabase/server";

const branchSchema = z.object({ short_name: z.string().min(1) });

/**
 * A readable branch label for the staff profile page and the workspace header.
 *
 * Cached per request: the header renders this on every workspace page, and the
 * profile page asks for it again below the header, which without this would be
 * two round trips for one row that cannot have changed between them. A
 * business wide profile answers without asking the database at all.
 */
export const getStaffBranchLabel = cache(async (branchId: string | null): Promise<string> => {
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
});
