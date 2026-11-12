import Link from "next/link";

/**
 * The strip across the top of a theme preview, so nobody mistakes it for the
 * live site. Sticky above the header, and a link to the other preview page
 * and back to the Workspace.
 */
export function PreviewNotice({
  name,
  other,
}: {
  name: string;
  other: { href: string; label: string };
}) {
  return (
    <div className="bg-nybb-yellow text-nybb-ink sticky top-0 z-[55] border-b-2 border-nybb-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm sm:px-6">
        <p className="font-medium">
          Theme preview: {name}. Visitors do not see this until it is applied.
        </p>
        <p className="flex gap-4 font-medium">
          <Link href={other.href} className="underline underline-offset-2">
            {other.label}
          </Link>
          <Link href="/workspace/themes" className="underline underline-offset-2">
            Back to themes
          </Link>
        </p>
      </div>
    </div>
  );
}
