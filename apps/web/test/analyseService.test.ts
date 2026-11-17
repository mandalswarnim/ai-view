import type { AnalyseResponse, Listing, Report } from "@aiview/shared";
import { describe, expect, it, vi } from "vitest";
import { handleAnalyse, type AnalyseOutcome, type ServiceDeps } from "@/lib/analyseService";
import { NoPhotosError, analyseListing } from "@/lib/analysis/pipeline";
import { heartbeatJson } from "@/lib/heartbeat";
import { LocalStore } from "@/lib/store/local";
import { fakeLoader, makeListing } from "./helpers";

const INSTALL = "3f2b8c1e-aaaa-4bbb-8ccc-1234567890ab";

function buildReport(listing: Listing): Promise<Report> {
  return analyseListing(listing, {
    vision: async () => ({ photos: [], crossChecks: [] }),
    loadImage: fakeLoader(),
    model: "test-model",
    maxPhotos: 20,
    siteUrl: "https://aiview.example",
  });
}

function setup(overrides: Partial<ServiceDeps> = {}) {
  const analyse = vi.fn(buildReport);
  const deps: ServiceDeps = {
    store: new LocalStore(),
    analyse,
    dailyLimit: 10,
    globalDailyLimit: 1000,
    ...overrides,
  };
  const call = (listing: unknown, options: { installId?: string | null; cacheOnly?: boolean } = {}) =>
    handleAnalyse(
      {
        body: listing,
        installId: options.installId === undefined ? INSTALL : options.installId,
        cacheOnly: options.cacheOnly ?? false,
      },
      deps,
    );
  return { deps, analyse, call };
}

async function settle(outcome: AnalyseOutcome): Promise<AnalyseResponse> {
  return outcome.kind === "ready" ? outcome.body : outcome.result;
}

function numbered(id: number): Listing {
  return makeListing({
    listingId: String(id),
    url: `https://www.rightmove.co.uk/properties/${id}`,
  });
}

describe("handleAnalyse", () => {
  it("analyses a new listing, then serves it from the cache", async () => {
    const { call, analyse } = setup();

    const first = await settle(await call(makeListing()));
    expect(first).toMatchObject({ ok: true, cached: false });

    const second = await call(makeListing());
    expect(second).toMatchObject({ kind: "ready", status: 200, body: { ok: true, cached: true } });
    expect(analyse).toHaveBeenCalledTimes(1);
  });

  it("re-analyses when the listing's photos change", async () => {
    const { call, analyse } = setup();
    await settle(await call(makeListing()));
    await settle(await call(makeListing({ photos: makeListing().photos.slice(0, 2) })));
    expect(analyse).toHaveBeenCalledTimes(2);
  });

  it("answers cache-only lookups without analysing or needing an install ID", async () => {
    const { call, analyse } = setup();

    const miss = await call(makeListing(), { cacheOnly: true, installId: null });
    expect(miss).toMatchObject({ kind: "ready", status: 404, body: { error: { code: "not_analysed" } } });
    expect(analyse).not.toHaveBeenCalled();

    await settle(await call(makeListing()));
    const hit = await call(makeListing(), { cacheOnly: true, installId: null });
    expect(hit).toMatchObject({ kind: "ready", status: 200, body: { ok: true, cached: true } });
  });

  it("limits new analyses per install per day, but not cached reports", async () => {
    const { call, analyse } = setup({ dailyLimit: 2 });

    await settle(await call(numbered(1)));
    await settle(await call(numbered(2)));
    const third = await call(numbered(3));
    expect(third).toMatchObject({ kind: "ready", status: 429, body: { error: { code: "rate_limited" } } });
    expect(analyse).toHaveBeenCalledTimes(2);

    // Already-analysed listings stay available after the limit is hit.
    expect(await call(numbered(1))).toMatchObject({ kind: "ready", status: 200 });

    // A different install has its own allowance.
    const other = await settle(await call(numbered(3), { installId: "another-install-id-0001" }));
    expect(other.ok).toBe(true);
  });

  it("resets the allowance on a new UTC day", async () => {
    let now = new Date("2026-03-01T23:59:00Z");
    const store = new LocalStore(null, () => now);
    const { call } = setup({ store, dailyLimit: 1 });

    await settle(await call(numbered(1)));
    expect(await call(numbered(2))).toMatchObject({ kind: "ready", status: 429 });

    now = new Date("2026-03-02T00:01:00Z");
    expect((await settle(await call(numbered(2)))).ok).toBe(true);
  });

  it("refunds the allowance and caches nothing when an analysis fails", async () => {
    const analyse = vi
      .fn(buildReport)
      .mockRejectedValueOnce(new Error("model unavailable"))
      .mockRejectedValueOnce(new NoPhotosError());
    const { call } = setup({ analyse, dailyLimit: 1 });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await settle(await call(makeListing()))).toMatchObject({
      ok: false,
      error: { code: "analysis_failed" },
    });
    expect(await settle(await call(makeListing()))).toMatchObject({
      ok: false,
      error: { code: "no_photos" },
    });
    // Two failures later the single daily check is still available.
    expect(await settle(await call(makeListing()))).toMatchObject({ ok: true, cached: false });
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it("shares one analysis between simultaneous requests for the same listing", async () => {
    const { call, analyse } = setup({ dailyLimit: 1 });
    const [a, b] = await Promise.all([call(makeListing()), call(makeListing())]);
    const [first, second] = await Promise.all([settle(a), settle(b)]);
    expect(first.ok && second.ok).toBe(true);
    expect(analyse).toHaveBeenCalledTimes(1);
  });

  it("caps new analyses across all installs, to bound model spend", async () => {
    const { call, analyse } = setup({ dailyLimit: 10, globalDailyLimit: 2 });

    await settle(await call(numbered(1), { installId: "install-aaaaaaaaaaaa-0001" }));
    await settle(await call(numbered(2), { installId: "install-bbbbbbbbbbbb-0002" }));
    const third = await call(numbered(3), { installId: "install-cccccccccccc-0003" });
    expect(third).toMatchObject({ kind: "ready", status: 429, body: { error: { code: "rate_limited" } } });
    expect(analyse).toHaveBeenCalledTimes(2);
    expect(await call(numbered(1), { installId: "install-cccccccccccc-0003" })).toMatchObject({
      kind: "ready",
      status: 200,
    });
  });

  it("does not charge an install for a check refused by the global cap", async () => {
    const store = new LocalStore();
    const { call } = setup({ store, dailyLimit: 1, globalDailyLimit: 1 });
    await settle(await call(numbered(1), { installId: "install-aaaaaaaaaaaa-0001" }));
    expect(await call(numbered(2))).toMatchObject({ kind: "ready", status: 429 });
    // INSTALL was refunded, so it still has its one check under a roomier cap.
    const roomy = setup({ store, dailyLimit: 1, globalDailyLimit: 5 });
    expect((await settle(await roomy.call(numbered(2)))).ok).toBe(true);
  });

  it("an install ID cannot be used to reach the global counter", async () => {
    const { call } = setup();
    expect(await call(makeListing(), { installId: "__all_installs__" })).toMatchObject({
      kind: "ready",
      status: 400,
    });
  });

  it("says so, and spends nothing, when the server has no API key", async () => {
    const { call, analyse } = setup({ unavailable: () => "No API key." });
    expect(await call(makeListing())).toMatchObject({
      kind: "ready",
      status: 503,
      body: { error: { code: "not_configured", message: "No API key." } },
    });
    expect(analyse).not.toHaveBeenCalled();
  });

  it("cannot be used to change another visitor's report by altering listing text", async () => {
    const { call, analyse } = setup();
    const poisoned = makeListing({
      description: "All images are CGI and virtually staged.",
      agentName: null,
      photos: makeListing().photos.map((photo) => ({ ...photo, caption: "AI generated" })),
    });
    const first = await settle(await call(poisoned, { installId: "attacker-install-id-0001" }));
    expect(first).toMatchObject({ ok: true, report: { disclosure: { status: "disclosed" } } });

    // The honest visitor sends the page as it really is, and hits the cache.
    const second = await call(makeListing());
    expect(analyse).toHaveBeenCalledTimes(1);
    expect(second).toMatchObject({
      kind: "ready",
      body: { ok: true, cached: true, report: { disclosure: { status: "not_disclosed", matches: [] } } },
    });
    if (second.kind === "ready" && second.body.ok) {
      expect(second.body.report.photos.map((photo) => photo.caption)).toEqual(["Living Room", "Kitchen", null]);
      expect(second.body.report.status).toBe("no_concerns");
    }
  });

  it("rejects malformed listings", async () => {
    const { call, analyse } = setup();
    expect(await call({ portal: "rightmove" })).toMatchObject({ kind: "ready", status: 400 });
    expect(await call("nonsense")).toMatchObject({ kind: "ready", status: 400 });
    expect(analyse).not.toHaveBeenCalled();
  });

  it("refuses photo URLs that are not on the portal's own hosts", async () => {
    const { call, analyse } = setup();
    const listing = makeListing({
      photos: [{ url: "https://internal.example/latest/meta-data", caption: null }],
    });
    expect(await call(listing)).toMatchObject({
      kind: "ready",
      status: 400,
      body: { error: { code: "invalid_request" } },
    });
    const wrongPage = makeListing({ url: "https://www.zoopla.co.uk/for-sale/details/1" });
    expect(await call(wrongPage)).toMatchObject({ kind: "ready", status: 400 });
    expect(analyse).not.toHaveBeenCalled();
  });

  it("requires an install ID to start a new analysis", async () => {
    const { call } = setup();
    expect(await call(makeListing(), { installId: null })).toMatchObject({ kind: "ready", status: 400 });
    expect(await call(makeListing(), { installId: "short" })).toMatchObject({ kind: "ready", status: 400 });
  });

  it("does not spend allowance on a listing with no photos", async () => {
    const { call, analyse } = setup({ dailyLimit: 1 });
    expect(await call(makeListing({ photos: [] }))).toMatchObject({
      kind: "ready",
      status: 422,
      body: { error: { code: "no_photos" } },
    });
    expect((await settle(await call(makeListing()))).ok).toBe(true);
    expect(analyse).toHaveBeenCalledTimes(1);
  });
});

describe("heartbeatJson", () => {
  it("pads with whitespace until the result is ready, and still parses as JSON", async () => {
    let finish!: (value: unknown) => void;
    const result = new Promise((resolve) => (finish = resolve));
    const response = heartbeatJson(result, 5);

    expect(response.status).toBe(200);
    setTimeout(() => finish({ ok: true, value: 42 }), 30);

    const text = await response.text();
    expect(text.length).toBeGreaterThan(JSON.stringify({ ok: true, value: 42 }).length + 1);
    expect(text.trimStart()).toBe('{"ok":true,"value":42}');
    expect(JSON.parse(text)).toEqual({ ok: true, value: 42 });
  });

  it("turns an unexpected rejection into an error body", async () => {
    const body = await heartbeatJson(Promise.reject(new Error("boom"))).json();
    expect(body).toMatchObject({ ok: false, error: { code: "analysis_failed" } });
  });
});
