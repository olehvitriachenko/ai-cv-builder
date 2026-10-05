import { MAX_CATEGORY_NAME_LENGTH } from "./skills-form";

// Search and keyboard rules of the category combobox, as pure functions.

/** The names that contain the query (case-insensitive), in their original order. */
export function filterCategories(query: string, names: readonly string[]): string[] {
  const needle = query.trim().toLowerCase();
  return needle === "" ? [...names] : names.filter((name) => name.toLowerCase().includes(needle));
}

/**
 * The "Use "…" as custom category" option: the trimmed query, offered only when it is not blank,
 * short enough to save and not already the exact name of a category.
 */
export function customCategoryOption(query: string, names: readonly string[]): string | null {
  const text = query.trim();
  if (text === "" || text.length > MAX_CATEGORY_NAME_LENGTH) {
    return null;
  }
  return names.some((name) => name.trim().toLowerCase() === text.toLowerCase()) ? null : text;
}

export type NavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

/** The next active option for a navigation key; the list wraps, and an empty list has none (-1). */
export function nextActiveIndex(current: number, key: NavigationKey, count: number): number {
  if (count === 0) {
    return -1;
  }
  switch (key) {
    case "Home":
      return 0;
    case "End":
      return count - 1;
    case "ArrowDown":
      return current < 0 ? 0 : (current + 1) % count;
    case "ArrowUp":
      return current < 0 ? count - 1 : (current - 1 + count) % count;
  }
}
