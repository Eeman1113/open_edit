import { Discover } from "@/components/discover/Discover";
import { CATEGORIES } from "@/components/discover/types";

export default function DiscoverPage() {
  return <Discover categories={CATEGORIES} />;
}
