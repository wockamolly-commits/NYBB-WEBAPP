"use client";

import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { WorkspaceFieldLabel, WorkspaceInput } from "@/components/ui/WorkspaceField";
import { WorkspaceSection } from "@/components/ui/WorkspaceSection";
import { WorkspaceSelect } from "@/components/ui/WorkspaceSelect";
import {
  LIMITS,
  sectionIdFor,
  type AboutContent,
  type ContentFieldErrors,
  type HomeContent,
  type LegalContent,
} from "@/lib/content/schema";
import { cn } from "@/lib/utils";
import { RichTextField, TextAreaField, TextField } from "./fields";

type FormProps<T> = {
  value: T;
  onChange: (next: T) => void;
  errors: ContentFieldErrors;
};

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------

/**
 * The landing page's copy, slot by slot, in the order the page shows it.
 *
 * Plain text only, by design: these lines sit at measured sizes over
 * photographs and dark bands, so the form can change what they say and
 * nothing about how they are set.
 */
export function HomeForm({ value, onChange, errors }: FormProps<HomeContent>) {
  const set = <K extends keyof HomeContent>(key: K, patch: Partial<HomeContent[K]>) =>
    onChange({ ...value, [key]: { ...value[key], ...patch } });

  return (
    <div className="space-y-4">
      <WorkspaceSection
        title="Hero"
        description="The first screen, over the photographs. The headline is two lines: the second is set in orange."
      >
        <div className="space-y-5">
          <TextField
            label="Tagline"
            value={value.hero.tagline}
            onChange={(tagline) => set("hero", { tagline })}
            max={LIMITS.line}
            error={errors["hero.tagline"]}
            hint="In the brand script, above the headline."
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Headline, first line"
              value={value.hero.headline}
              onChange={(headline) => set("hero", { headline })}
              max={LIMITS.line}
              error={errors["hero.headline"]}
            />
            <TextField
              label="Headline, orange line"
              value={value.hero.headlineAccent}
              onChange={(headlineAccent) => set("hero", { headlineAccent })}
              max={LIMITS.line}
              error={errors["hero.headlineAccent"]}
              hint="Optional."
            />
          </div>
          <TextAreaField
            label="Sentence under the headline"
            value={value.hero.lede}
            onChange={(lede) => set("hero", { lede })}
            max={LIMITS.sentence}
            error={errors["hero.lede"]}
            rows={2}
          />
          <p className="text-nybb-bone/55 text-xs">
            The buttons and the line about online ordering under them follow whether ordering is
            open, so they are not edited here.
          </p>
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Flavours" description="The heading and introduction above the flavour photographs.">
        <div className="space-y-5">
          <TextField
            label="Heading"
            value={value.flavours.title}
            onChange={(title) => set("flavours", { title })}
            max={LIMITS.line}
            error={errors["flavours.title"]}
          />
          <TextAreaField
            label="Introduction"
            value={value.flavours.body}
            onChange={(body) => set("flavours", { body })}
            max={LIMITS.blurb}
            error={errors["flavours.body"]}
          />
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Heat scale" description="The dark band with the heat slider.">
        <div className="space-y-5">
          <TextField
            label="Heading"
            value={value.heat.title}
            onChange={(title) => set("heat", { title })}
            max={LIMITS.line}
            error={errors["heat.title"]}
          />
          <TextAreaField
            label="Introduction"
            value={value.heat.body}
            onChange={(body) => set("heat", { body })}
            max={LIMITS.blurb}
            error={errors["heat.body"]}
          />
          <TextAreaField
            label="Small print under the slider"
            value={value.heat.note}
            onChange={(note) => set("heat", { note })}
            max={LIMITS.sentence}
            error={errors["heat.note"]}
            hint="Optional."
            rows={2}
          />
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="How pickup works" description="The four numbered steps. The numbers are added for you.">
        <div className="space-y-5">
          <TextField
            label="Heading"
            value={value.pickup.title}
            onChange={(title) => set("pickup", { title })}
            max={LIMITS.line}
            error={errors["pickup.title"]}
          />
          <ol className="grid gap-5 sm:grid-cols-2">
            {value.pickup.steps.map((step, index) => (
              <li key={index} className="border-nybb-bone/15 space-y-3 border-t pt-4">
                <p className="font-mono-tabular text-nybb-bone/55 text-sm">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <TextField
                  label="Step title"
                  value={step.title}
                  onChange={(title) =>
                    set("pickup", {
                      steps: value.pickup.steps.map((s, i) => (i === index ? { ...s, title } : s)),
                    })
                  }
                  max={LIMITS.line}
                  error={errors[`pickup.steps.${index}.title`]}
                />
                <TextAreaField
                  label="Step text"
                  value={step.body}
                  onChange={(body) =>
                    set("pickup", {
                      steps: value.pickup.steps.map((s, i) => (i === index ? { ...s, body } : s)),
                    })
                  }
                  max={LIMITS.sentence}
                  error={errors[`pickup.steps.${index}.body`]}
                />
              </li>
            ))}
          </ol>
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Not just wings" description="Above the photographs of the rest of the menu.">
        <div className="space-y-5">
          <TextField
            label="Heading"
            value={value.more.title}
            onChange={(title) => set("more", { title })}
            max={LIMITS.line}
            error={errors["more.title"]}
          />
          <TextAreaField
            label="Introduction"
            value={value.more.body}
            onChange={(body) => set("more", { body })}
            max={LIMITS.blurb}
            error={errors["more.body"]}
          />
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        title="Branches"
        description="The heading counts the branches by itself, and the sentence after this one says where online ordering is open."
      >
        <TextAreaField
          label="Opening sentence"
          value={value.branches.body}
          onChange={(body) => set("branches", { body })}
          max={LIMITS.sentence}
          error={errors["branches.body"]}
          rows={2}
        />
      </WorkspaceSection>

      <WorkspaceSection title="Franchise" description="The one quiet line at the foot of the page.">
        <div className="space-y-5">
          <TextAreaField
            label="Line"
            value={value.franchise.line}
            onChange={(line) => set("franchise", { line })}
            max={LIMITS.sentence}
            error={errors["franchise.line"]}
            rows={2}
          />
          <TextField
            label="Email address"
            type="email"
            value={value.franchise.email}
            onChange={(email) => set("franchise", { email })}
            max={120}
            error={errors["franchise.email"]}
            hint="Optional. Shown as a link beside the line."
          />
        </div>
      </WorkspaceSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------

export function AboutForm({ value, onChange, errors }: FormProps<AboutContent>) {
  const set = <K extends "heading" | "claim" | "fried">(key: K, patch: Partial<AboutContent[K]>) =>
    onChange({ ...value, [key]: { ...value[key], ...patch } });

  return (
    <div className="space-y-4">
      <WorkspaceSection title="Heading" description="The page title, over two lines.">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="First line"
            value={value.heading.first}
            onChange={(first) => set("heading", { first })}
            max={LIMITS.line}
            error={errors["heading.first"]}
          />
          <TextField
            label="Second line"
            value={value.heading.second}
            onChange={(second) => set("heading", { second })}
            max={LIMITS.line}
            error={errors["heading.second"]}
            hint="Optional."
          />
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        title="Introduction"
        description="Beside the dark panel. The panel's numbers (flavours, heat levels, counters) are counted from the live menu and branch list, so they are not edited here."
      >
        <RichTextField
          label="Text"
          value={value.intro}
          onChange={(intro) => onChange({ ...value, intro })}
          max={LIMITS.body}
          error={errors.intro}
          allowHeadings={false}
        />
      </WorkspaceSection>

      <WorkspaceSection title="First section" description="Beside the counter photograph, closing on the script signature.">
        <div className="space-y-5">
          <TextField
            label="Heading"
            value={value.claim.title}
            onChange={(title) => set("claim", { title })}
            max={LIMITS.line}
            error={errors["claim.title"]}
          />
          <RichTextField
            label="Text"
            value={value.claim.body}
            onChange={(body) => set("claim", { body })}
            max={LIMITS.body}
            error={errors["claim.body"]}
            allowHeadings={false}
          />
          <TextField
            label="Signature line"
            value={value.claim.signature}
            onChange={(signature) => set("claim", { signature })}
            max={LIMITS.line}
            error={errors["claim.signature"]}
            hint="Optional. Set in the brand script under the text."
          />
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Second section" description="The closing passage, with no photograph.">
        <div className="space-y-5">
          <TextField
            label="Heading"
            value={value.fried.title}
            onChange={(title) => set("fried", { title })}
            max={LIMITS.line}
            error={errors["fried.title"]}
          />
          <RichTextField
            label="Text"
            value={value.fried.body}
            onChange={(body) => set("fried", { body })}
            max={LIMITS.body}
            error={errors["fried.body"]}
            allowHeadings={false}
          />
        </div>
      </WorkspaceSection>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Privacy Policy and Terms of Service
// ---------------------------------------------------------------------------

const DATE_LABELS = [
  { value: "updated", label: "Last updated" },
  { value: "effective", label: "Effective" },
] as const;

/**
 * A legal page as a list of sections that can be added, removed and
 * reordered. Sections fold away so a twelve section policy fits on a screen,
 * and any section with a problem opens itself.
 */
export function LegalForm({
  value,
  onChange,
  errors,
  path,
  allowSeal,
}: FormProps<LegalContent> & { path: string; allowSeal: boolean }) {
  const dateId = useId();
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const withErrors = new Set(
    Object.keys(errors)
      .map((key) => /^sections\.(\d+)\./.exec(key)?.[1])
      .filter((index): index is string => index !== undefined)
      .map((index) => value.sections[Number(index)]?.id)
      .filter(Boolean),
  );

  const setSection = (index: number, patch: Partial<LegalContent["sections"][number]>) =>
    onChange({
      ...value,
      sections: value.sections.map((section, i) => (i === index ? { ...section, ...patch } : section)),
    });

  const move = (index: number, by: -1 | 1) => {
    const target = index + by;
    if (target < 0 || target >= value.sections.length) return;
    const sections = [...value.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    onChange({ ...value, sections });
  };

  const remove = (index: number) =>
    onChange({ ...value, sections: value.sections.filter((_, i) => i !== index) });

  const add = () => {
    const title = `${value.sections.length + 1}. New section`;
    const id = sectionIdFor(`new section`, value.sections.map((section) => section.id));
    onChange({ ...value, sections: [...value.sections, { id, title, body: "" }] });
    setOpen((current) => new Set(current).add(id));
  };

  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <WorkspaceSection title="Page" description="The title and the date printed under it.">
        <div className="space-y-5">
          <TextField
            label="Title"
            value={value.title}
            onChange={(title) => onChange({ ...value, title })}
            max={120}
            error={errors.title}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <WorkspaceSelect
              id={`${dateId}-label`}
              name="dateLabel"
              label="Date wording"
              options={DATE_LABELS}
              value={value.dateLabel}
              onValueChange={(dateLabel) => dateLabel && onChange({ ...value, dateLabel })}
            />
            <div>
              <WorkspaceFieldLabel htmlFor={dateId}>Date</WorkspaceFieldLabel>
              <WorkspaceInput
                id={dateId}
                type="date"
                value={value.date}
                onChange={(event) => onChange({ ...value, date: event.target.value })}
                aria-invalid={errors.date ? true : undefined}
              />
              {errors.date ? (
                <p role="alert" className="text-nybb-red mt-1.5 text-sm">
                  {errors.date}
                </p>
              ) : (
                <p className="text-nybb-bone/55 mt-1.5 text-xs">
                  Leave empty while it is undecided. The page then shows a placeholder and a
                  draft notice.
                </p>
              )}
            </div>
          </div>
        </div>
      </WorkspaceSection>

      <WorkspaceSection title="Introduction" description="Optional text between the date and the first section.">
        <RichTextField
          label="Introduction"
          value={value.intro}
          onChange={(intro) => onChange({ ...value, intro })}
          max={LIMITS.body}
          error={errors.intro}
          rows={4}
        />
      </WorkspaceSection>

      <section aria-labelledby={`${dateId}-sections`} className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-3 pt-4">
          <h2 id={`${dateId}-sections`} className="font-display heading-minor">
            Sections
          </h2>
          <p className="text-nybb-bone/55 text-sm">
            {value.sections.length} of {LIMITS.legalSections}
          </p>
        </div>
        {errors.sections ? (
          <p role="alert" className="text-nybb-red text-sm">
            {errors.sections}
          </p>
        ) : null}

        <ol className="space-y-3">
          {value.sections.map((section, index) => {
            const isOpen = open.has(section.id) || withErrors.has(section.id);
            return (
              <li key={section.id} className="bg-nybb-charcoal rounded-md">
                <div className="flex items-center gap-1 p-2 pl-4">
                  <button
                    type="button"
                    onClick={() => toggle(section.id)}
                    aria-expanded={isOpen}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <ChevronDown
                      aria-hidden
                      className={cn("size-4 shrink-0 transition-transform", isOpen ? "" : "-rotate-90")}
                    />
                    <span className="text-nybb-bone truncate font-medium">{section.title || "Untitled section"}</span>
                    {withErrors.has(section.id) ? (
                      <span className="text-nybb-red shrink-0 text-xs">Needs a look</span>
                    ) : null}
                  </button>
                  <IconButton label={`Move "${section.title}" up`} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp className="size-4" />
                  </IconButton>
                  <IconButton
                    label={`Move "${section.title}" down`}
                    disabled={index === value.sections.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </IconButton>
                  <IconButton
                    label={`Remove "${section.title}"`}
                    disabled={value.sections.length === 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                </div>

                {isOpen ? (
                  <div className="border-nybb-bone/15 space-y-5 border-t p-4 sm:p-5">
                    <TextField
                      label="Section heading"
                      value={section.title}
                      onChange={(title) => setSection(index, { title })}
                      max={120}
                      error={errors[`sections.${index}.title`]}
                      hint={`Linked as ${path}#${section.id}`}
                    />
                    <RichTextField
                      label="Section text"
                      value={section.body}
                      onChange={(body) => setSection(index, { body })}
                      max={LIMITS.legalBody}
                      error={errors[`sections.${index}.body`] ?? errors[`sections.${index}.id`]}
                      rows={12}
                      allowSeal={allowSeal}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>

        <Button
          type="button"
          tone="dark"
          variant="secondary"
          onClick={add}
          disabled={value.sections.length >= LIMITS.legalSections}
          className="min-h-11"
        >
          <Plus aria-hidden className="size-4" />
          Add a section
        </Button>
      </section>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="text-nybb-bone/70 hover:bg-nybb-bone/10 hover:text-nybb-bone flex size-11 shrink-0 items-center justify-center rounded transition-colors disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}
