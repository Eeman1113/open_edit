import Link from "next/link";
import { EmptyState } from "@/components/ui";

// Shown for unknown pages and missing posts, creators or feed groups (notFound()).
export default function NotFound() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-bg text-fg">
      <EmptyState
        icon="search"
        title="Nothing here"
        body="This page doesn’t exist, or what it showed has been removed."
        action={
          <Link href="/" className="oe-press inline-flex h-11 items-center rounded-full bg-accent px-5 font-semibold text-on-accent">
            Open the camera
          </Link>
        }
      />
    </div>
  );
}
