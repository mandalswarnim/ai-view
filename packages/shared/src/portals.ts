import { z } from "zod";

export const PortalSchema = z.enum(["rightmove", "zoopla", "onthemarket"]);
export type Portal = z.infer<typeof PortalSchema>;

export interface PortalInfo {
  name: string;
  /** Hostnames a listing page can be served from. */
  pageHosts: string[];
  /**
   * Hostname suffixes listing images are served from. The API refuses to
   * fetch an image from anywhere else, so a caller cannot use it to make our
   * server request arbitrary URLs.
   */
  imageHostSuffixes: string[];
}

export const PORTALS: Record<Portal, PortalInfo> = {
  rightmove: {
    name: "Rightmove",
    pageHosts: ["www.rightmove.co.uk"],
    imageHostSuffixes: ["rightmove.co.uk"],
  },
  zoopla: {
    name: "Zoopla",
    pageHosts: ["www.zoopla.co.uk"],
    imageHostSuffixes: ["zoocdn.com", "zoopla.co.uk"],
  },
  onthemarket: {
    name: "OnTheMarket",
    pageHosts: ["www.onthemarket.com"],
    imageHostSuffixes: ["onthemarket.com"],
  },
};

function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function isPortalPageUrl(portal: Portal, url: string): boolean {
  const host = hostOf(url);
  return host !== null && PORTALS[portal].pageHosts.includes(host);
}

export function isPortalImageUrl(portal: Portal, url: string): boolean {
  const host = hostOf(url);
  if (host === null) return false;
  return PORTALS[portal].imageHostSuffixes.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}
