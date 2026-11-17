import type { SiteAdapter } from "@aiview/adapters";
import { DISCLAIMER, type Listing, type Report } from "@aiview/shared";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyseMessage, AnalyseReply } from "../lib/messages";

// The panel talks to the background worker through the extension API. Here
// that API is replaced, so no network and no model are involved.
const sendMessage = vi.fn<(message: { type: string }) => Promise<AnalyseReply | undefined>>();
vi.mock("wxt/browser", () => ({
  browser: {
    runtime: { sendMessage: (message: { type: string }) => sendMessage(message) },
    storage: { local: { get: async () => ({}), set: async () => undefined } },
  },
}));

const { Panel } = await import("../entrypoints/content/Panel");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const listing: Listing = {
  portal: "rightmove",
  listingId: "123",
  url: "https://www.rightmove.co.uk/properties/123",
  address: "Example Road",
  agentName: "Example Estates",
  description: "A house.",
  keyFeatures: [],
  photos: [
    { url: "https://media.rightmove.co.uk/a/1.jpeg", caption: "Lounge" },
    { url: "https://media.rightmove.co.uk/a/2.jpeg", caption: null },
  ],
  floorPlans: [],
};

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    schemaVersion: 1,
    cacheKey: "rightmove:123:abc",
    portal: "rightmove",
    listingId: "123",
    listingUrl: listing.url,
    status: "enhanced_not_disclosed",
    disclosure: { status: "not_disclosed", matches: [] },
    photos: [
      {
        index: 0,
        url: listing.photos[0]!.url,
        caption: "Lounge",
        findings: [{ category: "staging", evidence: "The sofa has no shadow.", confidence: "medium" }],
      },
      { index: 1, url: listing.photos[1]!.url, caption: null, findings: [] },
    ],
    crossChecks: [],
    photosTotal: 2,
    photosAnalysed: 2,
    floorPlansAnalysed: 0,
    viewerPhotos: [],
    disclaimer: DISCLAIMER,
    reportErrorUrl: "https://evil.example/phish",
    model: "test",
    analysedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const adapter: SiteAdapter = { portal: "rightmove", matches: () => true, extract: () => listing };

let host: HTMLElement;
let root: Root;

async function render(panelAdapter: SiteAdapter = adapter): Promise<void> {
  await act(async () => {
    root.render(<Panel adapter={panelAdapter} />);
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  if (!found) throw new Error(`No button "${label}" in: ${host.textContent}`);
  return found;
}

beforeEach(() => {
  sendMessage.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("Panel", () => {
  it("shows a cached report without starting an analysis", async () => {
    sendMessage.mockResolvedValue({ ok: true, report: makeReport(), cached: true });
    await render();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect((sendMessage.mock.calls[0]![0] as AnalyseMessage).cacheOnly).toBe(true);
    expect(host.textContent).toContain("Enhanced, not disclosed");
    expect(host.textContent).toContain("The sofa has no shadow.");
    expect(host.textContent).toContain("Photo 1 · Lounge");
    expect(host.textContent).toContain("Nothing was noted in the other 1 photo checked.");
  });

  it("only analyses a new listing when the user asks", async () => {
    let finish!: (reply: AnalyseReply) => void;
    sendMessage
      .mockResolvedValueOnce({ ok: false, error: { code: "not_analysed", message: "" } })
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    await render();

    expect(host.textContent).toContain("has not been checked yet");
    expect(sendMessage).toHaveBeenCalledTimes(1);

    await act(async () => button("Check this listing").click());
    expect((sendMessage.mock.calls[1]![0] as AnalyseMessage).cacheOnly).toBe(false);
    expect(host.textContent).toContain("Checking the photos");

    await act(async () => finish({ ok: true, report: makeReport({ status: "no_concerns", photos: [] }), cached: false }));
    expect(host.textContent).toContain("No concerns found");
  });

  it("always shows the disclaimer and a report-an-error link to our own site", async () => {
    sendMessage.mockResolvedValue({ ok: true, report: makeReport(), cached: true });
    await render();

    expect(host.textContent).toContain(DISCLAIMER);
    const link = [...host.querySelectorAll("a")].find((a) => a.textContent === "Report an error")!;
    // Built from the report reference, not taken from the server's reply.
    expect(link.getAttribute("href")).toBe(
      "http://localhost:3000/report-error?ref=rightmove%3A123%3Aabc",
    );
    expect(host.innerHTML).not.toContain("evil.example");
  });

  it("never renders image or link URLs that are not on the portal's hosts", async () => {
    const hostile = makeReport();
    hostile.photos[0]!.url = "javascript:alert(1)";
    hostile.photos[1] = {
      index: 1,
      url: "https://tracker.example/pixel.gif",
      caption: null,
      findings: [{ category: "cosmetic", evidence: "The sky is flat.", confidence: "low" }],
    };
    hostile.viewerPhotos = [{ id: "v1", url: "http://insecure.example/a.jpg", uploadedAt: "2026-01-01" }];
    sendMessage.mockResolvedValue({ ok: true, report: hostile, cached: true });
    await render();

    expect(host.textContent).toContain("The sky is flat.");
    expect(host.innerHTML).not.toMatch(/javascript:|tracker\.example|insecure\.example/);
    expect(host.querySelectorAll("img")).toHaveLength(0);
  });

  it("explains a server with no API key", async () => {
    sendMessage
      .mockResolvedValueOnce({ ok: false, error: { code: "not_analysed", message: "" } })
      .mockResolvedValueOnce({ ok: false, error: { code: "not_configured", message: "This server has no Anthropic API key." } });
    await render();
    await act(async () => button("Check this listing").click());
    expect(host.textContent).toContain("This server has no Anthropic API key.");
  });

  it("says so when the page cannot be read, and asks the server nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await render({
      ...adapter,
      extract: () => {
        throw new Error("no data");
      },
    });
    expect(host.textContent).toContain("could not read this listing");
    expect(sendMessage).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("recovers when the background worker does not answer", async () => {
    sendMessage.mockResolvedValueOnce(undefined);
    await render();
    expect(host.textContent).toContain("The extension did not respond");
  });
});
