"use server";

import { revalidatePath, updateTag } from "next/cache";
import type { ContentActionState } from "@/lib/content/action-state";
import { siteContentTag } from "@/lib/content/read";
import {
  CONTENT_PAGE_INFO,
  CONTENT_SCHEMAS,
  fieldErrors,
  isContentPage,
  type ContentPage,
} from "@/lib/content/schema";
import { getStaffProfile, hasStaffPermission } from "@/lib/staff/session";
import { createStaffClient } from "@/lib/supabase/server";

/**
 * The writes behind /workspace/content.
 *
 * Checked here so a person without content:manage gets a sentence rather than
 * a failed request, and checked again inside every RPC (0108), which is the
 * check that matters: no staff session holds any grant on the content tables.
 *
 * Every body is parsed against its page's schema on the server before it is
 * sent, so the database only ever stores a body the public page can render.
 * The schema is the same one the public read parses with, so a body that
 * saves is a body that shows.
 */

const DENIED = "You do not have access to edit the website's content.";

function errorFor(code: string | undefined, message: string | undefined): string {
  if (code === "PGRST202" || message?.includes("Could not find the function")) {
    return "Website content is not set up on this database yet. Migration 0108 needs to be applied first.";
  }
  if (message?.includes("FORBIDDEN")) return DENIED;
  if (message?.includes("UNKNOWN_PAGE")) return "That page cannot be edited here. Reload and try again.";
  if (message?.includes("TOO_LARGE")) return "This page is too long to save. Shorten it and try again.";
  return "That did not save just now. Please try again.";
}

async function allowed(): Promise<boolean> {
  const profile = await getStaffProfile();
  return Boolean(profile && hasStaffPermission(profile, "content:manage"));
}

function validate(
  page: string,
  body: unknown,
): { ok: true; page: ContentPage; body: unknown } | { ok: false; state: ContentActionState } {
  if (!isContentPage(page)) {
    return { ok: false, state: { ok: false, error: "That page cannot be edited here." } };
  }
  const parsed = CONTENT_SCHEMAS[page].safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      state: {
        ok: false,
        error: "Some of this needs another look before it can be saved.",
        fieldErrors: fieldErrors(parsed.error),
      },
    };
  }
  return { ok: true, page, body: parsed.data };
}

function expire(page: ContentPage) {
  updateTag(siteContentTag(page));
  revalidatePath(CONTENT_PAGE_INFO[page].path);
  revalidatePath("/workspace/content", "layout");
}

export async function saveContentDraft(page: string, body: unknown): Promise<ContentActionState> {
  if (!(await allowed())) return { ok: false, error: DENIED };
  const checked = validate(page, body);
  if (!checked.ok) return checked.state;

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_save_site_page_draft", {
    p_page: checked.page,
    p_body: checked.body,
  });
  if (error) return { ok: false, error: errorFor(error.code, error.message) };

  revalidatePath("/workspace/content", "layout");
  return { ok: true, message: "Draft saved. Visitors still see the published version." };
}

export async function publishContent(page: string, body: unknown): Promise<ContentActionState> {
  if (!(await allowed())) return { ok: false, error: DENIED };
  const checked = validate(page, body);
  if (!checked.ok) return checked.state;

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_publish_site_page", {
    p_page: checked.page,
    p_body: checked.body,
  });
  if (error) return { ok: false, error: errorFor(error.code, error.message) };

  expire(checked.page);
  return { ok: true, message: `Published. ${CONTENT_PAGE_INFO[checked.page].name} now shows this text.` };
}

export async function discardContentDraft(page: string): Promise<ContentActionState> {
  if (!(await allowed())) return { ok: false, error: DENIED };
  if (!isContentPage(page)) return { ok: false, error: "That page cannot be edited here." };

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_discard_site_page_draft", { p_page: page });
  if (error) return { ok: false, error: errorFor(error.code, error.message) };

  revalidatePath("/workspace/content", "layout");
  return { ok: true, message: "Draft discarded." };
}

export async function restoreOriginalContent(page: string): Promise<ContentActionState> {
  if (!(await allowed())) return { ok: false, error: DENIED };
  if (!isContentPage(page)) return { ok: false, error: "That page cannot be edited here." };

  const supabase = await createStaffClient();
  const { error } = await supabase.rpc("admin_publish_site_page", { p_page: page, p_body: null });
  if (error) return { ok: false, error: errorFor(error.code, error.message) };

  expire(page);
  return { ok: true, message: `${CONTENT_PAGE_INFO[page].name} is back to its original text.` };
}
