import Image from "next/image";
import { catalogImage } from "@/lib/catalog";
import { cn } from "@/lib/utils";

/**
 * The Hot Wings wordmark.
 *
 * The archive's logo is one of the few genuinely transparent files in it
 * (2704x1559, 37.8% alpha), so it sits on any ground without treatment. Using
 * the real mark rather than typesetting the name is the point: this is the sign
 * customers already look for on a mall concourse.
 */
export function Wordmark({
  className,
  width = 180,
  priority = false,
}: {
  className?: string;
  width?: number;
  priority?: boolean;
}) {
  const image = catalogImage("wordmark");
  if (!image) return null;

  const height = Math.round((width / image.width) * image.height);

  return (
    <Image
      src={image.src}
      alt="New York Buffalo Brad's Hot Wings"
      width={width}
      height={height}
      priority={priority}
      className={cn("h-auto w-auto select-none", className)}
      style={{ width, height }}
    />
  );
}
