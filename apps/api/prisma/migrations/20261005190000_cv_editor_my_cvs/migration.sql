-- CV editor, clarifications and My CVs (feature 003).
--
-- 1. `Cv.revision`: optimistic-concurrency token, advanced only when the draft content changes.
-- 2. `QuestionStatus` becomes UNANSWERED / ANSWERED / APPLIED / DISMISSED. The enum is swapped
--    (instead of ALTER TYPE ... ADD VALUE) because the CHECK constraints below reference the new
--    values in this same migration, which ADD VALUE would not allow inside a transaction.
-- 3. `ClarificationQuestion.answer` and `.field` (the single plain value an answer fills).

-- CreateEnum
CREATE TYPE "QuestionField" AS ENUM ('CONTACT_FULL_NAME', 'CONTACT_EMAIL', 'CONTACT_PHONE', 'CONTACT_LOCATION', 'CONTACT_LINK', 'EXPERIENCE_EMPLOYER', 'EXPERIENCE_TITLE', 'EXPERIENCE_LOCATION', 'EXPERIENCE_START_DATE', 'EXPERIENCE_END_DATE', 'EDUCATION_INSTITUTION', 'EDUCATION_QUALIFICATION', 'EDUCATION_START_DATE', 'EDUCATION_END_DATE');

-- AlterEnum: OPEN -> UNANSWERED, RESOLVED -> APPLIED (002 produces no RESOLVED rows)
BEGIN;
CREATE TYPE "QuestionStatus_new" AS ENUM ('UNANSWERED', 'ANSWERED', 'APPLIED', 'DISMISSED');
ALTER TABLE "public"."ClarificationQuestion" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ClarificationQuestion" ALTER COLUMN "status" TYPE "QuestionStatus_new" USING (
  CASE "status"::text
    WHEN 'OPEN' THEN 'UNANSWERED'
    WHEN 'RESOLVED' THEN 'APPLIED'
  END
)::"QuestionStatus_new";
ALTER TYPE "QuestionStatus" RENAME TO "QuestionStatus_old";
ALTER TYPE "QuestionStatus_new" RENAME TO "QuestionStatus";
DROP TYPE "public"."QuestionStatus_old";
ALTER TABLE "ClarificationQuestion" ALTER COLUMN "status" SET DEFAULT 'UNANSWERED';
COMMIT;

-- AlterTable
ALTER TABLE "ClarificationQuestion" ADD COLUMN     "answer" TEXT,
ADD COLUMN     "field" "QuestionField";

-- AlterTable
ALTER TABLE "Cv" ADD COLUMN     "revision" INTEGER NOT NULL DEFAULT 0;

-- Invariants the service relies on (kept in the database as well as in the code).

-- The revision never goes negative.
ALTER TABLE "Cv" ADD CONSTRAINT "Cv_revision_check" CHECK ("revision" >= 0);

-- An answered question has its answer; an unanswered one has none. APPLIED and DISMISSED are not
-- constrained so that a pre-existing RESOLVED row (none is produced by 002) still migrates.
ALTER TABLE "ClarificationQuestion" ADD CONSTRAINT "ClarificationQuestion_answered_has_answer_check"
  CHECK ("status" <> 'ANSWERED' OR "answer" IS NOT NULL);
ALTER TABLE "ClarificationQuestion" ADD CONSTRAINT "ClarificationQuestion_unanswered_has_no_answer_check"
  CHECK ("status" <> 'UNANSWERED' OR "answer" IS NULL);
ALTER TABLE "ClarificationQuestion" ADD CONSTRAINT "ClarificationQuestion_answer_length_check"
  CHECK ("answer" IS NULL OR char_length("answer") <= 1000);

-- The field's prefix names the section it belongs to (CONTACT_EMAIL belongs to CONTACT).
ALTER TABLE "ClarificationQuestion" ADD CONSTRAINT "ClarificationQuestion_field_section_check"
  CHECK ("field" IS NULL OR left("field"::text, length("section"::text) + 1) = "section"::text || '_');
