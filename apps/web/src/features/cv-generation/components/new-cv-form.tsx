"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Sparkles, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { TextField, TextareaField } from "@/shared/ui/field";
import { ApiError } from "@/shared/api/fetcher";
import { createCvFromText, uploadCvPdf } from "@/features/cv-generation/api";
import {
  createCvFormSchema,
  type CreateCvFormValues,
  type SourceMode,
} from "@/features/cv-generation/model/create-form";
import { PdfUploadField } from "./pdf-upload-field";

const FIELD_ERROR_KEYS = ["targetRole", "sourceText", "file"] as const;

function ModeButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border p-3 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active
          ? "border-accent bg-accent-tint font-semibold text-accent"
          : "border-line bg-surface text-muted hover:bg-canvas"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export function NewCvForm() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting, isSubmitted },
  } = useForm<CreateCvFormValues>({
    resolver: zodResolver(createCvFormSchema),
    defaultValues: { mode: "pdf", targetRole: "", sourceText: "", file: null },
  });

  const mode = useWatch({ control, name: "mode" });
  const issueCount =
    (errors.targetRole ? 1 : 0) + (mode === "text" ? (errors.sourceText ? 1 : 0) : errors.file ? 1 : 0);

  function selectMode(next: SourceMode) {
    setFormError(null);
    clearErrors(["sourceText", "file"]);
    setValue("mode", next);
  }

  async function onSubmit(values: CreateCvFormValues) {
    setFormError(null);
    try {
      // Exactly one source goes to the API: the active mode's, never both.
      const created =
        values.mode === "text"
          ? await createCvFromText({ targetRole: values.targetRole.trim(), sourceText: values.sourceText.trim() })
          : await uploadCvPdf({ targetRole: values.targetRole.trim(), file: requiredFile(values.file) });
      router.push(`/cvs/${created.id}`);
    } catch (error) {
      handleError(error, values.mode);
    }
  }

  function handleError(error: unknown, activeMode: SourceMode) {
    if (!(error instanceof ApiError)) {
      setFormError("Something went wrong. Please try again.");
      return;
    }
    if (error.status === 401) {
      router.replace("/login");
      return;
    }
    // A PDF that cannot be read is an input problem: no CV exists and we stay on the form.
    if (error.status === 422 && error.code === "PDF_EXTRACTION_FAILED") {
      setError("file", { type: "server", message: error.message });
      return;
    }
    if (error.status === 400 && error.fieldErrors) {
      let mapped = false;
      for (const key of FIELD_ERROR_KEYS) {
        const message = error.fieldErrors[key]?.[0];
        if (message) {
          setError(key, { type: "server", message });
          mapped = true;
        }
      }
      const sourceMessage = error.fieldErrors.source?.[0];
      if (sourceMessage) {
        setError(activeMode === "text" ? "sourceText" : "file", { type: "server", message: sourceMessage });
        mapped = true;
      }
      if (mapped) {
        return;
      }
    }
    setFormError("Something went wrong. Please try again.");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Card className="flex flex-col gap-8 p-6 sm:p-8">
        <section className="flex flex-col gap-4">
          <h2 className="text-base leading-[normal] font-semibold text-ink">What role are you targeting?</h2>
          <TextField
            label="Target role"
            placeholder="e.g. Senior Frontend Engineer"
            hint="We’ll tailor the structure and wording to this role."
            autoComplete="off"
            error={errors.targetRole?.message}
            {...register("targetRole")}
          />
        </section>

        <hr className="border-line" />

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="text-base leading-[normal] font-semibold text-ink">Tell us about your experience</h2>
            <p className="text-[13px] leading-normal text-muted">Choose one way to get started.</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <ModeButton
              active={mode === "pdf"}
              onClick={() => selectMode("pdf")}
              icon={<Upload aria-hidden className="size-4" strokeWidth={1.75} />}
            >
              Upload PDF
            </ModeButton>
            <ModeButton
              active={mode === "text"}
              onClick={() => selectMode("text")}
              icon={<Pencil aria-hidden className="size-4" strokeWidth={1.75} />}
            >
              Enter background manually
            </ModeButton>
          </div>

          {mode === "text" ? (
            <TextareaField
              label="Your background"
              placeholder="Roles, dates, achievements, education and skills…"
              hint="Include roles, dates, achievements, education and skills. Plain text is perfect."
              className="min-h-[300px]"
              error={errors.sourceText?.message}
              {...register("sourceText")}
            />
          ) : (
            <Controller
              control={control}
              name="file"
              render={({ field }) => (
                <PdfUploadField
                  file={field.value}
                  error={errors.file?.message}
                  onChange={(file) => {
                    field.onChange(file);
                    clearErrors("file");
                  }}
                />
              )}
            />
          )}
        </section>

        <div className="flex items-start gap-3 rounded-lg bg-accent-tint p-4">
          <Sparkles aria-hidden className="mt-0.5 size-[18px] shrink-0 text-accent" strokeWidth={1.5} />
          <p className="text-[13px] leading-[1.6] text-ink">
            AI creates an editable draft and may ask a few follow-up questions for missing
            details. You’re in control of every field.
          </p>
        </div>

        {formError ? (
          <p role="alert" className="rounded-lg bg-danger-tint p-3 text-[13px] text-danger">
            <span className="font-medium">Error: </span>
            {formError}
          </p>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row-reverse sm:items-center sm:justify-between">
          <Button type="submit" disabled={isSubmitting}>
            <Sparkles aria-hidden className="size-4" strokeWidth={1.75} />
            {isSubmitting ? "Creating…" : "Generate CV"}
          </Button>
          {isSubmitted && issueCount > 0 ? (
            <p role="alert" className="text-xs text-danger">
              Fix {issueCount} {issueCount === 1 ? "issue" : "issues"} to continue.
            </p>
          ) : (
            <p className="text-xs text-muted">Usually takes about a minute.</p>
          )}
        </div>
      </Card>
    </form>
  );
}

/** The schema guarantees a file in PDF mode; this narrows the type without a cast. */
function requiredFile(file: File | null): File {
  if (file === null) {
    throw new Error("A PDF file is required");
  }
  return file;
}
