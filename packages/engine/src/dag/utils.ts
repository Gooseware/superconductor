/**
 * Returns the 1-based line number where the given id appears as a YAML `id:` field.
 * Returns 1 if not found.
 */
export function findLineNumber(lines: string[], id: string): number {
  const index = lines.findIndex(
    line =>
      line.includes(`id: ${id}`) ||
      line.includes(`id: "${id}"`) ||
      line.includes(`id: '${id}'`)
  );
  return index >= 0 ? index + 1 : 1;
}
