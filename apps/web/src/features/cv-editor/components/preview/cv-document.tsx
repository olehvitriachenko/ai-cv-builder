import type { ReactNode } from "react";
import type { CertificationEntry, CvDraft, EducationEntry, ExperienceEntry, PortfolioEntry } from "@/entities/cv/schemas";
import { isCurrentlyStudying, isPresent } from "@/features/cv-editor/model/draft-form";
import { skillLines } from "@/features/cv-editor/lib/skill-lines";
import { certificationLine, contentLines, hobbiesLine, languagesLine } from "@/features/cv-editor/lib/optional-section-text";

// The A4 document surface from Figma 05.1: Lora body, Inter section headings, 1px rules, white
// sheet on a light stage. Read-only in this feature. Facts the source did not support are null
// and simply left out; the clarification questions explain what is missing.

function present(parts: (string | null)[]): string[] {
  return parts.filter((part): part is string => part !== null);
}

function dateRange(start: string | null, end: string | null): string | null {
  const parts = present([start, end]);
  return parts.length > 0 ? parts.join(" – ") : null;
}

/** "Document section heading" (Figma 05.1): a 10px label over a 1px rule; `gap` is the space below. */
function DocSection({ title, gap, children }: { title: string; gap: 10 | 12 | 14; children: ReactNode }) {
  return (
    <section className="flex flex-col" style={{ gap }}>
      <div className="flex flex-col gap-[7px]">
        <h3 className="text-[10px] leading-[normal] font-semibold text-paper-ink uppercase">{title}</h3>
        <hr className="border-line" />
      </div>
      {children}
    </section>
  );
}

function Experience({ entry }: { entry: ExperienceEntry }) {
  const dates = dateRange(entry.startDate, entry.endDate);
  const company = present([entry.employer, entry.location]).join(" · ");
  return (
    <article className="flex flex-col gap-2">
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
        <ul className="flex flex-col gap-2 text-xs text-paper-ink">
          {entry.bullets.map((bullet, index) => (
            <li key={index} className="flex gap-[9px]">
              <span aria-hidden>•</span>
              <span className="min-w-0 flex-1 font-serif leading-[1.65] break-words">{bullet}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

function Education({ entry }: { entry: EducationEntry }) {
  const studying = entry.endDate !== null && isCurrentlyStudying(entry.endDate);
  // A future end year is an expected graduation; "Present" is shown as it is.
  const expected = studying && entry.endDate !== null && !isPresent(entry.endDate);
  const range = dateRange(entry.startDate, entry.endDate);
  const dates = range !== null && expected ? `${range} (expected)` : range;
  return (
    <article className="flex flex-col gap-1.5 leading-[normal]">
      <div className="flex flex-wrap items-start justify-between gap-x-4">
        <h4 className="text-xs font-semibold text-paper-ink">{entry.qualification ?? entry.institution}</h4>
        {dates ? <p className="text-[10px] text-paper-muted">{dates}</p> : null}
      </div>
      {entry.qualification !== null && entry.institution ? (
        <p className="font-serif text-xs text-paper-muted">{entry.institution}</p>
      ) : null}
      {entry.details ? <p className="font-serif text-xs text-paper-muted">{entry.details}</p> : null}
      {studying ? <p className="text-[10px] text-paper-muted">Currently studying</p> : null}
    </article>
  );
}

/** A certification or a project: a bold name, a muted line, an optional link and description. */
function TitledEntry({ title, line, link, description }: { title: string; line?: string | null; link?: string | null; description?: string | null }) {
  return (
    <article className="flex flex-col gap-1.5 leading-[normal]">
      <h4 className="text-xs font-semibold break-words text-paper-ink">{title}</h4>
      {line ? <p className="font-serif text-xs break-words text-paper-muted">{line}</p> : null}
      {link ? <p className="font-serif text-xs break-all text-paper-muted">{link}</p> : null}
      {description ? <p className="font-serif text-xs break-words text-paper-muted">{description}</p> : null}
    </article>
  );
}

function CertificationItem({ entry }: { entry: CertificationEntry }) {
  return <TitledEntry title={entry.name} line={certificationLine(entry)} link={entry.link} />;
}

function PortfolioItem({ entry }: { entry: PortfolioEntry }) {
  return <TitledEntry title={entry.name} link={entry.link} description={entry.description} />;
}

/**
 * The white A4 sheet: at least A4-proportioned (the invisible spacer sets the height from the
 * width), and it grows when the content is longer. On narrow screens the text keeps its readable
 * size and the sheet gets taller instead of shrinking the page to an unreadable thumbnail.
 * `fixed` is the zoomable preview: always 660 px wide with the full margins, scaled from outside.
 */
export function A4Sheet({ children, label, fixed = false }: { children: ReactNode; label?: string; fixed?: boolean }) {
  return (
    <article
      aria-label={label}
      className={`grid bg-surface text-paper-ink shadow-[0_8px_28px_rgba(40,51,71,0.08)] ${
        fixed ? "w-[660px]" : "w-full max-w-[660px]"
      }`}
    >
      <div aria-hidden className="col-start-1 row-start-1 pb-[141.43%]" />
      <div
        className={`col-start-1 row-start-1 min-w-0 ${
          fixed ? "px-[54px] pt-12 pb-10" : "px-5 pt-8 pb-8 sm:px-[54px] sm:pt-12 sm:pb-10"
        }`}
      >
        {children}
      </div>
    </article>
  );
}

export function CvDocument({
  draft,
  targetRole,
  fixed = false,
}: {
  draft: CvDraft;
  targetRole: string;
  fixed?: boolean;
}) {
  const { contact } = draft;
  const contactLine = present([contact.location, contact.email, contact.phone]).join("  ·  ");
  const linksLine = contact.links.join("  ·  ");
  const skills = skillLines(draft.skillCategories);

  return (
    <A4Sheet label="CV preview" fixed={fixed}>
      <div className="flex flex-col gap-[26px]">
        <header className="flex flex-col gap-2.5">
          <h2
            className={`font-serif text-[28px] leading-[1.2] font-normal break-words sm:text-4xl ${
              contact.fullName ? "text-paper-ink" : "text-paper-muted italic"
            }`}
          >
            {contact.fullName ?? "Name not provided"}
          </h2>
          <p className="text-[11px] leading-[normal] font-medium break-words uppercase">{targetRole}</p>
          {contactLine || linksLine ? (
            <div className="text-[9.5px] leading-[1.8] break-words text-paper-muted">
              {contactLine ? <p>{contactLine}</p> : null}
              {linksLine ? <p>{linksLine}</p> : null}
            </div>
          ) : null}
        </header>

        {draft.summary ? (
          <DocSection title="Profile" gap={10}>
            <p className="font-serif text-xs leading-[1.65] break-words">{draft.summary}</p>
          </DocSection>
        ) : null}

        {draft.experience.length > 0 ? (
          <DocSection title="Experience" gap={14}>
            <div className="flex flex-col gap-4">
              {draft.experience.map((entry) => (
                <Experience key={entry.id} entry={entry} />
              ))}
            </div>
          </DocSection>
        ) : null}

        {draft.education.length > 0 ? (
          <DocSection title="Education" gap={12}>
            <div className="flex flex-col gap-3">
              {draft.education.map((entry) => (
                <Education key={entry.id} entry={entry} />
              ))}
            </div>
          </DocSection>
        ) : null}

        {skills.length > 0 ? (
          <DocSection title="Skills" gap={10}>
            <div className="flex flex-col gap-1">
              {skills.map((line, index) => (
                <p key={index} className="font-serif text-xs leading-[1.65] break-words">
                  {line.label !== null ? <span className="font-sans font-semibold">{line.label}: </span> : null}
                  {line.skills.join(" · ")}
                </p>
              ))}
            </div>
          </DocSection>
        ) : null}

        {draft.certifications.length > 0 ? (
          <DocSection title="Certifications" gap={12}>
            <div className="flex flex-col gap-3">
              {draft.certifications.map((entry) => (
                <CertificationItem key={entry.id} entry={entry} />
              ))}
            </div>
          </DocSection>
        ) : null}

        {draft.languages.length > 0 ? (
          <DocSection title="Languages" gap={10}>
            <p className="font-serif text-xs leading-[1.65] break-words">{languagesLine(draft.languages)}</p>
          </DocSection>
        ) : null}

        {draft.portfolio.length > 0 ? (
          <DocSection title="Portfolio" gap={12}>
            <div className="flex flex-col gap-3">
              {draft.portfolio.map((entry) => (
                <PortfolioItem key={entry.id} entry={entry} />
              ))}
            </div>
          </DocSection>
        ) : null}

        {draft.hobbies.length > 0 ? (
          <DocSection title="Hobbies" gap={10}>
            <p className="font-serif text-xs leading-[1.65] break-words">{hobbiesLine(draft.hobbies)}</p>
          </DocSection>
        ) : null}

        {draft.customSections.map((section) => (
          <DocSection key={section.id} title={section.title} gap={10}>
            <div className="flex flex-col gap-1">
              {contentLines(section).map((line, index) => (
                <p key={index} className="font-serif text-xs leading-[1.65] break-words">
                  {line}
                </p>
              ))}
            </div>
          </DocSection>
        ))}
      </div>
    </A4Sheet>
  );
}
