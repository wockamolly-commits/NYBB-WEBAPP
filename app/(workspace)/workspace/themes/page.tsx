import type { Metadata } from "next";
import { Wordmark } from "@/components/brand/Wordmark";
import { requireStaffPermission } from "@/lib/staff/session";
import { getLiveTheme } from "@/lib/themes/admin";
import { ThemesManager } from "./ThemesManager";

export const metadata: Metadata = { title: "Seasonal themes" };

/**
 * Pick the look of the public website, gated on themes:manage.
 *
 * Applying is instant and has no draft, because a theme changes how the site
 * looks and never what it says. The preview links and the live sample are the
 * safety net. Every change is in the audit log as "Theme: <name>".
 */
export default async function WorkspaceThemesPage() {
  await requireStaffPermission("themes:manage", "/workspace/themes");
  const live = await getLiveTheme();

  return (
    <div className="mx-auto max-w-6xl">
      <p className="type-caps text-nybb-yellow">Appearance</p>
      <h1 className="font-display heading-major mt-2">Seasonal themes</h1>
      <p className="text-nybb-bone/70 mt-3 max-w-2xl leading-relaxed">
        A theme changes the colours, patterns, decorations and animations on every page of the
        public website. It never changes the menu, the prices or what any page says. Preview a
        theme first: applying one puts it live for every visitor straight away.
      </p>

      <ThemesManager
        live={live}
        logo={<Wordmark className="w-[72px] sm:w-[84px]" sizes="84px" />}
      />
    </div>
  );
}
