/* --------------------------------------------------------------------------
   POL-FE-99 — the way to a person, at the foot of every help page: the help
   desk form (POL-FE-43), signed in, with the way back to this page.
   -------------------------------------------------------------------------- */

export function HelpContact({ back }: { back: string }) {
  return (
    <section className="hc-contact" aria-labelledby="hc-contact-h">
      <span className="hc-contact-orb" aria-hidden="true" />
      <div>
        <h2 id="hc-contact-h">Still stuck?</h2>
        <p>Tell BTG what you were trying to do. You can attach a screenshot, and BTG replies by email.</p>
      </div>
      <a className="hc-contact-btn" href={`/contact?back=${encodeURIComponent(back)}`}>
        Message BTG
        <span aria-hidden="true">→</span>
      </a>
    </section>
  );
}
