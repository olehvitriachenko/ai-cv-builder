"use client";

import { useLayoutEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { TextareaField } from "@/shared/ui/field";
import type { DraftFormValues } from "@/features/cv-editor/model/draft-form";
import { MARKER, bulletsToText, insertBulletBreak, removeEmptyBullet, textToBullets } from "@/features/cv-editor/lib/highlights-text";

/**
 * The highlights of one role (Figma "Field / Highlights / Bullet list"): a single text field with
 * one highlight per line, each starting with a bullet. Enter starts the next bullet, Backspace on
 * an empty bullet removes it, and the lines are the role's `bullets` in the draft (empty lines are
 * ignored). The field keeps its own text while typing, so a bullet that is still empty stays on
 * screen; it is tidied when the field loses focus.
 */
export function Highlights({ experienceIndex }: { experienceIndex: number }) {
  const { control, setValue, formState } = useFormContext<DraftFormValues>();
  const bullets = useWatch({ control, name: `experience.${experienceIndex}.bullets` });
  const [text, setText] = useState(() => bulletsToText(bullets.map((bullet) => bullet.value)));
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<number | null>(null);
  const id = useId();

  const errors = formState.errors.experience?.[experienceIndex]?.bullets;
  const itemMessage = Array.isArray(errors) ? errors.find((item) => item?.value?.message)?.value?.message : undefined;
  const error = errors?.message ?? itemMessage;

  // Auto-grow, and put the caret where an edit left it (setting the value moves it to the end).
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) {
      return;
    }
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
    if (caret.current !== null) {
      element.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  }, [text]);

  function change(next: string, nextCaret: number | null = null) {
    caret.current = nextCaret;
    setText(next);
    setValue(
      `experience.${experienceIndex}.bullets`,
      textToBullets(next).map((value) => ({ value })),
      { shouldDirty: true, shouldValidate: true },
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) {
      return;
    }
    const { selectionStart, selectionEnd, value } = event.currentTarget;
    if (event.key === "Enter") {
      event.preventDefault();
      const edit = insertBulletBreak(value, selectionStart, selectionEnd);
      change(edit.text, edit.caret);
    } else if (event.key === "Backspace" && selectionStart === selectionEnd) {
      const edit = removeEmptyBullet(value, selectionStart);
      if (edit !== null) {
        event.preventDefault();
        change(edit.text, edit.caret);
      }
    }
  }

  return (
    <TextareaField
      ref={ref}
      id={id}
      label="Highlights"
      rows={3}
      placeholder={`${MARKER}Add a highlight`}
      hint="Press Enter to add a bullet."
      error={error}
      value={text}
      onChange={(event) => change(event.target.value)}
      onKeyDown={onKeyDown}
      onFocus={() => {
        // The first bullet is there to type after, so Enter works from the start.
        if (text === "") {
          change(MARKER, MARKER.length);
        }
      }}
      onBlur={() => {
        const tidy = bulletsToText(textToBullets(text));
        if (tidy !== text) {
          setText(tidy);
        }
      }}
      className="overflow-hidden"
    />
  );
}
