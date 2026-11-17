import type { SiteAdapter } from "@aiview/adapters";
import {
  CATEGORY_LABELS,
  CONFIDENCE_LABELS,
  CROSS_CHECK_LABELS,
  DISCLAIMER,
  DISCLOSURE_LABELS,
  PORTALS,
  STATUS_LABELS,
  STATUS_SUMMARIES,
  isPortalImageUrl,
  type Listing,
  type PhotoReport,
  type Report,
} from "@aiview/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browser } from "wxt/browser";
import { API_BASE_URL, type AnalyseMessage, type AnalyseReply, type PingMessage } from "../../lib/messages";

const COLLAPSED_KEY = "panelCollapsed";
const PING_MS = 20_000;

/**
 * Links are built here from the report's reference rather than taken from
 * the server's reply, and images are only shown from the portal's own hosts,
 * so a compromised or impostor server cannot put its own URLs on the page.
 */
function siteLink(path: string, cacheKey: string): string {
  return `${API_BASE_URL}${path}?ref=${encodeURIComponent(cacheKey)}`;
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

type View =
  | { state: "unreadable" }
  | { state: "looking" }
  | { state: "not_analysed" }
  | { state: "analysing" }
  | { state: "report"; report: Report }
  | { state: "error"; message: string; canRetry: boolean };

function ask(listing: Listing, cacheOnly: boolean): Promise<AnalyseReply> {
  const message: AnalyseMessage = { type: "aiview/analyse", listing, cacheOnly };
  return browser.runtime.sendMessage(message).then(
    (reply: AnalyseReply | undefined) =>
      reply ?? {
        ok: false as const,
        error: { code: "network" as const, message: "The extension did not respond. Reload the page." },
      },
    () => ({
      ok: false as const,
      error: { code: "network" as const, message: "The extension did not respond. Reload the page." },
    }),
  );
}

function readListing(adapter: SiteAdapter): Listing | null {
  try {
    return adapter.extract(document);
  } catch (error) {
    console.warn("[AI View]", error);
    return null;
  }
}

export function Panel({ adapter }: { adapter: SiteAdapter }) {
  const listing = useMemo(() => readListing(adapter), [adapter]);
  const [view, setView] = useState<View>(listing ? { state: "looking" } : { state: "unreadable" });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    void browser.storage.local.get(COLLAPSED_KEY).then((stored) => {
      if (stored[COLLAPSED_KEY] === true) setCollapsed(true);
    });
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      void browser.storage.local.set({ [COLLAPSED_KEY]: !current });
      return !current;
    });
  }, []);

  const showReply = useCallback((reply: AnalyseReply) => {
    if (reply.ok) {
      setView({ state: "report", report: reply.report });
    } else if (reply.error.code === "not_analysed") {
      setView({ state: "not_analysed" });
    } else {
      setView({
        state: "error",
        message: reply.error.message,
        canRetry: ["analysis_failed", "network", "not_configured"].includes(reply.error.code),
      });
    }
  }, []);

  // On page load only the cache is consulted. A new analysis starts when the user asks.
  useEffect(() => {
    if (listing === null) return;
    let cancelled = false;
    void ask(listing, true).then((reply) => {
      if (!cancelled) showReply(reply);
    });
    return () => {
      cancelled = true;
    };
  }, [listing, showReply]);

  const analyse = useCallback(() => {
    if (listing === null) return;
    setView({ state: "analysing" });
    const ping: PingMessage = { type: "aiview/ping" };
    const timer = setInterval(() => void browser.runtime.sendMessage(ping).catch(() => undefined), PING_MS);
    void ask(listing, false)
      .then(showReply)
      .finally(() => clearInterval(timer));
  }, [listing, showReply]);

  const statusClass = view.state === "report" ? `status-${view.report.status}` : "status-none";
  const pillText =
    view.state === "report"
      ? STATUS_LABELS[view.report.status]
      : view.state === "analysing"
        ? "Checking photos…"
        : "Check photos";

  if (collapsed) {
    return (
      <button type="button" className={`pill ${statusClass}`} onClick={toggle} aria-expanded={false}>
        <span className="dot" aria-hidden="true" />
        <span className="brand">AI View</span>
        <span>{pillText}</span>
      </button>
    );
  }

  return (
    <section className="panel" aria-label="AI View photo report">
      <header className="panel-header">
        <span className="brand">AI View</span>
        <button type="button" className="icon-button" onClick={toggle} aria-label="Minimise AI View">
          –
        </button>
      </header>

      <div className="panel-body">
        {view.state === "unreadable" && (
          <p className="note">
            AI View could not read this listing. {PORTALS[adapter.portal].name} may have changed its
            page layout.
          </p>
        )}

        {view.state === "looking" && <p className="note">Looking for a report…</p>}

        {view.state === "not_analysed" && listing && (
          <div className="prompt">
            <p>
              This listing has not been checked yet. AI View can look at its{" "}
              {Math.min(listing.photos.length, 20)} photo{listing.photos.length === 1 ? "" : "s"}
              {listing.floorPlans.length > 0 ? " and floor plan" : ""} for signs of AI editing.
            </p>
            <button type="button" className="primary" onClick={analyse} disabled={listing.photos.length === 0}>
              Check this listing
            </button>
            {listing.photos.length === 0 && <p className="note">No photos were found on this page.</p>}
          </div>
        )}

        {view.state === "analysing" && (
          <div className="prompt" role="status">
            <div className="spinner" aria-hidden="true" />
            <p>Checking the photos. This can take a minute or two.</p>
          </div>
        )}

        {view.state === "error" && (
          <div className="prompt" role="alert">
            <p>{view.message}</p>
            {view.canRetry && (
              <button type="button" className="primary" onClick={analyse}>
                Try again
              </button>
            )}
          </div>
        )}

        {view.state === "report" && <ReportView report={view.report} />}
      </div>

      <footer className="panel-footer">
        <p>{DISCLAIMER}</p>
        {view.state === "report" && (
          <a href={siteLink("/report-error", view.report.cacheKey)} target="_blank" rel="noreferrer">
            Report an error
          </a>
        )}
      </footer>
    </section>
  );
}

function ReportView({ report }: { report: Report }) {
  const withFindings = report.photos.filter((photo) => photo.findings.length > 0);
  const clearCount = report.photos.length - withFindings.length;
  const notAnalysed = report.photosTotal - report.photosAnalysed;

  return (
    <>
      <div className={`status status-${report.status}`}>
        <span className="dot" aria-hidden="true" />
        <div>
          <strong>{STATUS_LABELS[report.status]}</strong>
          <p>{STATUS_SUMMARIES[report.status]}</p>
        </div>
      </div>

      <h3>Disclosure</h3>
      <p>{DISCLOSURE_LABELS[report.disclosure.status]}.</p>
      {report.disclosure.matches.slice(0, 3).map((match, i) => (
        <blockquote key={i}>&ldquo;{match.excerpt}&rdquo;</blockquote>
      ))}

      <h3>Photos</h3>
      {withFindings.length === 0 && <p>No signs of editing were noted in the photos checked.</p>}
      <ul className="photos">
        {withFindings.map((photo) => (
          <PhotoFindings
            key={photo.index}
            photo={photo}
            showImage={isPortalImageUrl(report.portal, photo.url)}
          />
        ))}
      </ul>
      {withFindings.length > 0 && clearCount > 0 && (
        <p className="note">
          Nothing was noted in the other {clearCount} photo{clearCount === 1 ? "" : "s"} checked.
        </p>
      )}
      {notAnalysed > 0 && (
        <p className="note">
          {notAnalysed} of the listing&apos;s {report.photosTotal} photos were not checked.
        </p>
      )}

      {report.crossChecks.length > 0 && (
        <>
          <h3>Comparing photos and floor plan</h3>
          <ul className="checks">
            {report.crossChecks.map((check, i) => (
              <li key={i}>
                <div className="tags">
                  <span className="tag">{CROSS_CHECK_LABELS[check.type]}</span>
                  <span className="confidence">{CONFIDENCE_LABELS[check.confidence]}</span>
                </div>
                <p>{check.evidence}</p>
                {check.photoIndexes.length > 0 && (
                  <p className="note">
                    Photo{check.photoIndexes.length === 1 ? "" : "s"}{" "}
                    {check.photoIndexes.map((index) => index + 1).join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Photos from people who viewed</h3>
      {report.viewerPhotos.length === 0 ? (
        <p className="note">No viewer photos yet.</p>
      ) : (
        <ul className="viewer-photos">
          {report.viewerPhotos.filter((photo) => isHttps(photo.url)).map((photo) => (
            <li key={photo.id}>
              <img src={photo.url} alt="Photo taken at a viewing" loading="lazy" />
            </li>
          ))}
        </ul>
      )}
      <a
        className="secondary"
        href={siteLink("/viewed", report.cacheKey)}
        target="_blank"
        rel="noreferrer"
      >
        I viewed this property
      </a>
    </>
  );
}

function PhotoFindings({ photo, showImage }: { photo: PhotoReport; showImage: boolean }) {
  const title = `Photo ${photo.index + 1}${photo.caption ? ` · ${photo.caption}` : ""}`;
  return (
    <li className="photo">
      {showImage ? (
        <a href={photo.url} target="_blank" rel="noreferrer" className="thumb">
          <img src={photo.url} alt={title} loading="lazy" />
        </a>
      ) : (
        <span className="thumb" />
      )}
      <div>
        <p className="photo-title">{title}</p>
        {photo.findings.map((finding, i) => (
          <div key={i} className="finding">
            <div className="tags">
              <span className={`tag tag-${finding.category}`}>{CATEGORY_LABELS[finding.category]}</span>
              <span className="confidence">{CONFIDENCE_LABELS[finding.confidence]}</span>
            </div>
            <p>{finding.evidence}</p>
          </div>
        ))}
      </div>
    </li>
  );
}
