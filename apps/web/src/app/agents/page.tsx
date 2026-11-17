import { DISCLAIMER } from "@aiview/shared";
import type { Metadata } from "next";
import { contactEmail } from "@/lib/config";

export const metadata: Metadata = { title: "For estate agents · AI View" };

export default function AgentsPage() {
  const email = contactEmail();
  const mailto = `mailto:${email}?subject=${encodeURIComponent("Dispute a report")}`;

  return (
    <>
      <h1>For estate agents: how to dispute a report</h1>
      <p>
        AI View is a tool for home buyers and renters. It looks at the photos, floor plan and text
        of a listing the user has open and reports signs that are consistent with digital editing.
        It does not say that a listing or an agent has done anything wrong, and every report
        carries this notice: &ldquo;{DISCLAIMER}&rdquo;
      </p>

      <h2>What a report contains</h2>
      <ul>
        <li>
          Whether the listing text mentions digital editing, such as &ldquo;virtually
          staged&rdquo;, &ldquo;CGI&rdquo; or &ldquo;for illustrative purposes&rdquo;.
        </li>
        <li>
          For each photo, any observations, each with a sentence describing what is visible and a
          confidence level.
        </li>
        <li>Comparisons between photos of the same room, and between photos and the floor plan.</li>
      </ul>
      <p>
        The analysis is automated and works without the original photographs, so it will sometimes
        be wrong. We want to hear when it is.
      </p>

      <h2>Disputing a report</h2>
      <ol>
        <li>
          Email <a href={mailto}>{email}</a> from an address at your agency&apos;s domain.
        </li>
        <li>Include the listing link and say which observations you believe are wrong.</li>
        <li>
          If you can, attach the unedited photograph. Nothing settles a question faster. We use it
          only to review the report and do not publish it.
        </li>
      </ol>
      <p>
        A person reviews every dispute. While we look into it we can take the report down. If the
        report is wrong we correct or remove it, and we aim to reply within five working days.
      </p>

      <h2>Avoiding the question</h2>
      <p>
        Reports distinguish edits a listing discloses from ones it does not. If photos have been
        enhanced or virtually staged, saying so in the description or the photo caption means the
        report shows the listing as &ldquo;Enhanced and disclosed&rdquo;.
      </p>
    </>
  );
}
