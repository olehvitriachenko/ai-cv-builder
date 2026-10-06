-- Feature 005: stored CV drafts move from schemaVersion 1 (flat "skills" list) to schemaVersion 2
-- ("skillCategories": [{ id, name, skills[] }]).
--
-- One-time data migration. After it runs the application reads and writes only version 2; there is
-- no runtime conversion. It is safe to re-run: version 2 drafts and rows without a draft
-- (PENDING / PROCESSING / FAILED) are never touched.
--
-- Flat skills become ONE category named "Skills" with the fixed id "skills-default". Blank
-- entries are dropped and case-insensitive duplicates are collapsed (first spelling and order win).
-- No skills at all becomes an empty "skillCategories". "revision" and "updatedAt" are left alone:
-- the migration is a storage-format change, not a user edit, so it must not cause a stale-write
-- conflict in an editor that is open or reorder My CVs.

-- Refuse to guess about rows this migration does not understand. Messages carry counts only,
-- never draft content.
DO $$
DECLARE
  not_object integer;
  unknown_version integer;
  bad_skills integer;
BEGIN
  SELECT count(*) INTO not_object
    FROM "Cv" WHERE "draft" IS NOT NULL AND jsonb_typeof("draft") <> 'object';
  IF not_object > 0 THEN
    RAISE EXCEPTION 'draft_skill_categories: % CV draft(s) are not JSON objects', not_object;
  END IF;

  SELECT count(*) INTO unknown_version
    FROM "Cv" WHERE "draft" IS NOT NULL AND COALESCE("draft" ->> 'schemaVersion', '') NOT IN ('1', '2');
  IF unknown_version > 0 THEN
    RAISE EXCEPTION 'draft_skill_categories: % CV draft(s) have an unknown schemaVersion', unknown_version;
  END IF;

  SELECT count(*) INTO bad_skills
    FROM "Cv"
    WHERE "draft" ->> 'schemaVersion' = '1'
      AND jsonb_typeof("draft" -> 'skills') IS DISTINCT FROM 'array';
  IF bad_skills > 0 THEN
    RAISE EXCEPTION 'draft_skill_categories: % version 1 draft(s) have no skills array', bad_skills;
  END IF;

  SELECT count(*) INTO bad_skills
    FROM "Cv" c, jsonb_array_elements(c."draft" -> 'skills') AS item
    WHERE c."draft" ->> 'schemaVersion' = '1' AND jsonb_typeof(item) <> 'string';
  IF bad_skills > 0 THEN
    RAISE EXCEPTION 'draft_skill_categories: % version 1 skill(s) are not strings', bad_skills;
  END IF;
END
$$;

UPDATE "Cv" AS c
SET "draft" = (c."draft" - 'skills') || jsonb_build_object(
  'schemaVersion', 2,
  'skillCategories', (
    SELECT CASE
      WHEN count(*) = 0 THEN '[]'::jsonb
      ELSE jsonb_build_array(jsonb_build_object(
        'id', 'skills-default',
        'name', 'Skills',
        'skills', jsonb_agg(d.skill ORDER BY d.position)
      ))
    END
    FROM (
      SELECT DISTINCT ON (lower(btrim(t.value))) btrim(t.value) AS skill, t.position
      FROM jsonb_array_elements_text(c."draft" -> 'skills') WITH ORDINALITY AS t(value, position)
      WHERE btrim(t.value) <> ''
      ORDER BY lower(btrim(t.value)), t.position
    ) AS d
  )
)
WHERE c."draft" ->> 'schemaVersion' = '1';

-- A stored draft is either absent (NULL: not generated yet, or failed) or a version 2 object.
-- NULL passes a CHECK, so the generation lifecycle ("draft" IS NOT NULL only when COMPLETED) is
-- unaffected; the COALESCE keeps a draft without "schemaVersion" from slipping through as NULL.
ALTER TABLE "Cv" DROP CONSTRAINT IF EXISTS "Cv_draft_schema_version_check";
ALTER TABLE "Cv" ADD CONSTRAINT "Cv_draft_schema_version_check"
  CHECK ("draft" IS NULL OR (jsonb_typeof("draft") = 'object' AND COALESCE("draft" ->> 'schemaVersion', '') = '2'));
