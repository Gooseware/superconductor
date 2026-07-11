import { describe, it, expect } from 'vitest';
import { BacklogParser } from '../src/dispatcher/backlog-parser.js';

describe('BacklogParser', () => {
  it('should parse pending items from a markdown list', () => {
    const markdown = `
# Backlog
- [ ] Feature: Add user avatars
- [x] Bugfix: Fix login screen
- [ ] Task: Create tests
    `;

    const parser = new BacklogParser();
    const pendingItems = parser.extractPendingItems(markdown);

    expect(pendingItems).toHaveLength(2);
    expect(pendingItems[0].title).toBe('Feature: Add user avatars');
    expect(pendingItems[1].title).toBe('Task: Create tests');
  });

  it('should generate updated markdown with an item marked as done', () => {
    const markdown = `
# Backlog
- [ ] Feature: Add user avatars
- [ ] Task: Create tests
    `;

    const parser = new BacklogParser();
    const updatedMarkdown = parser.markItemAsDone(markdown, 'Feature: Add user avatars');

    expect(updatedMarkdown).toContain('- [x] Feature: Add user avatars');
    expect(updatedMarkdown).toContain('- [ ] Task: Create tests');
  });
});
