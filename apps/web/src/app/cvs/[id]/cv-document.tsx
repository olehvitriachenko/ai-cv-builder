import type { ReactNode } from "react";
import type { CvDraft, EducationEntry, ExperienceEntry } from "@/lib/api/cvs";

// The A4 document surface from Figma 05.1: Lora body, Inter section headings, 1px rules, white
// sheet on a light stage. Read-only in this feature. Facts the source did not support are null
// and simply left out; the clarification questions explain what is missing.

function present(parts: (string | null)[]): string[] {
  return parts.filter((part): part is string => part !== null);
}

function dateRange(start: string | null, end: string | null): string | null {
  const parts = present([start, end]);
  return parts.length > 0 ? parts.join(" — ") : null;
}

function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-[7px]">
        <h3 className="text-[10px] font-semibold tracking-wide text-paper-ink uppercase">{title}</h3>
        <hr className="border-paper-rule" />
      </div>
      {children}
    </section>
  );
}

function Experience({ entry }: { entry: ExperienceEntry }) {
  const dates = dateRange(entry.startDate, entry.endDate);
  const company = present([entry.employer, entry.location]).join(" · ");
  return (
    <article className="flex flex-col gap-[7px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h4 className="text-xs font-semibold text-paper-ink">{entry.title ?? entry.employer}</h4>
        {dates ? <p className="text-[10px] text-paper-muted">{dates}</p> : null}
      </div>
      {entry.title !== null && company ? (
        <p className="font-serif text-xs text-paper-muted italic">{company}</p>
      ) : entry.title === null && entry.location ? (
        <p className="font-serif text-xs text-paper-muted italic">{entry.location}</p>
      ) : null}
      {entry.bullets.length > 0 ? (
        <ul className="flex flex-col gap-[5px] font-serif text-xs leading-[1.55] text-paper-ink">
          {entry.bullets.map((bullet, index) => (
            <li key={index} className="flex gap-[9px]">
              <span aria-hidden>•</span>
              <span className="min-w-0 flex-1 break-words">{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function Education({ entry }: { entry: EducationEntry }) {
  const dates = dateRange(entry.startDate, entry.endDate);
  return (
    <article className="flex flex-col gap-[5px]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h4 className="text-[11px] font-semibold text-paper-ink">
          {entry.qualification ?? entry.institution}
        </h4>
        {dates ? <p className="text-[10px] text-paper-muted">{dates}</p> : null}
      </div>
      {entry.qualification !== null && entry.institution ? (
        <p className="font-serif text-xs text-paper-muted">{entry.institution}</p>
      ) : null}
      {entry.details ? <p className="font-serif text-xs text-paper-muted">{entry.details}</p> : null}
    </article>
  );
}

/**
 * The white A4 sheet: at least A4-proportioned (the invisible spacer sets the height from the
 * width), and it grows when the content is longer. On narrow screens the text keeps its readable
 * size and the sheet gets taller instead of shrinking the page to an unreadable thumbnail.
 */
export function A4Sheet({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <article
      aria-label={label}
      className="grid w-full max-w-[660px] bg-surface text-paper-ink shadow-[0_8px_28px_rgba(40,51,71,0.08)]"
    >
      <div aria-hidden className="col-start-1 row-start-1 pb-[141.43%]" />
      <div className="col-start-1 row-start-1 min-w-0 px-5 pt-8 pb-8 sm:px-[54px] sm:pt-12 sm:pb-10">
        {children}
      </div>
    </article>
  );
}

export function CvDocument({ draft, targetRole }: { draft: CvDraft; targetRole: string }) {
  const { contact } = draft;
  const contactLine = present([contact.location, contact.email, contact.phone]).join("  ·  ");
  const linksLine = contact.links.join("  ·  ");

  return (
    <A4Sheet label="CV preview">
      <div className="flex flex-col gap-6">
        <header className="flex flex-col gap-2.5">
          <h2
            className={`font-serif text-[28px] leading-[1.2] font-normal break-words sm:text-4xl ${
              contact.fullName ? "text-paper-ink" : "text-paper-muted italic"
            }`}
          >
            {contact.fullName ?? "Name not provided"}
          </h2>
          <p className="text-[11px] font-medium tracking-wide break-words uppercase">{targetRole}</p>
          {contactLine || linksLine ? (
            <div className="text-[10px] leading-[1.8] break-words text-paper-muted">
              {contactLine ? <p>{contactLine}</p> : null}
              {linksLine ? <p>{linksLine}</p> : null}
            </div>
          ) : null}
        </header>

        {draft.summary ? (
          <DocSection title="Profile">
            <p className="font-serif text-xs leading-[1.65] break-words">{draft.summary}</p>
          </DocSection>
        ) : null}

        {draft.experience.length > 0 ? (
          <DocSection title="Experience">
            <div className="flex flex-col gap-4">
              {draft.experience.map((entry) => (
                <Experience key={entry.id} entry={entry} />
              ))}
            </div>
          </DocSection>
        ) : null}

        {draft.education.length > 0 ? (
          <DocSection title="Education">
            <div className="flex flex-col gap-3">
              {draft.education.map((entry) => (
                <Education key={entry.id} entry={entry} />
              ))}
            </div>
          </DocSection>
        ) : null}

        {draft.skills.length > 0 ? (
          <DocSection title="Skills">
            <p className="font-serif text-xs leading-[1.65] break-words">{draft.skills.join(" · ")}</p>
          </DocSection>
        ) : null}
      </div>
    </A4Sheet>
  );
}
