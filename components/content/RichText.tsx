import Link from "next/link";
import { Fragment } from "react";
import { Pending } from "@/components/legal/LegalDocument";
import { NpcSeal } from "@/components/legal/NpcSeal";
import { parseMarkup, type Block, type Inline } from "@/lib/content/markup";
import { cn } from "@/lib/utils";

/**
 * Text written in the content editor, as React elements.
 *
 * Every node becomes an element built here; nothing stored is ever handed to
 * the browser as HTML. See lib/content/markup.ts for the syntax and for why.
 *
 * The page supplies the classes, because the same body is set as ink on amber
 * on About and in the legal pages, and the styling belongs to the page and not
 * to the content. No server-only imports, so the editor can render the same
 * output live beside the text box.
 */
export type RichTextStyles = {
  paragraph?: string;
  heading?: string;
  list?: string;
  orderedList?: string;
  link?: string;
  strong?: string;
};

export function RichText({
  source,
  styles = {},
}: {
  source: string;
  styles?: RichTextStyles;
}) {
  return <Blocks blocks={parseMarkup(source)} styles={styles} />;
}

function Blocks({ blocks, styles }: { blocks: Block[]; styles: RichTextStyles }) {
  return (
    <>
      {blocks.map((block, index) => (
        <BlockNode key={index} block={block} styles={styles} />
      ))}
    </>
  );
}

function BlockNode({ block, styles }: { block: Block; styles: RichTextStyles }) {
  switch (block.t) {
    case "p":
      return (
        <p className={styles.paragraph}>
          <Inlines nodes={block.c} styles={styles} />
        </p>
      );
    case "h":
      return (
        <h3 className={styles.heading}>
          <Inlines nodes={block.c} styles={styles} />
        </h3>
      );
    case "ul":
    case "ol": {
      const Tag = block.t;
      return (
        <Tag className={block.t === "ul" ? styles.list : styles.orderedList}>
          {block.items.map((item, index) => (
            <li key={index}>
              <Inlines nodes={item} styles={styles} />
            </li>
          ))}
        </Tag>
      );
    }
    case "seal":
      return <NpcSeal />;
    case "center":
      return (
        <div className="flex flex-col items-center space-y-4 text-center">
          <Blocks blocks={block.c} styles={styles} />
        </div>
      );
  }
}

function Inlines({ nodes, styles }: { nodes: Inline[]; styles: RichTextStyles }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineNode key={index} node={node} styles={styles} />
      ))}
    </>
  );
}

function InlineNode({ node, styles }: { node: Inline; styles: RichTextStyles }) {
  switch (node.t) {
    case "text":
      return <Fragment>{node.v}</Fragment>;
    case "br":
      return <br />;
    case "strong":
      return (
        <strong className={styles.strong}>
          <Inlines nodes={node.c} styles={styles} />
        </strong>
      );
    case "em":
      return (
        <em>
          <Inlines nodes={node.c} styles={styles} />
        </em>
      );
    case "pending":
      return <Pending>{node.label}</Pending>;
    case "link": {
      const children = <Inlines nodes={node.c} styles={styles} />;
      const className = cn(
        "underline decoration-current/40 underline-offset-4 transition-colors hover:decoration-current",
        styles.link,
      );
      return node.href.startsWith("/") ? (
        <Link href={node.href} className={className}>
          {children}
        </Link>
      ) : (
        <a href={node.href} className={className}>
          {children}
        </a>
      );
    }
  }
}
