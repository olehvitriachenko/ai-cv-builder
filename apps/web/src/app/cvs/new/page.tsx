import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NewCvForm } from "./new-cv-form";

export const metadata: Metadata = { title: "Create your CV · AI CV Builder" };

const STEPS = ["Add information", "Review & edit", "Export PDF"] as const;

export default function NewCvPage() {
  return (
    <div className="mx-auto flex w-full max-w-[848px] flex-1 flex-col gap-6 px-6 pt-8 pb-12">
      <Link
        href="/cvs"
        className="flex w-fit items-center gap-2 rounded text-[13px] leading-[normal] text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
      >
        <ArrowLeft aria-hidden className="size-4" strokeWidth={1.75} />
        {/* Figma shows "My CVs"; the full name stays available to assistive technology. */}
        <span className="sr-only">Back to </span>My CVs
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-[30px] leading-[1.21] font-semibold text-ink">Create your CV</h1>
        <p className="text-sm leading-[1.6] text-muted">
          Bring your experience. We’ll help shape the first draft.
        </p>
      </div>

      <ol className="grid grid-cols-3 gap-2 sm:gap-6" aria-label="Steps">
        {STEPS.map((step, index) => {
          const current = index === 0;
          return (
            <li
              key={step}
              aria-current={current ? "step" : undefined}
              className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  current ? "bg-accent text-white" : "bg-line text-muted"
                }`}
              >
                {index + 1}
              </span>
              <span
                className={`text-[11px] leading-[normal] sm:text-[13px] ${
                  current ? "font-semibold text-accent" : "text-muted"
                }`}
              >
                {step}
              </span>
            </li>
          );
        })}
      </ol>

      <NewCvForm />
    </div>
  );
}
