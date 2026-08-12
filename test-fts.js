const { LibSQLNotebookProvider } = require('./packages/notebook-store/dist/providers/libsql-notebook-provider.js');
async function run() {
  const provider = new LibSQLNotebookProvider('test.db');
  try {
    await provider.write({ content: 'test', note_type: 'architectural', domain: 'test', severity: 'info', track_id: '1', session_id: '1', agent_role: 'agent', files: [] });
    await provider.query({ query: 'AND' });
    console.log("Success");
  } catch (e) {
    console.error("Error:", e.message);
  }
}
run();
