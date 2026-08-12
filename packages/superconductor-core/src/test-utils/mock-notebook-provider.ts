export interface INotebookProvider {
  getNotebookContent(notebookId: string): Promise<string>;
  saveNotebookContent(notebookId: string, content: string): Promise<void>;
}

export class MockNotebookProvider implements INotebookProvider {
  private notebooks: Map<string, string> = new Map();

  async getNotebookContent(notebookId: string): Promise<string> {
    const content = this.notebooks.get(notebookId);
    if (content === undefined) {
      throw new Error(`Notebook not found: ${notebookId}`);
    }
    return content;
  }

  async saveNotebookContent(notebookId: string, content: string): Promise<void> {
    this.notebooks.set(notebookId, content);
  }
}
