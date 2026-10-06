"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ComponentProps } from "react";
import { usePhone } from "@/shared/lib/use-phone";
import { SkillCategoryCard } from "./skill-category-card";

export function SortableSkillCategory({ dragging, disabled, ...props }: Omit<ComponentProps<typeof SkillCategoryCard>, "dragHandle" | "cornerHandle" | "motionEnabled"> & {
  dragging: boolean;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.category.id,
    disabled,
    transition: { duration: 180, easing: "ease-out" },
  });
  const phone = usePhone();
  // On a phone a long press anywhere on the card (not on a field or button) drags it; the handle
  // stays for the keyboard and shows only when it has focus. From sm up the handle is the only grip.
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      data-drag-handle
      {...attributes}
      {...listeners}
      disabled={disabled}
      aria-label={`Reorder category ${props.category.name}`}
      title="Drag to reorder. Keyboard: Space, arrows, Space; Esc to cancel."
      className={`flex shrink-0 touch-none items-center justify-center rounded-lg border border-line bg-surface text-muted hover:bg-accent-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:cursor-grab enabled:active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 ${phone ? "sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:top-2 focus-visible:left-3 focus-visible:z-10 focus-visible:h-9 focus-visible:w-11" : "size-11"}`}
    >
      <GripVertical aria-hidden className="size-[18px]" strokeWidth={1.75} />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      data-sortable-category
      // The phone's whole-card drag: only the touch listener, so typing and clicking inside are untouched.
      onTouchStart={phone && !disabled ? (event) => void listeners?.onTouchStart?.(event) : undefined}
      className={`relative min-w-0 ${isDragging ? "z-20 [&>section]:border-accent [&>section]:shadow-lg" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <SkillCategoryCard
        {...props}
        motionEnabled={!dragging}
        dragHandle={phone ? null : handle}
        cornerHandle={phone ? handle : null}
      />
    </div>
  );
}
