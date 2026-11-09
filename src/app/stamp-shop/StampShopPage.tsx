"use client";

import { useRouter } from "next/navigation";
import { StampShop } from "@/components/edit/panels/StampShop";

/** The sticker shop on its own page (app link openedit://shop); closing goes back. */
export function StampShopPage() {
  const router = useRouter();
  return (
    <div className="absolute inset-0 bg-bg">
      <StampShop onClose={() => (window.history.length > 1 ? router.back() : router.push("/"))} />
    </div>
  );
}
