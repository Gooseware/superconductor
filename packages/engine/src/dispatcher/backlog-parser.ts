export interface PendingItem {
  title: string;
  rawLine: string;
}

export class BacklogParser {
  /**
   * Extracts pending items (unchecked markdown checkboxes) from the provided markdown.
   * Format matched: - [ ] Task description
   * @param markdown The backlog markdown content
   * @returns Array of pending items
   */
  extractPendingItems(markdown: string): PendingItem[] {
    const lines = markdown.split('\n');
    const pendingItems: PendingItem[] = [];

    const pendingRegex = /^\s*-\s*\[ \]\s*(.+)$/;

    for (const line of lines) {
      const match = line.match(pendingRegex);
      if (match) {
        pendingItems.push({
          title: match[1].trim(),
          rawLine: line,
        });
      }
    }

    return pendingItems;
  }

  /**
   * Marks a specific item as done in the markdown by replacing [ ] with [x].
   * @param markdown The original markdown content
   * @param itemTitle The title of the item to mark as done
   * @returns The updated markdown content
   */
  markItemAsDone(markdown: string, itemTitle: string): string {
    const lines = markdown.split('\n');
    const pendingRegex = /^\s*-\s*\[ \]\s*(.+)$/;

    const updatedLines = lines.map(line => {
      const match = line.match(pendingRegex);
      if (match && match[1].trim() === itemTitle) {
        return line.replace('[ ]', '[x]');
      }
      return line;
    });

    return updatedLines.join('\n');
  }
}
