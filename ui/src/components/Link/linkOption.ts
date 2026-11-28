import type { LinkOption } from "./types";

/** Is this `update:query` text a real user-typed search term?
 *
 * The frappe-ui Combobox in input mode echoes non-search text into its query
 * model: the committed option's LABEL (on select, while the list is still
 * open, and again on close through the display sync) and "" on a display
 * reset — and a re-emitted focus event hands over a non-string. None of those
 * is a search term; only real typing (a non-empty string, with the list open,
 * that is not the currently displayed selection label) may trigger the
 * server reload. */
export function isTypedSearch(
  value: unknown,
  context: { open: boolean; selectedLabel?: string | null }
): value is string {
  if (typeof value !== "string") return false;
  if (value === "") return false;
  if (!context.open) return false;
  if (context.selectedLabel && value === context.selectedLabel) return false;
  return true;
}

/** A `search_link` row as a picker option. When a doctype shows titles in links,
 *  Frappe leads the description with the record's name, which the label already
 *  stands for, so the name is left out. */
export function toLinkOption(row: {
  value: string;
  label?: string;
  description?: string;
}): LinkOption {
  const description = row.description
    ?.split(", ")
    .filter((part) => part !== row.value)
    .join(", ");
  return {
    label: row.label || row.value,
    value: row.value,
    description: description || undefined,
  };
}

/** A `search_link` row labelled by its ID, with the title beneath. */
export function toIdOption(row: {
  value: string;
  label?: string;
  description?: string;
}): LinkOption {
  const parts = [row.label, ...(row.description?.split(", ") ?? [])];
  const description = [...new Set(parts)]
    .filter((part) => part && part !== row.value)
    .join(", ");
  return { label: row.value, value: row.value, description: description || undefined };
}
