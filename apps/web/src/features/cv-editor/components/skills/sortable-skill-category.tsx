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
  // One handle, so one drag activator: in the top-left corner on a phone, beside the trash button otherwise.
  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      disabled={disabled}
      aria-label={`Reorder category ${props.category.name}`}
      title="Drag to reorder. Keyboard: Space, arrows, Space; Esc to cancel."
      className={`flex shrink-0 touch-none items-center justify-center rounded-lg border border-line bg-surface text-muted hover:bg-accent-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:cursor-grab enabled:active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40 ${phone ? "h-9 w-11" : "size-11"}`}
    >
      <GripVertical aria-hidden className="size-[18px]" strokeWidth={1.75} />
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      data-sortable-category
      className={`min-w-0 ${isDragging ? "opacity-40" : "opacity-100"}`}
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
