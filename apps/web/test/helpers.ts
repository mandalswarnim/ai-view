import type { Listing } from "@aiview/shared";
import sharp from "sharp";
import type { ImageLoader } from "@/lib/analysis/images";

export function makeListing(overrides: Partial<Listing> = {}): Listing {
  return {
    portal: "rightmove",
    listingId: "123456789",
    url: "https://www.rightmove.co.uk/properties/123456789",
    address: "Example Road, Leeds, LS6",
    agentName: "Example Estates, Leeds",
    description: "A bright three bedroom terrace close to the park.",
    keyFeatures: ["Three bedrooms", "South-facing garden"],
    photos: [
      { url: "https://media.rightmove.co.uk/a/IMG_00.jpeg", caption: "Living Room" },
      { url: "https://media.rightmove.co.uk/a/IMG_01.jpeg", caption: "Kitchen" },
      { url: "https://media.rightmove.co.uk/a/IMG_02.jpeg", caption: null },
    ],
    floorPlans: [{ url: "https://media.rightmove.co.uk/a/FLP_00.jpeg", caption: "Floorplan" }],
    ...overrides,
  };
}

/** A real, decodable image so the downscaling step runs for real in tests. */
export async function tinyImage(width = 40, height = 30): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 180, b: 160 } },
  })
    .png()
    .toBuffer();
}

/** Serves the same tiny image for every URL except those listed as broken. */
export function fakeLoader(broken: string[] = []): ImageLoader & { calls: string[] } {
  const calls: string[] = [];
  const loader = async (url: string) => {
    calls.push(url);
    if (broken.includes(url)) throw new Error("404");
    return tinyImage();
  };
  return Object.assign(loader, { calls });
}
