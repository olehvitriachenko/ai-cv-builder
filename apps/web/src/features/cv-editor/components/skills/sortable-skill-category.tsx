"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import type { ComponentProps } from "react";
import { SkillCategoryCard } from "./skill-category-card";

export function SortableSkillCategory({ dragging, disabled, index, count, onMove, ...props }: Omit<ComponentProps<typeof SkillCategoryCard>, "dragHandle" | "motionEnabled"> & {
  dragging: boolean;
  disabled: boolean;
  /** Position of the category and how many there are, for the phone's up and down arrows. */
  index: number;
  count: number;
  onMove: (direction: -1 | 1) => void;
}) {
  const arrow = "flex h-6 w-full items-center justify-center text-muted hover:bg-accent-tint hover:text-accent focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted";
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: props.category.id,
    disabled,
    transition: { duration: 180, easing: "ease-out" },
  });
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
        dragHandle={
          <>
          <div className="flex w-11 shrink-0 flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface sm:hidden">
            <button type="button" id={`move-up-${props.category.id}`} aria-label={`Move category ${props.category.name} up`} disabled={disabled || index === 0} onClick={() => onMove(-1)} className={arrow}>
              <ChevronUp aria-hidden className="size-4" strokeWidth={2} />
            </button>
            <button type="button" id={`move-down-${props.category.id}`} aria-label={`Move category ${props.category.name} down`} disabled={disabled || index === count - 1} onClick={() => onMove(1)} className={arrow}>
              <ChevronDown aria-hidden className="size-4" strokeWidth={2} />
            </button>
          </div>
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            disabled={disabled}
            aria-label={`Reorder category ${props.category.name}`}
            title="Drag to reorder. Keyboard: Space, arrows, Space; Esc to cancel."
            className="flex size-11 shrink-0 touch-none max-sm:hidden items-center justify-center rounded-lg border border-line bg-surface text-muted hover:bg-accent-tint hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent enabled:cursor-grab enabled:active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
          >
            <GripVertical aria-hidden className="size-[18px]" strokeWidth={1.75} />
          </button>
          </>
        }
      />
    </div>
  );
}
