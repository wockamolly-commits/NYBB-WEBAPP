import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Home from "@/app/(marketing)/page";
import { StorefrontChrome } from "@/components/site/StorefrontChrome";
import { requireStaffPermission } from "@/lib/staff/session";
import { THEME_PRESETS } from "@/lib/themes/presets";
import { previewQuery, previewSetting } from "@/lib/themes/preview";
import { PreviewNotice } from "../PreviewNotice";

export const metadata: Metadata = {
  title: "Theme preview",
  robots: { index: false, follow: false },
};

/**
 * The real home page, in a seasonal theme that is not live yet. Staff with
 * themes:manage only; anyone else is sent to sign in or to the denied page.
 */
export default async function ThemePreviewHome({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireStaffPermission("themes:manage", "/workspace/themes");
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const setting = previewSetting(id, query);
  if (!setting) notFound();
  const name = THEME_PRESETS[setting.id].name;

  return (
    <StorefrontChrome
      theme={setting}
      previewBanner
      notice={
        <PreviewNotice
          name={name}
          other={{ href: `/preview/theme/${setting.id}/menu?${previewQuery(setting)}`, label: "Preview the menu" }}
        />
      }
    >
      <Home />
    </StorefrontChrome>
  );
}
