const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = {};
const context = { setTimeout() {}, document: { getElementById(id) {
  return elements[id] ||= { innerHTML: '', textContent: '', querySelectorAll: () => [] };
} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('script.js', 'utf8').split('/* ---------- Events ---------- */')[0] +
  'globalThis.api = { normalize, state, renderOverview, dStatus };})();', context);
const { normalize, state, renderOverview, dStatus } = context.api;
const worklist = [];
for (const [status, count] of [['Green', 31], ['Yellow', 1], ['Red', 5], ['No active listings', 2]]) {
  for (let i = 0; i < count; i++) worklist.push(['', status + i, status === 'No active listings' ? 0 : 1,
    '50%', '50%', '50%', '0%', '0%', '40%', '40%', status, status]);
}
normalize({ overview: { kpis: { 'Green Regions (30D)': '31', 'Yellow Regions (30D)': '1', 'Red Regions (30D)': '5' } }, worklist });
function verify(expected) {
  renderOverview();
  const html = elements['status-split'].innerHTML;
  assert.deepEqual([...html.matchAll(/class="split-count">(\d+)</g)].map(m => +m[1]), expected);
  const total = expected.reduce((a, b) => a + b, 0) || 1;
  assert.deepEqual([...html.matchAll(/data-w="([^"]+)"/g)].map(m => +m[1]), expected.map(n => n / total * 100));
  for (const [i, key] of ['g', 'y', 'r'].entries()) {
    assert.equal(Number(dStatus(key).html.match(/Regions<\/span><\/span><b[^>]*>(\d+)<\/b>/)[1]), expected[i]);
  }
}
verify([31, 1, 5]);
state.ov.kpis = { 'Green Regions': '0', 'Yellow Regions': '0', 'Red Regions': '0' };
verify([31, 1, 5]);
state.wl = state.wl.filter(r => r.s30 === 'Green');
verify([31, 0, 0]);
state.wl = [];
verify([0, 0, 0]);
console.log('PASS: renamed/stale KPI labels cannot zero counts; bars match detail pages, exclude unclassified regions, and preserve genuine zeros.');
