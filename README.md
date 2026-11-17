# AI View

Tells UK home buyers and renters when the photos on a property listing show
signs of AI editing, and whether the listing says so.

**Status: side project, paused after phase 1 of 5.** It is not launched and
has never been run against a real model.

What works:

- Shared schemas, and `POST /api/analyse` with caching, a disclosure check
  and per-install rate limiting.
- A Rightmove adapter, tested against a real saved listing page.
- A Chrome extension panel that shows the report on a listing page.
- A script for measuring accuracy over a folder of test listings.

Not built: Zoopla and OnTheMarket adapters, the mobile PWA, viewer photo
uploads, payments, landing page and privacy policy.

Open questions, in the order they matter:

1. **Accuracy is unmeasured.** Spotting AI edits in a photo with no "before"
   image is unreliable for any model. Nobody should rely on a report until
   the accuracy script has been run on listings where the truth is known.
2. The extension panel has not been loaded on a live listing page, and the
   Supabase store has not been run against a real project.
3. The server downloads listing photos from the portal's image CDN to
   downscale them. A portal could block that or object to it.

## Layout

```
packages/shared      zod schemas and types: Listing, Report, API envelope, UI labels
packages/adapters    one SiteAdapter per portal (matches(url), extract(document))
apps/web             Next.js: /api/analyse, report-error and agent dispute pages
apps/extension       Chrome extension (WXT, Manifest V3, React panel in a shadow root)
fixtures/            saved listing pages for adapter tests; test listings for accuracy
supabase/migrations  SQL for the report cache and rate-limit tables
```

## Setup

Needs Node 20.12 or newer.

```bash
corepack enable            # once, makes the pinned pnpm available
pnpm install
cp .env.example apps/web/.env.local
```

Then edit `apps/web/.env.local`:

- `ANTHROPIC_API_KEY` is required for real analyses.
- `ANTHROPIC_MODEL` picks the vision model (default `claude-opus-5-5`).
- Leave the Supabase values empty for local development. Reports and
  rate-limit counters are then kept in `apps/web/.data/store.json`.
- To try everything without an API key or any model cost, add
  `AIVIEW_MOCK_VISION=1`. Reports then contain one placeholder finding and
  are labelled with the model name `mock`.

If `corepack enable` is not allowed on your machine, prefix commands with
`corepack` instead (`corepack pnpm install`).

### Supabase (needed before deploying)

Create a project, run `supabase/migrations/0001_core.sql` in its SQL editor,
and put the project URL and service-role key in `apps/web/.env.local`.

## Run the web app and API

```bash
pnpm dev:web               # http://localhost:3000
```

`POST /api/analyse` takes a `Listing` as JSON and returns
`{ ok: true, report, cached }` or `{ ok: false, error: { code, message } }`.

- Send the anonymous install ID in the `x-install-id` header. It is only
  needed when a new analysis has to run.
- Add `?cacheOnly=1` to get the cached report or a `not_analysed` error
  without ever starting an analysis.
- A new analysis takes a minute or two. The response is a `200` that is
  padded with whitespace until the result is ready, so clients must check
  `ok` in the body. Errors known up front (bad request, rate limit) use
  normal status codes.

## Load the unpacked extension

```bash
pnpm dev:web               # in one terminal
pnpm dev:extension         # in another: builds, opens Chrome with it loaded, reloads on change
```

Or build it and load it by hand, which is the same on Windows and Mac:

```bash
pnpm build:extension
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose `apps/extension/.output/chrome-mv3`.
3. Open a listing at `https://www.rightmove.co.uk/properties/...`.

The panel appears at the bottom right. It shows a cached report straight
away if one exists; otherwise it offers **Check this listing**, which starts
an analysis and counts against the daily allowance.

The extension calls the API at `WXT_API_BASE_URL` (default
`http://localhost:3000`). To point it elsewhere, create
`apps/extension/.env.local` with that variable and rebuild. That origin is
also the extension's only host permission besides the portal pages.

## Accuracy script

Runs the real analysis over a folder of test listings and prints a table.
It bypasses the cache and the rate limit, so **every listing is one paid
model call** unless `--mock` is given.

```bash
pnpm accuracy fixtures/accuracy              # real model
pnpm accuracy fixtures/accuracy --mock       # no model call, checks the plumbing
pnpm accuracy path/to/folder --out accuracy-results.json   # also save full reports
pnpm accuracy fixtures/accuracy --only kitchen             # names starting with "kitchen"
```

Each test listing in the folder is either:

- `name.json`: a `Listing`. Photo and floor plan URLs may be paths relative
  to the folder, so you can test with image files you know were (or were
  not) edited. See `fixtures/accuracy/example-placeholder.json`.
- `name.html`: a saved listing page, read with the portal adapters. Its
  photos are fetched from the portal.

Add `name.expected.json` to score a listing. All fields are optional:

```json
{
  "status": "possible_structural_or_concealment",
  "disclosure": "not_disclosed",
  "categories": ["structural"]
}
```

`status` is one of `no_concerns`, `enhanced_disclosed`,
`enhanced_not_disclosed`, `possible_structural_or_concealment`. `categories`
lists finding categories the report must contain at medium confidence or
above. The script exits non-zero if any scored listing fails.

## Tests

```bash
pnpm test                  # all packages
pnpm typecheck
```

No test calls the vision API; the model is replaced by a stub.

Adapter tests read `fixtures/<portal>/*.html`. Every file in the folder is
checked for a valid listing with at least one photo, so dropping a saved
page into `fixtures/rightmove/` adds a test. Only the hand-written
`synthetic-*.html` fixtures are committed: real saved pages are another
site's copyrighted content, so they are git-ignored and stay on your machine.
Tests that need a specific real page skip themselves when it is absent.

## How a report is produced

1. **Cache.** The key is `portal:listingId:hash(sorted photo URLs)`. A
   listing is analysed once; changing its photos gives a new key.
2. **Disclosure check** (no AI). The description, key features and photo
   captions are searched for wording such as "virtually staged", "CGI",
   "digitally enhanced", "AI" and "for illustrative purposes".
3. **Vision analysis.** Up to 20 photos (1024px longest edge) and up to 2
   floor plans are sent to the model in one call, using structured outputs.
   Each finding has a category, one sentence of evidence and a confidence.
4. **Status, derived in code** (`apps/web/src/lib/analysis/status.ts`).
   Only findings of medium or high confidence count:
   - a structural or concealment finding, or a mismatch between photos or
     with the floor plan: *Possible structural or concealment edits*
   - any other finding, or a disclosure in the listing text: *Enhanced and
     disclosed* or *Enhanced, not disclosed*
   - otherwise: *No concerns found*

   Low-confidence findings are shown but do not change the status.
   Wide-angle distortion is reported and never changes the status.
5. **Wording check.** Evidence that uses accusatory words or names the
   agent is replaced with a neutral sentence before it is stored.

## Data

Stored: listing metadata, photo URLs, reports, and per-install daily
counters. Portal images are downloaded into memory to be downscaled and sent
to the model, and are never saved. The extension reads only the listing page
that is open, and stores an anonymous install ID and whether the panel is
minimised.
