/*
  Data decision (M1): existing "Cv" rows are development/test placeholders from the previous
  feature (no source text, no lifecycle). They are deleted so the new generation fields can be
  NOT NULL from the start. Legacy placeholder CVs are intentionally not preserved or backfilled.
  Cascades remove nothing else: "ClarificationQuestion" does not exist yet.
*/
DELETE FROM "Cv";

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('FREE_TEXT', 'PDF');

-- CreateEnum
CREATE TYPE "FailureReason" AS ENUM ('PROVIDER_UNAVAILABLE', 'PROVIDER_NOT_CONFIGURED', 'INVALID_OUTPUT', 'TIMED_OUT', 'INTERRUPTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "QuestionSection" AS ENUM ('CONTACT', 'SUMMARY', 'EXPERIENCE', 'EDUCATION', 'SKILLS');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterTable
ALTER TABLE "Cv" ADD COLUMN     "aiModel" TEXT,
ADD COLUMN     "draft" JSONB,
ADD COLUMN     "failureDetail" TEXT,
ADD COLUMN     "failureReason" "FailureReason",
ADD COLUMN     "finishedAt" TIMESTAMP(3),
ADD COLUMN     "generationAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "generationStatus" "GenerationStatus" NOT NULL,
ADD COLUMN     "processingStartedAt" TIMESTAMP(3),
ADD COLUMN     "promptVersion" TEXT,
ADD COLUMN     "sourceText" TEXT NOT NULL,
ADD COLUMN     "sourceType" "SourceType" NOT NULL,
ALTER COLUMN "targetRole" SET NOT NULL;

-- CreateTable
CREATE TABLE "ClarificationQuestion" (
    "id" TEXT NOT NULL,
    "cvId" TEXT NOT NULL,
    "section" "QuestionSection" NOT NULL,
    "itemId" TEXT,
    "missing" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'OPEN',
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClarificationQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClarificationQuestion_cvId_idx" ON "ClarificationQuestion"("cvId");

-- CreateIndex
CREATE INDEX "Cv_generationStatus_createdAt_idx" ON "Cv"("generationStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "ClarificationQuestion" ADD CONSTRAINT "ClarificationQuestion_cvId_fkey" FOREIGN KEY ("cvId") REFERENCES "Cv"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Lifecycle invariants (Prisma cannot express CHECK constraints).
-- A COMPLETED row has its draft, and only a COMPLETED row has one.
ALTER TABLE "Cv" ADD CONSTRAINT "Cv_completed_has_draft_check"
  CHECK (("generationStatus" = 'COMPLETED') = ("draft" IS NOT NULL));

-- A FAILED row has a failure reason, and only a FAILED row has one.
ALTER TABLE "Cv" ADD CONSTRAINT "Cv_failed_has_reason_check"
  CHECK (("generationStatus" = 'FAILED') = ("failureReason" IS NOT NULL));

-- A PROCESSING row records when it started, so the timeout sweep can always reach it.
ALTER TABLE "Cv" ADD CONSTRAINT "Cv_processing_has_start_check"
  CHECK ("generationStatus" <> 'PROCESSING' OR "processingStartedAt" IS NOT NULL);
