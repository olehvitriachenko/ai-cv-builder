import { Document, Link, Page, StyleSheet, Text, View, type Styles } from '@react-pdf/renderer';
import type {
  CvDraft,
  EducationEntry,
  ExperienceEntry,
  SkillCategory,
} from '../../cv/generation/draft.schema.js';
import { educationStatus } from './education-status.js';
import { SANS, SERIF } from './cv-pdf.fonts.js';

/**
 * The one CV template. It mirrors the on-screen A4 preview (`cv-document.tsx` in the web app):
 * Lora body, Inter headings and meta text, thin rules, the same section order. Sizes are the
 * preview's px values scaled to points (the 660 px preview sheet is the 595 pt A4 page).
 * Facts the draft does not hold are left out; there is no placeholder text.
 */

const INK = '#29333e';
const MUTED = '#596470';
const RULE = '#e2e5eb';

/** Page margins in points; the tests rely on the side margin. */
export const SIDE_MARGIN = 49;

type Style = Styles[string];

const styles = StyleSheet.create({
  page: {
    paddingTop: 43,
    paddingBottom: 36,
    paddingHorizontal: SIDE_MARGIN,
    backgroundColor: '#ffffff',
    color: INK,
    fontFamily: SERIF,
    fontSize: 10.8,
  },
  header: { marginBottom: 22 },
  name: { fontFamily: SERIF, fontSize: 32.5, lineHeight: 1.2, fontWeight: 400, color: INK },
  role: {
    marginTop: 9,
    fontFamily: SANS,
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: 0.25,
    textTransform: 'uppercase',
    color: INK,
  },
  meta: { fontFamily: SANS, fontSize: 9, lineHeight: 1.8, color: MUTED },
  metaBlock: { marginTop: 9 },
  section: { marginBottom: 22 },
  sectionHeading: { marginBottom: 11 },
  sectionTitle: {
    fontFamily: SANS,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 0.25,
    textTransform: 'uppercase',
    color: INK,
  },
  rule: { marginTop: 6, borderBottomWidth: 0.75, borderBottomColor: RULE },
  body: { fontFamily: SERIF, fontSize: 10.8, lineHeight: 1.65, color: INK },
  skillLine: { marginTop: 4 },
  entry: { marginBottom: 14 },
  educationEntry: { marginBottom: 11 },
  // The section's own bottom margin separates it from the next section.
  lastEntry: { marginBottom: 0 },
  entryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  entryTitle: { fontFamily: SANS, fontSize: 10.8, fontWeight: 600, color: INK },
  educationTitle: { fontFamily: SANS, fontSize: 10, fontWeight: 600, color: INK },
  dates: { fontFamily: SANS, fontSize: 9, color: MUTED, marginLeft: 12 },
  company: { marginTop: 6, fontFamily: SERIF, fontStyle: 'italic', fontSize: 10.8, color: MUTED },
  subline: { marginTop: 4, fontFamily: SERIF, fontSize: 10.8, color: MUTED },
  // The mark is positioned absolutely so the text sits directly in a column box. A wrapping row of
  // chunks nested inside a flex row does not wrap in the renderer (the chunks overlap).
  bullet: { marginTop: 4.5, paddingLeft: 8 },
  bulletMark: {
    position: 'absolute',
    left: 0,
    top: 0,
    fontFamily: SERIF,
    fontSize: 10.8,
    lineHeight: 1.55,
  },
  bulletText: { fontFamily: SERIF, fontSize: 10.8, lineHeight: 1.55, color: INK },
});

function present(parts: (string | null)[]): string[] {
  return parts.filter((part): part is string => part !== null);
}

function dateRange(start: string | null, end: string | null): string | null {
  const parts = present([start, end]);
  return parts.length > 0 ? parts.join(' — ') : null;
}

/** Width of the text column: the A4 page minus the side margins, in points. */
const TEXT_WIDTH = 595.28 - 2 * SIDE_MARGIN;

/**
 * The renderer wraps text only at spaces and never splits a word, so a token wider than the line
 * (a long link) would run past the margin. A glyph is at most about 1 em wide, so a token of
 * `TEXT_WIDTH / fontSize` characters always fits a line. Longer tokens are laid out as chunks of
 * that size in a wrapping row instead; the text stays exactly as stored.
 */
function maxTokenLength(style: Style): number {
  const size = typeof style.fontSize === 'number' ? style.fontSize : 10.8;
  return Math.max(8, Math.floor(TEXT_WIDTH / size));
}

function hasLongToken(text: string, limit: number): boolean {
  return new RegExp(`\\S{${limit + 1},}`, 'u').test(text);
}

function chunks(word: string, limit: number): string[] {
  const characters = Array.from(word);
  const result: string[] = [];
  for (let index = 0; index < characters.length; index += limit) {
    result.push(characters.slice(index, index + limit).join(''));
  }
  return result;
}

/** Plain text, or the chunked layout when the text holds a token that cannot fit a line. */
function Prose({ text, style, href }: { text: string; style: Style; href?: string }) {
  const limit = maxTokenLength(style);
  if (!hasLongToken(text, limit)) {
    return href ? <Link src={href} style={{ ...style, textDecoration: 'underline' }}>{text}</Link> : <Text style={style}>{text}</Text>;
  }
  const words = text.split(/\s+/u).filter((word) => word.length > 0);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%' }}>
      {words.flatMap((word, wordIndex) => {
        const parts = chunks(word, limit);
        return parts.map((part, partIndex) => (
          href ? (
            <Link key={`${wordIndex}-${partIndex}`} src={href} style={{ ...style, flexShrink: 0, textDecoration: 'underline' }}>
              {partIndex === parts.length - 1 ? `${part} ` : part}
            </Link>
          ) : (
            <Text key={`${wordIndex}-${partIndex}`} style={{ ...style, flexShrink: 0 }}>
              {partIndex === parts.length - 1 ? `${part} ` : part}
            </Text>
          )
        ));
      })}
    </View>
  );
}

/** Retain the displayed source value; only safe web addresses receive a PDF link annotation. */
function webHref(value: string): string | undefined {
  const trimmed = value.trim();
  const candidate = /^https?:\/\//iu.test(trimmed)
    ? trimmed
    : /^[\w.-]+\.[a-z]{2,}(?:[/?#]|$)/iu.test(trimmed) ? `https://${trimmed}` : undefined;
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A section. When the lead (its first block of content) is small enough, the heading and the lead
 * form one unbreakable group, so a heading is never left alone at the bottom of a page.
 *
 * Never group content that can be taller than a page: the renderer cannot place such a block and
 * silently drops the part that does not fit (a 60-skill list lost its tail that way). Those leads
 * (`keepTogether={false}`) flow normally and the heading only asks for room ahead of it, which is
 * best effort.
 */
function Section({
  title,
  lead,
  children,
  keepTogether = true,
}: {
  title: string;
  lead: React.ReactNode;
  children?: React.ReactNode;
  keepTogether?: boolean;
}) {
  const heading = (
    <View style={styles.sectionHeading} minPresenceAhead={keepTogether ? undefined : 90}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.rule} />
    </View>
  );
  return (
    <View style={styles.section}>
      {keepTogether ? (
        <View wrap={false}>
          {heading}
          {lead}
        </View>
      ) : (
        <>
          {heading}
          {lead}
        </>
      )}
      {children}
    </View>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={styles.bullet} wrap={false}>
      <Text style={styles.bulletMark}>•</Text>
      <Prose text={text} style={styles.bulletText} />
    </View>
  );
}

/** The title row, the employer line and the first bullet: never parted by a page break. */
function ExperienceHead({ entry }: { entry: ExperienceEntry }) {
  const dates = dateRange(entry.startDate, entry.endDate);
  const company = present([entry.employer, entry.location]).join(' · ');
  const firstBullet = entry.bullets[0];
  return (
    <View wrap={false}>
      <View style={styles.entryHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Prose text={entry.title ?? entry.employer ?? ''} style={styles.entryTitle} />
        </View>
        {dates ? <Text style={styles.dates}>{dates}</Text> : null}
      </View>
      {entry.title !== null && company ? (
        <Prose text={company} style={styles.company} />
      ) : entry.title === null && entry.location ? (
        <Prose text={entry.location} style={styles.company} />
      ) : null}
      {firstBullet !== undefined ? <Bullet text={firstBullet} /> : null}
    </View>
  );
}

/** The remaining bullets, plus the space before the next entry (none after the last one). */
function ExperienceTail({ entry, last }: { entry: ExperienceEntry; last: boolean }) {
  return (
    <View style={last ? [styles.entry, styles.lastEntry] : styles.entry}>
      {entry.bullets.slice(1).map((bullet, index) => (
        <Bullet key={index} text={bullet} />
      ))}
    </View>
  );
}

function Education({ entry, last }: { entry: EducationEntry; last: boolean }) {
  const { studying, expected } = educationStatus(entry.endDate);
  const range = dateRange(entry.startDate, entry.endDate);
  const dates = range !== null && expected ? `${range} (expected)` : range;
  return (
    <View
      style={last ? [styles.educationEntry, styles.lastEntry] : styles.educationEntry}
      wrap={false}
    >
      <View style={styles.entryHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Prose
            text={entry.qualification ?? entry.institution ?? ''}
            style={styles.educationTitle}
          />
        </View>
        {dates ? <Text style={styles.dates}>{dates}</Text> : null}
      </View>
      {entry.qualification !== null && entry.institution ? (
        <Prose text={entry.institution} style={styles.subline} />
      ) : null}
      {entry.details ? <Prose text={entry.details} style={styles.subline} /> : null}
      {studying ? <Text style={styles.meta}>Currently studying</Text> : null}
    </View>
  );
}

/** A skills block longer than this (about seven lines) is not grouped with its heading; see `Section`. */
const MAX_GROUPED_SKILLS_LENGTH = 600;

/** The category the AI and the v1 migration use when nothing more specific applies. */
const DEFAULT_SKILLS_CATEGORY = 'Skills';

/**
 * One line of text per category that holds a skill. A lone default "Skills" category is printed
 * without its label: the section heading already says it (same rule as the on-screen preview).
 */
function skillLines(categories: SkillCategory[]): string[] {
  const filled = categories.filter((category) => category.skills.length > 0);
  const [only] = filled;
  const unlabelled =
    filled.length === 1 &&
    only !== undefined &&
    only.name.trim().toLowerCase() === DEFAULT_SKILLS_CATEGORY.toLowerCase();
  return filled.map((category) => {
    const list = category.skills.join(' · ');
    return unlabelled ? list : `${category.name}: ${list}`;
  });
}

export interface CvPdfDocumentProps {
  draft: CvDraft;
  targetRole: string;
}

export function CvPdfDocument({ draft, targetRole }: CvPdfDocumentProps) {
  const { contact } = draft;
  const contactLine = present([contact.location, contact.email, contact.phone]).join('  ·  ');
  const linksLine = contact.links.join('  ·  ');
  const [firstSkillLine, ...otherSkillLines] = skillLines(draft.skillCategories);
  const [firstExperience, ...otherExperience] = draft.experience;
  const [firstEducation, ...otherEducation] = draft.education;

  return (
    <Document title={contact.fullName ? `${contact.fullName} — ${targetRole}` : targetRole}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {contact.fullName ? <Prose text={contact.fullName} style={styles.name} /> : null}
          <Prose text={targetRole} style={styles.role} />
          {contactLine || linksLine ? (
            <View style={styles.metaBlock}>
              {contactLine ? (
                <View>
                  {contact.location ? <Prose text={contact.location} style={styles.meta} /> : null}
                  {contact.email ? <Prose text={contact.email} style={styles.meta} href={`mailto:${contact.email}`} /> : null}
                  {contact.phone ? <Prose text={contact.phone} style={styles.meta} href={`tel:${contact.phone.replace(/[^+\d]/gu, '')}`} /> : null}
                </View>
              ) : null}
              {linksLine ? (
                <View>
                  {contact.links.map((link, index) => (
                    <Prose key={index} text={link} style={styles.meta} href={webHref(link)} />
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {draft.summary ? (
          <Section title="Profile" lead={<Prose text={draft.summary} style={styles.body} />} />
        ) : null}

        {firstExperience ? (
          <Section title="Experience" lead={<ExperienceHead entry={firstExperience} />}>
            <ExperienceTail entry={firstExperience} last={otherExperience.length === 0} />
            {otherExperience.map((entry, index) => (
              <View key={entry.id}>
                <ExperienceHead entry={entry} />
                <ExperienceTail entry={entry} last={index === otherExperience.length - 1} />
              </View>
            ))}
          </Section>
        ) : null}

        {firstEducation ? (
          <Section
            title="Education"
            lead={<Education entry={firstEducation} last={otherEducation.length === 0} />}
          >
            {otherEducation.map((entry, index) => (
              <Education key={entry.id} entry={entry} last={index === otherEducation.length - 1} />
            ))}
          </Section>
        ) : null}

        {firstSkillLine !== undefined ? (
          <Section
            title="Skills"
            lead={<Prose text={firstSkillLine} style={styles.body} />}
            keepTogether={firstSkillLine.length <= MAX_GROUPED_SKILLS_LENGTH}
          >
            {otherSkillLines.map((line, index) => (
              <View key={index} style={styles.skillLine}>
                <Prose text={line} style={styles.body} />
              </View>
            ))}
          </Section>
        ) : null}
      </Page>
    </Document>
  );
}
