import type { Metadata } from "next";
import Link from "next/link";
import { contactEmail } from "@/lib/config";

export const metadata: Metadata = { title: "Report an error · AI View" };

export default async function ReportErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string | string[] }>;
}) {
  const { ref } = await searchParams;
  const reference = typeof ref === "string" ? ref.slice(0, 200) : null;
  const email = contactEmail();

  const subject = reference ? `Report error: ${reference}` : "Report error";
  const body =
    `Report reference: ${reference ?? "(please paste the listing link)"}\n\n` +
    "What is wrong with the report?\n\n";
  const mailto = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <>
      <h1>Report an error</h1>
      <p>
        AI View&apos;s reports are produced automatically and can be wrong. If a report describes
        something that is not in the photo, or misses a disclosure that is in the listing, tell us
        and a person will review it.
      </p>

      <div className="card">
        {reference ? (
          <p>
            Report reference: <code>{reference}</code>
          </p>
        ) : (
          <p>Include a link to the listing so we can find the report.</p>
        )}
        <p>
          <a className="button" href={mailto}>
            Email us about this report
          </a>
        </p>
        <p className="muted">
          Or write to <a href={`mailto:${email}`}>{email}</a> and quote the reference above.
        </p>
      </div>

      <h2>What happens next</h2>
      <p>
        A person looks at the report and the listing photos. If the report is wrong we correct or
        remove it.
      </p>
      <p>
        If you are the agent or owner for this listing, see{" "}
        <Link href="/agents">how to dispute a report</Link>.
      </p>
    </>
  );
}
