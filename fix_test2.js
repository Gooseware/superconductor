const record = { metadata: '{"intelligenceStatusChecked":true,"notebookQueried":true}' };
const metadata = (record && record.metadata) || record;
console.log(metadata.intelligenceStatusChecked);
