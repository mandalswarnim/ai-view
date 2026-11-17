import { rightmoveAdapter } from "./rightmove";
import type { SiteAdapter } from "./types";

export { rightmoveAdapter } from "./rightmove";
export { ListingExtractionError, type SiteAdapter } from "./types";

/** Every portal we can read. Zoopla and OnTheMarket join in phase 2. */
export const adapters: SiteAdapter[] = [rightmoveAdapter];

export function findAdapter(url: string): SiteAdapter | undefined {
  return adapters.find((adapter) => adapter.matches(url));
}
