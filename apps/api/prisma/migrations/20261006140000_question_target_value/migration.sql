-- A clarification question remembers the value its field held when the question was generated.
-- The model may fill a value and still ask about it (an uncertain inference); the person's explicit
-- answer may then replace that value, but only while it is unchanged, so a later manual edit always
-- wins. Existing rows keep NULL: they behave as before (an answer only fills an empty field).

-- AlterTable
ALTER TABLE "ClarificationQuestion" ADD COLUMN "targetValue" TEXT;

-- Only a question with a field has a value to remember.
ALTER TABLE "ClarificationQuestion" ADD CONSTRAINT "ClarificationQuestion_target_value_has_field_check"
  CHECK ("targetValue" IS NULL OR "field" IS NOT NULL);
