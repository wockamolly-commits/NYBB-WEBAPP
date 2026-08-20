/**
 * What the counter looks at while a page is being read.
 *
 * WHY THIS FILE EXISTS AT ALL.
 * ================================================================
 * Every workspace page is server-rendered against the database on each visit,
 * and there was no loading.tsx anywhere in the app. Without one, Next holds the
 * old page on screen until the new one is ready: tapping History on a tablet on
 * shop wifi did nothing visible for as long as the query took, so the honest
 * reading of the screen was that the tap had missed. The usual next move is to
 * tap again.
 *
 * The shell stays put because it lives in the layout, so only the main area
 * swaps. That is also why this is deliberately dull: it stands in for a page
 * whose real shape is not known here, so it says "reading" rather than
 * pretending to be a board it might not be.
 */
export default function WorkspaceLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="sr-only">Loading</p>

      <div className="bg-nybb-bone/10 h-3 w-40 rounded motion-safe:animate-pulse" />
      <div className="bg-nybb-bone/10 mt-4 h-9 w-72 max-w-full rounded motion-safe:animate-pulse" />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className="bg-nybb-charcoal h-40 rounded-md motion-safe:animate-pulse"
            // A stagger, so the four read as one surface arriving rather than
            // four lights flashing in step.
            style={{ animationDelay: `${index * 90}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
