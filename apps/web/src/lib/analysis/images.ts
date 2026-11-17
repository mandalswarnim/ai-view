import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import type { PreparedImage } from "./modelOutput";

/** Longest edge sent to the model. Photos need less detail than floor plan text. */
export const PHOTO_MAX_EDGE = 1024;
export const FLOOR_PLAN_MAX_EDGE = 1568;

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 25 * 1024 * 1024;

export type ImageLoader = (url: string) => Promise<Buffer>;

/** Downloads one image into memory. Nothing is written to disk or stored. */
export const fetchImage: ImageLoader = async (url) => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "error",
    headers: { accept: "image/*" },
  });
  if (!response.ok) throw new Error(`Image request returned ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("Image is too large");
  return bytes;
};

/** Loader for the accuracy script, which also accepts file: URLs. */
export const fetchOrReadImage: ImageLoader = (url) =>
  url.startsWith("file:") ? readFile(fileURLToPath(url)) : fetchImage(url);

export async function downscale(bytes: Buffer, maxEdge: number): Promise<string> {
  const output = await sharp(bytes)
    .rotate() // apply EXIF orientation before the metadata is dropped
    .flatten({ background: "#ffffff" })
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return output.toString("base64");
}

/**
 * Loads and downscales a list of images, a few at a time. An image that
 * cannot be loaded or decoded is left out rather than failing the listing.
 */
export async function prepareImages(
  images: readonly { url: string; caption: string | null }[],
  maxEdge: number,
  loadImage: ImageLoader,
  concurrency = 5,
): Promise<PreparedImage[]> {
  const prepared: (PreparedImage | null)[] = new Array(images.length).fill(null);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < images.length) {
      const index = next++;
      const image = images[index]!;
      try {
        const base64 = await downscale(await loadImage(image.url), maxEdge);
        prepared[index] = { index, caption: image.caption, mediaType: "image/jpeg", base64 };
      } catch (error) {
        console.warn(`[analysis] skipped image ${index + 1}: ${(error as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, images.length) }, worker));
  return prepared.filter((image): image is PreparedImage => image !== null);
}
