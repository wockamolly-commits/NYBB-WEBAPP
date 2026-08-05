export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-6 px-5 py-16">
      <p className="font-mono-tabular text-xs tracking-[0.2em] text-nybb-orange">
        PHASE 0
      </p>
      <h1 className="font-display text-5xl leading-[0.95] sm:text-7xl">
        New York
        <br />
        Buffalo Brad&rsquo;s
      </h1>
      <p className="max-w-prose text-base text-muted-foreground">
        Scaffold is up. Brand tokens, fonts and the security layer are wired.
        The menu, ordering flow and staff workspace land in the phases that
        follow.
      </p>
    </main>
  );
}
