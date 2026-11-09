"use client";

// StampShopActivity -> ShopOverviewFragment (fragment_stamp_search.xml): white page, 52dp top navigation with
// btn_close (edit_close 52dp tinted #222222) and "Discover" (gallery_stamp_stamp_shop, 15.5sp bold #222222), then the
// browser_recycler_view of server packs (/v1/stamp/list/browser*). The APK bundles no stamp packs, so the overview
// request always fails offline and the page shows its NetworkErrorRetryView (white, message
// gallery_stamp_shop_network_error 15sp #b1b9be, 21dp gap, "Retry" 13sp white on stamp_shop_network_error_retry_btn_bg
// with video_template_reset as drawableStart, drawablePadding 4).
//
// Also the first-run balloon on btn_stamp_shop (EPStampAddFragment.T6: "There are more stickers!", BalloonAlignment.Top,
// shown until the shop has been opened once - "photoEditShowStampShopTooltip").
import { useEffect, useState, type RefObject } from "react";
import { TopBalloon } from "../balloon";
import { d } from "@/components/ui/legacy-drawable";
import { useBackHandler } from "@/lib/back";
import { Img } from "../ui";

const SHOWN_KEY = "photoEditShowStampShopTooltip";

export function stampShopTooltipPending(): boolean {
  try { return localStorage.getItem(SHOWN_KEY) !== "true"; } catch { return false; }
}
export function markStampShopTooltipShown() {
  try { localStorage.setItem(SHOWN_KEY, "true"); } catch { /* storage unavailable */ }
}

export function StampShop({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [shown, setShown] = useState(false);
  // the overview request fails offline (no bundled packs): brief loading, then the retry view
  useEffect(() => {
    if (!loading) return;
    const t = window.setTimeout(() => setLoading(false), 400);
    return () => window.clearTimeout(t);
  }, [loading]);
  useEffect(() => {
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, []);
  useBackHandler(onClose);
  return (
    <div
      className="absolute inset-0 z-[96] bg-white"
      style={{ transform: shown ? "translateY(0)" : "translateY(100%)", transition: "transform 300ms cubic-bezier(0,0,0.2,1)" }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* area_top_navigation */}
      <div className="relative flex items-center justify-center" style={{ height: 52 }}>
        <button type="button" onClick={onClose} aria-label="Close" className="absolute left-0 top-0 flex items-center justify-center" style={{ width: 52, height: 52 }}>
          <img src={d("edit_close")} alt="" draggable={false} style={{ width: 52, height: 52, filter: "brightness(0) saturate(100%) invert(10%)" }} />
        </button>
        <span style={{ fontSize: 15.5, fontWeight: 700, color: "#222222", lineHeight: "18px" }}>Discover</span>
      </div>
      {/* network_error_retry_view (layout_api_error_retry_view) */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center bg-white" style={{ top: 52 }}>
        {loading ? (
          <img src={d("icon_stampshop_loading")} alt="" className="spin-save" style={{ width: 30, height: 30 }} />
        ) : (
          <>
            <p className="text-center" style={{ fontSize: 15, lineHeight: "19px", color: "#b1b9be", marginBottom: 21, padding: "0 16px" }}>
              You are not connected to network. Please check your network settings and try again.
            </p>
            <button
              type="button"
              onClick={() => setLoading(true)}
              className="flex items-center text-white"
              style={{ fontSize: 13, lineHeight: "15px", background: "#b1b9be", borderRadius: 18, padding: "8.5px 24px 8.5px 21.5px" }}
            >
              <Img name="video_template_reset" size={53 / 3} style={{ marginRight: 4 }} />
              Retry
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/** EPStampAddFragment.T6: "There are more stickers!" above btn_stamp_shop (BalloonAlignment.Top). */
export function StampShopBalloon({ anchor, onClick }: { anchor: RefObject<HTMLElement | null>; onClick: () => void }) {
  return <TopBalloon anchor={anchor} text="There are more stickers!" onClick={onClick} />;
}
