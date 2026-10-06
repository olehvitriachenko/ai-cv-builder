"use client";

import { FileText, Upload, X } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";
import { Button } from "@/shared/ui/button";
import { MAX_PDF_BYTES } from "@/features/cv-generation/model/create-form";

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface PdfUploadFieldProps {
  file: File | null;
  /** Client or server problem with the file (including the PDF extraction failure). */
  error?: string;
  onChange: (file: File | null) => void;
}

/** Figma "PDF dropzone" and "Uploaded file": dashed drop area, then a card for the chosen file. */
export function PdfUploadField({ file, error, onChange }: PdfUploadFieldProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const errorId = `${inputId}-error`;

  function choose(next: File | undefined) {
    if (next) {
      onChange(next);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    choose(event.dataTransfer.files[0]);
  }

  function remove() {
    onChange(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-3 rounded-lg border border-dashed border-accent-line p-6 text-center ${
          dragging ? "bg-accent-tint" : "bg-canvas"
        }`}
      >
        <Upload aria-hidden className="size-6 text-accent" strokeWidth={1.5} />
        <p className="text-sm leading-[normal] font-medium text-ink">
          <span className="sm:hidden">Upload your existing CV</span>
          <span className="hidden sm:inline">Drop your CV here, or browse files</span>
        </p>
        <p className="text-xs leading-[normal] text-muted">PDF only · Up to {MAX_PDF_BYTES / (1024 * 1024)} MB</p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => choose(event.target.files?.[0])}
        />
        <Button
          type="button"
          variant="secondary"
          size="compact"
          stretch={false}
          onClick={() => inputRef.current?.click()}
        >
          Choose PDF
        </Button>
      </div>

      {file ? (
        <div
          className={`flex items-center gap-3 rounded-lg border p-3 ${
            error ? "border-danger-wash-line bg-danger-wash" : "border-line bg-surface"
          }`}
        >
          <FileText
            aria-hidden
            className={`size-5 shrink-0 ${error ? "text-danger" : "text-accent"}`}
            strokeWidth={1.5}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="text-[13px] leading-[normal] font-medium break-words text-ink">{file.name}</p>
            <p id={errorId} className={`text-xs leading-[normal] ${error ? "text-danger" : "text-muted"}`}>
              {error ? <span className="sr-only">Error: </span> : null}
              {error ?? `${formatSize(file.size)} · Ready to generate`}
            </p>
          </div>
          <button
            type="button"
            onClick={remove}
            aria-label={`Remove ${file.name}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X aria-hidden className="size-4" strokeWidth={1.75} />
          </button>
        </div>
      ) : error ? (
        <p id={errorId} className="text-xs text-danger">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
