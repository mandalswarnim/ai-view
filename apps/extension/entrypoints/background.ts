import {
  AnalyseResponseSchema,
  CACHE_ONLY_PARAM,
  INSTALL_ID_HEADER,
  ListingSchema,
} from "@aiview/shared";
import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";
import { API_BASE_URL, type AnalyseMessage, type AnalyseReply, type ExtensionMessage } from "../lib/messages";

const INSTALL_ID_KEY = "installId";

/** A random ID created on first use. It identifies this install only, for rate limiting. */
async function installId(): Promise<string> {
  const stored = await browser.storage.local.get(INSTALL_ID_KEY);
  const existing = stored[INSTALL_ID_KEY];
  if (typeof existing === "string") return existing;
  const created = crypto.randomUUID();
  await browser.storage.local.set({ [INSTALL_ID_KEY]: created });
  return created;
}

async function analyse(message: AnalyseMessage): Promise<AnalyseReply> {
  const listing = ListingSchema.safeParse(message.listing);
  if (!listing.success) {
    return { ok: false, error: { code: "invalid_request", message: "The listing could not be read." } };
  }

  try {
    const url = new URL(`${API_BASE_URL}/api/analyse`);
    if (message.cacheOnly) url.searchParams.set(CACHE_ONLY_PARAM, "1");

    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", [INSTALL_ID_HEADER]: await installId() },
      body: JSON.stringify(listing.data),
    });
    const reply = AnalyseResponseSchema.safeParse(await response.json());
    if (reply.success) return reply.data;
    return { ok: false, error: { code: "network", message: "The AI View service sent an unexpected reply." } };
  } catch {
    return { ok: false, error: { code: "network", message: "The AI View service could not be reached." } };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    // Only this extension's own content scripts may use the API through us.
    if (sender.id !== browser.runtime.id) return;
    if (message?.type === "aiview/ping") return;
    if (message?.type !== "aiview/analyse") return;

    void analyse(message).then(sendResponse);
    return true; // keep the channel open for the async reply
  });
});
