"use client";

import { Check, ExternalLink, LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { ThemeEffects } from "@/components/theme/ThemeEffects";
import { ThemeEmblem } from "@/components/theme/ThemeEmblem";
import { Button } from "@/components/ui/Button";
import { WorkspaceCheckbox } from "@/components/ui/WorkspaceCheckbox";
import type { ThemeActionState } from "@/lib/themes/action-state";
import type { LiveTheme } from "@/lib/themes/admin";
import {
  BANNER_MAX,
  SEASONAL_THEME_IDS,
  THEME_IDS,
  THEME_PRESETS,
  bannerText,
  type ThemeId,
  type ThemeSetting,
} from "@/lib/themes/presets";
import { previewQuery } from "@/lib/themes/preview";
import { cn } from "@/lib/utils";
import { applyTheme, restoreDefaultTheme } from "./actions";

function manilaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  });
}

const GROUND =
  "linear-gradient(180deg in oklab, var(--nybb-ground-1) 0%, var(--nybb-ground-2) 30%, var(--nybb-ground-3) 65%, var(--nybb-ground-4) 100%)";

export function ThemesManager({ live, logo }: { live: LiveTheme; logo: React.ReactNode }) {
  const [selected, setSelected] = useState<ThemeId>(
    live.setting.id === "default" ? SEASONAL_THEME_IDS[0] : live.setting.id,
  );

  return (
    <>
      <LiveCard live={live} />

      <section aria-labelledby="choose-heading" className="mt-10">
        <h2 id="choose-heading" className="font-display heading-minor">
          Choose a theme
        </h2>
        <Gallery selected={selected} liveId={live.setting.id} onSelect={setSelected} />
      </section>

      {/* Remounted per theme, so switching cards resets the form to that
          theme's own starting point rather than carrying edits across. */}
      <Detail key={selected} id={selected} live={live} logo={logo} />
    </>
  );
}

// ---------------------------------------------------------------------------
// What is live
// ---------------------------------------------------------------------------

function LiveCard({ live }: { live: LiveTheme }) {
  const preset = THEME_PRESETS[live.setting.id];
  const isDefault = live.setting.id === "default";
  const [message, setMessage] = useState<ThemeActionState | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);

  function restore() {
    dialog.current?.close();
    start(async () => {
      const result = await restoreDefaultTheme();
      setMessage(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="live-heading"
      className="bg-nybb-charcoal mt-8 flex flex-col gap-5 rounded-md p-5 sm:flex-row sm:items-center sm:p-6"
    >
      <div
        data-theme={live.setting.id}
        aria-hidden="true"
        className="flex size-20 shrink-0 items-center justify-center rounded-md"
        style={{ backgroundImage: GROUND }}
      >
        <span className="bg-nybb-charcoal text-nybb-orange flex size-12 items-center justify-center rounded-full">
          <ThemeEmblem id={live.setting.id} className="size-7" />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="type-caps text-nybb-yellow">Live on the website</p>
        <h2 id="live-heading" className="font-display heading-minor mt-1.5">
          {preset.name}
        </h2>
        <p className="text-nybb-bone/70 mt-1.5 text-sm">
          {live.appliedAt
            ? `Since ${manilaDateTime(live.appliedAt)}${live.appliedBy ? ` by ${live.appliedBy}` : ""}`
            : "The everyday look. No theme has been applied yet."}
        </p>
        {!isDefault ? (
          <p className="text-nybb-bone/70 mt-1 text-sm">
            Banner {live.setting.banner.show ? "on" : "off"} · animations{" "}
            {live.setting.effects ? "on" : "off"}
          </p>
        ) : null}
        {message ? (
          <p role="status" className={cn("mt-2 text-sm", message.ok ? "text-nybb-bone" : "text-nybb-red")}>
            {message.ok ? message.message : message.error}
          </p>
        ) : null}
      </div>

      {!isDefault ? (
        <>
          <Button
            type="button"
            tone="dark"
            variant="secondary"
            onClick={() => dialog.current?.showModal()}
            disabled={pending}
            className="min-h-11 shrink-0"
          >
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <RotateCcw aria-hidden className="size-4" />
            )}
            Restore default look
          </Button>
          <ConfirmDialog
            ref={dialog}
            kicker="Back to everyday"
            title="Restore the default look?"
            body={`${preset.name} comes off every page of the live website right away. Content and prices are not affected.`}
            confirmLabel="Restore default"
            onConfirm={restore}
          />
        </>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The gallery
// ---------------------------------------------------------------------------

function Gallery({
  selected,
  liveId,
  onSelect,
}: {
  selected: ThemeId;
  liveId: ThemeId;
  onSelect: (id: ThemeId) => void;
}) {
  const refs = useRef<Map<ThemeId, HTMLButtonElement>>(new Map());

  // A radiogroup moves with the arrow keys, and only the checked card is in
  // the tab order, so Tab leaves the gallery in one press.
  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = THEME_IDS[(index + step + THEME_IDS.length) % THEME_IDS.length];
    onSelect(next);
    refs.current.get(next)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby="choose-heading"
      className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
    >
      {THEME_IDS.map((id, index) => {
        const preset = THEME_PRESETS[id];
        const checked = id === selected;
        return (
          <button
            key={id}
            ref={(node) => {
              if (node) refs.current.set(id, node);
              else refs.current.delete(id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "bg-nybb-charcoal group overflow-hidden rounded-md border-2 text-left transition-colors",
              "focus-visible:outline-nybb-orange focus-visible:outline-2 focus-visible:outline-offset-2",
              checked ? "border-nybb-orange" : "border-nybb-bone/10 hover:border-nybb-bone/35",
            )}
          >
            <span
              data-theme={id}
              aria-hidden="true"
              className="relative flex h-20 items-center justify-center"
              style={{ backgroundImage: `var(--theme-pattern-light, none), ${GROUND}` }}
            >
              <span className="bg-nybb-charcoal text-nybb-orange flex size-11 items-center justify-center rounded-full shadow-md">
                <ThemeEmblem id={id} className="size-6" />
              </span>
              <span className="absolute inset-x-0 bottom-0 flex h-2">
                {preset.swatch.map((colour) => (
                  <span key={colour} className="flex-1" style={{ backgroundColor: colour }} />
                ))}
              </span>
            </span>
            <span className="block p-3">
              <span className="flex items-start justify-between gap-2">
                <span className="font-display text-base leading-tight">{preset.name}</span>
                {id === liveId ? (
                  <span className="type-caps bg-nybb-orange text-nybb-ink shrink-0 rounded px-1.5 py-0.5">
                    Live
                  </span>
                ) : null}
              </span>
              <span className="text-nybb-bone/65 mt-1 block text-xs">{preset.season}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The chosen theme: a live sample and its settings
// ---------------------------------------------------------------------------

function Detail({ id, live, logo }: { id: ThemeId; live: LiveTheme; logo: React.ReactNode }) {
  const preset = THEME_PRESETS[id];
  const isLive = id === live.setting.id;
  const start0 = isLive
    ? live.setting
    : { id, banner: { show: true, text: "" }, effects: true };

  const [bannerShow, setBannerShow] = useState(start0.banner.show);
  const [text, setText] = useState(start0.banner.text);
  const [effects, setEffects] = useState(start0.effects);
  const [result, setResult] = useState<ThemeActionState | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const textId = useId();
  const textHint = useId();
  const textError = useId();

  const setting: ThemeSetting = { id, banner: { show: bannerShow, text }, effects };
  const dirty =
    isLive &&
    (bannerShow !== live.setting.banner.show ||
      text.trim() !== live.setting.banner.text ||
      effects !== live.setting.effects);

  const isDefault = id === "default";
  const label = isDefault
    ? live.setting.id === "default"
      ? "Default is live"
      : "Restore default"
    : isLive
      ? dirty
        ? "Save changes"
        : "Live now"
      : "Apply theme";
  const disabled = pending || (isDefault ? live.setting.id === "default" : isLive && !dirty);

  const liveName = THEME_PRESETS[live.setting.id].name;
  const confirmBody = isDefault
    ? `${liveName} comes off every page of the live website right away. Content and prices are not affected.`
    : isLive
      ? `Your changes to ${preset.name} go live on every page of the website right away. Content and prices are not affected.`
      : `${preset.name} replaces ${liveName} on every page of the live website right away. Content and prices are not affected.`;

  function submit() {
    dialog.current?.close();
    start(async () => {
      const outcome = await applyTheme(setting);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  const fieldError = result && !result.ok ? result.fieldErrors?.text : undefined;
  const query = previewQuery(setting);

  return (
    <section aria-labelledby="detail-heading" className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div>
        <Sample setting={setting} logo={logo} />
        <p className="text-nybb-bone/65 mt-2 text-sm">
          {isDefault
            ? "The everyday look, with nothing added."
            : "Live sample. Move the pointer over it or click to try the interaction."}
        </p>
      </div>

      <div className="bg-nybb-charcoal rounded-md p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="text-nybb-orange mt-0.5">
            <ThemeEmblem id={id} className="size-8" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="detail-heading" className="font-display heading-minor">
              {preset.name}
            </h2>
            <p className="text-nybb-bone/65 mt-0.5 text-sm">{preset.season}</p>
          </div>
          {isLive ? (
            <span className="type-caps bg-nybb-orange text-nybb-ink shrink-0 rounded px-1.5 py-0.5">Live</span>
          ) : null}
        </div>

        <p className="text-nybb-bone/80 mt-4 text-sm leading-relaxed">{preset.blurb}</p>
        {!isDefault ? (
          <p className="text-nybb-bone/70 mt-2 text-sm">
            <span className="text-nybb-bone font-medium">Animation:</span> {preset.effectLabel}
          </p>
        ) : null}

        {!isDefault ? (
          <div className="mt-5 space-y-4">
            <label className="flex cursor-pointer items-start gap-3">
              <WorkspaceCheckbox
                checked={effects}
                onChange={(event) => setEffects(event.target.checked)}
                disabled={pending}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium">Animated effects</span>
                <span className="text-nybb-bone/65 block text-sm">
                  Visitors who prefer reduced motion always get a still version.
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-3">
              <WorkspaceCheckbox
                checked={bannerShow}
                onChange={(event) => setBannerShow(event.target.checked)}
                disabled={pending}
                className="mt-0.5"
              />
              <span className="block text-sm font-medium">Show a banner above the header</span>
            </label>

            {bannerShow ? (
              <div>
                <label htmlFor={textId} className="type-caps text-nybb-bone/65 block">
                  Banner message
                </label>
                <textarea
                  id={textId}
                  value={text}
                  maxLength={BANNER_MAX}
                  rows={3}
                  onChange={(event) => setText(event.target.value)}
                  placeholder={preset.banner}
                  disabled={pending}
                  aria-describedby={fieldError ? `${textHint} ${textError}` : textHint}
                  aria-invalid={fieldError ? true : undefined}
                  className="mt-2 w-full px-3.5 py-2.5 text-base sm:text-sm"
                />
                <p id={textHint} className="text-nybb-bone/65 mt-1 flex justify-between gap-3 text-sm">
                  <span>Leave empty to use the suggested message.</span>
                  <span className="font-mono tabular-nums">
                    {text.length}/{BANNER_MAX}
                  </span>
                </p>
                {fieldError ? (
                  <p id={textError} className="text-nybb-red mt-1 text-sm">
                    {fieldError}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          {!isDefault ? (
            <>
              <a
                href={`/preview/theme/${id}?${query}`}
                target="_blank"
                rel="noopener"
                className="border-nybb-bone/30 hover:border-nybb-bone/60 inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium"
              >
                Preview on site
                <ExternalLink aria-hidden className="size-4" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <a
                href={`/preview/theme/${id}/menu?${query}`}
                target="_blank"
                rel="noopener"
                className="border-nybb-bone/30 hover:border-nybb-bone/60 inline-flex min-h-11 items-center gap-2 rounded-md border px-4 text-sm font-medium"
              >
                Preview menu
                <ExternalLink aria-hidden className="size-4" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </>
          ) : null}
          <Button
            type="button"
            tone="dark"
            variant="primary"
            disabled={disabled}
            onClick={() => dialog.current?.showModal()}
            className="min-h-11"
          >
            {pending ? (
              <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            ) : disabled && !pending ? (
              <Check aria-hidden className="size-4" />
            ) : null}
            {label}
          </Button>
        </div>

        {result ? (
          <p role="status" className={cn("mt-3 text-sm", result.ok ? "text-nybb-bone" : "text-nybb-red")}>
            {result.ok ? result.message : result.error}
          </p>
        ) : null}

        <ConfirmDialog
          ref={dialog}
          kicker="Goes live straight away"
          title={isDefault ? "Restore the default look?" : `Apply ${preset.name}?`}
          body={confirmBody}
          confirmLabel={isDefault ? "Restore default" : isLive ? "Save changes" : "Apply theme"}
          onConfirm={submit}
        />
      </div>
    </section>
  );
}

/**
 * A miniature storefront in the chosen theme: banner, header, a dark band with
 * a call to action, two product cards and the footer. It uses the real
 * classes (.site-header, .surface-chrome, .band-ink, .theme-banner), so what
 * it shows is what app/themes.css does, not a drawing of it.
 *
 * aria-hidden: it is a picture of the site, and its fake buttons are spans.
 * Not inert, because the canvas listens for the pointer on it.
 */
function Sample({ setting, logo }: { setting: ThemeSetting; logo: React.ReactNode }) {
  const text = bannerText(setting);
  return (
    <div
      data-theme={setting.id}
      aria-hidden="true"
      className="theme-sample border-nybb-bone/15 relative overflow-hidden rounded-md border select-none"
      style={{ backgroundImage: GROUND }}
    >
      {text ? (
        <div className="theme-banner" style={{ animation: "none" }}>
          <div className="theme-banner__inner" style={{ paddingBlock: "0.375rem" }}>
            <ThemeEmblem id={setting.id} className="theme-banner__emblem size-5" />
            <p className="theme-banner__text" style={{ fontSize: "0.75rem" }}>
              {text}
            </p>
          </div>
        </div>
      ) : null}

      <div className="site-header surface-chrome text-nybb-ink relative z-10">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="site-header__logo inline-block">{logo}</span>
          <span className="font-display flex gap-4 text-xs tracking-[0.06em]">
            <span>MENU</span>
            <span>PROMOS</span>
            <span className="hidden sm:inline">ABOUT</span>
          </span>
        </div>
      </div>

      <div className="px-4 pt-8 pb-4">
        <div className="band-ink text-nybb-bone rounded-md p-5">
          <p className="type-caps text-nybb-yellow">Ten flavours, five heats</p>
          <p className="font-display mt-2 text-3xl leading-none">
            Wings worth <span className="text-nybb-orange">the burn.</span>
          </p>
          <span className="bg-nybb-orange text-nybb-ink font-display mt-4 inline-flex min-h-9 items-center rounded-md px-4 text-sm">
            SEE THE MENU
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3">
          {[
            ["Classic Buffalo", "₱289"],
            ["Garlic Parmesan", "₱299"],
          ].map(([name, price]) => (
            <div key={name} className="bg-nybb-charcoal text-nybb-bone rounded-md p-3">
              <p className="font-display text-sm">{name}</p>
              <p className="text-nybb-orange mt-1 font-mono text-sm tabular-nums">{price}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="surface-chrome text-nybb-ink px-4 py-3 text-xs">New York Buffalo Brad&apos;s</div>

      {setting.id !== "default" && setting.effects ? (
        <ThemeEffects kind={THEME_PRESETS[setting.id].effect} scope="box" />
      ) : null}
    </div>
  );
}

function ConfirmDialog({
  ref,
  kicker,
  title,
  body,
  confirmLabel,
  onConfirm,
}: {
  ref: React.Ref<HTMLDialogElement>;
  kicker: string;
  title: string;
  body: string;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const bodyId = useId();
  const local = useRef<HTMLDialogElement | null>(null);

  return (
    <dialog
      ref={(node) => {
        local.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.RefObject<HTMLDialogElement | null>).current = node;
      }}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      className="confirm-dialog"
      onClick={(event) => {
        if (event.target === local.current) local.current?.close();
      }}
    >
      <div className="p-5 sm:p-6">
        <p className="type-caps text-nybb-yellow">{kicker}</p>
        <h2 id={titleId} className="font-display heading-minor mt-3">
          {title}
        </h2>
        <p id={bodyId} className="text-nybb-bone/70 mt-4 text-sm">
          {body}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            tone="dark"
            variant="secondary"
            onClick={() => local.current?.close()}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button type="button" tone="dark" variant="primary" onClick={onConfirm} className="w-full sm:w-auto">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
