import { cn } from "@/lib/format";

/**
 * The brand's logo inside the app: the same generated image as the
 * home-screen icon, so a parent recognises one from the other.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    // A generated PNG from our own route; next/image adds nothing here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/192"
      alt=""
      width={192}
      height={192}
      className={cn("shrink-0 rounded-md shadow-sm", className)}
    />
  );
}
