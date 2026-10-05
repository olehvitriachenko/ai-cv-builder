import { Document, Page, StyleSheet, Text, View, type Styles } from '@react-pdf/renderer';
import type { CvDraft, EducationEntry, ExperienceEntry } from '../../cv/generation/draft.schema.js';
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
  entry: { marginBottom: 14 },
  educationEntry: { marginBottom: 11 },
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
function Prose({ text, style }: { text: string; style: Style }) {
  const limit = maxTokenLength(style);
  if (!hasLongToken(text, limit)) {
    return <Text style={style}>{text}</Text>;
  }
  const words = text.split(/\s+/u).filter((word) => word.length > 0);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', width: '100%' }}>
      {words.flatMap((word, wordIndex) => {
        const parts = chunks(word, limit);
        return parts.map((part, partIndex) => (
          <Text key={`${wordIndex}-${partIndex}`} style={{ ...style, flexShrink: 0 }}>
            {partIndex === parts.length - 1 ? `${part} ` : part}
          </Text>
        ));
      })}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {/* Keeps the heading together with the start of its content: never alone at a page bottom. */}
      <View style={styles.sectionHeading} minPresenceAhead={60}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.rule} />
      </View>
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

function Experience({ entry }: { entry: ExperienceEntry }) {
  const dates = dateRange(entry.startDate, entry.endDate);
  const company = present([entry.employer, entry.location]).join(' · ');
  const [firstBullet, ...otherBullets] = entry.bullets;
  return (
    <View style={styles.entry}>
      {/* The title row and the first bullet never part across a page break. */}
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
      {otherBullets.map((bullet, index) => (
        <Bullet key={index} text={bullet} />
      ))}
    </View>
  );
}

function Education({ entry }: { entry: EducationEntry }) {
  const dates = dateRange(entry.startDate, entry.endDate);
  return (
    <View style={styles.educationEntry} wrap={false}>
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
    </View>
  );
}

export interface CvPdfDocumentProps {
  draft: CvDraft;
  targetRole: string;
}

export function CvPdfDocument({ draft, targetRole }: CvPdfDocumentProps) {
  const { contact } = draft;
  const contactLine = present([contact.location, contact.email, contact.phone]).join('  ·  ');
  const linksLine = contact.links.join('  ·  ');

  return (
    <Document title={contact.fullName ? `${contact.fullName} — ${targetRole}` : targetRole}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header} wrap={false}>
          {contact.fullName ? <Prose text={contact.fullName} style={styles.name} /> : null}
          <Prose text={targetRole} style={styles.role} />
          {contactLine || linksLine ? (
            <View style={styles.metaBlock}>
              {contactLine ? <Prose text={contactLine} style={styles.meta} /> : null}
              {linksLine ? <Prose text={linksLine} style={styles.meta} /> : null}
            </View>
          ) : null}
        </View>

        {draft.summary ? (
          <Section title="Profile">
            <Prose text={draft.summary} style={styles.body} />
          </Section>
        ) : null}

        {draft.experience.length > 0 ? (
          <Section title="Experience">
            {draft.experience.map((entry) => (
              <Experience key={entry.id} entry={entry} />
            ))}
          </Section>
        ) : null}

        {draft.education.length > 0 ? (
          <Section title="Education">
            {draft.education.map((entry) => (
              <Education key={entry.id} entry={entry} />
            ))}
          </Section>
        ) : null}

        {draft.skills.length > 0 ? (
          <Section title="Skills">
            <Prose text={draft.skills.join(' · ')} style={styles.body} />
          </Section>
        ) : null}
      </Page>
    </Document>
  );
}
