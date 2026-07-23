import('./packages/superconductor-core/dist/review/aggregate-findings.js').then(m => {
  const out = m.aggregateFindings([{reviewer_id:'r1', raw_text: '```json:review-findings\n[]\n```'}]);
  console.log('N=0:', out.length, '(expect 0)', out.length===0?'PASS':'FAIL');
}).catch(console.error);
