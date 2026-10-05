import type { extractTextItems } from 'unpdf';

type TextItem = Awaited<ReturnType<typeof extractTextItems>>['items'][number][number];

/** Test-only candidate. It is deliberately not connected to production extraction. */
export function reconstructPageForInvestigation(items: TextItem[]): {
  text: string;
  columns: number;
  overlaps: boolean;
} {
  const lines: TextItem[][] = [];
  for (const item of items.filter((item) => item.str.trim() !== '').sort((a, b) => b.y - a.y || a.x - b.x)) {
    const last = lines.at(-1);
    if (last && Math.abs(last[0]!.y - item.y) <= 2) last.push(item);
    else lines.push([item]);
  }
  lines.forEach((line) => line.sort((a, b) => a.x - b.x));

  // A persistent gutter on at least three rows distinguishes the controlled two-column cases
  // from a single line with a right-aligned date. General header/footer handling remains unproven.
  const rightStarts = lines.flatMap((line) => line.slice(1).flatMap((item, index) => {
    const previous = line[index]!;
    return item.x - previous.x - previous.width >= item.fontSize * 3 ? [item.x] : [];
  }));
  const gutter = rightStarts.find((x) => rightStarts.filter((other) => Math.abs(x - other) <= 5).length >= 3);
  let overlaps = false;
  function join(line: TextItem[]): string {
    return line.reduce((text, item, index) => {
      const previous = line[index - 1];
      if (!previous) return item.str.trim();
      const gap = item.x - previous.x - previous.width;
      if (gap < -1) overlaps = true;
      return text + (gap > item.fontSize * 0.15 ? ' ' : '') + item.str.trim();
    }, '');
  }
  const columns = gutter === undefined ? [lines] : [
    lines.map((line) => line.filter((item) => item.x < gutter)),
    lines.map((line) => line.filter((item) => item.x >= gutter)),
  ];
  return {
    text: columns.flatMap((column) => column.filter((line) => line.length > 0).map(join)).join('\n'),
    columns: columns.length,
    overlaps,
  };
}
