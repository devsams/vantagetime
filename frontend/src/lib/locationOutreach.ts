// Deterministic email template for a location owner/contact — not
// agent-drafted, unlike cast outreach. A location request is a short,
// formulaic ask ("can we film here on these dates?"), so a fixed
// template kept the flow fast and predictable instead of adding a
// round-trip to an LLM for something this simple. The filmmaker can
// still edit the subject/body freely before sending — see
// AutopilotSection.tsx.
export function draftLocationEmail(
  projectName: string,
  locationName: string,
  contactName: string,
  dateLabel: string
): { subject: string; body: string } {
  const greeting = contactName.trim() ? `Hi ${contactName.trim()},` : "Hi,";
  const subject = `Filming request — ${locationName} — ${projectName}`;
  const body = `${greeting}

We're producing a short film called "${projectName}" and would like to film at ${locationName}${
    dateLabel ? ` on ${dateLabel}` : ""
  }.

Could you confirm whether the location is available${dateLabel ? " on those dates" : ""}, and let us know about any access, parking, noise, or permit requirements we should plan around?

Happy to answer any questions.

Thanks,
${projectName} production team`;
  return { subject, body };
}
