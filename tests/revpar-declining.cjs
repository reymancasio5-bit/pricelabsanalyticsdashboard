const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = {};
const context = { setTimeout() {}, document: { getElementById(id) {
  return elements[id] ||= { innerHTML: '', querySelectorAll: () => [] };
} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('script.js', 'utf8').split('/* ---------- Events ---------- */')[0] +
  'globalThis.api = { normalize, renderInsights };})();', context);
const { normalize, renderInsights } = context.api;
function render(rows) {
  normalize({ listings: rows.map((row, i) => ({ name: 'Listing ' + i, occN: 40, ...row })) });
  renderInsights();
  return elements.pulse.innerHTML;
}
const html = render([
  { rev: 100, revN: 80, chg: 10 },
  { rev: 100, revN: 0 },
  { rev: 100, revN: 100 },
  { rev: 100, revN: 120, chg: -10 },
  { rev: 0, revN: 0 },
  { rev: 100, revN: null },
  { rev: null, revN: 20 },
  { rev: 'Fully blocked', revN: 20 },
  { rev: 100, revN: 'Fully blocked' },
  { rev: 100, revN: 20, status: 'Source match review' }
]);
assert.match(html, /RevPAR Declining/);
assert.match(html.split('</div>')[0], />2</);
assert.doesNotMatch(html, /Listings tracked/i);
assert.match(render([{ rev: 10, revN: 20 }]).split('</div>')[0], />0</);
render([]);
assert.equal(elements.pulse.innerHTML, '');
console.log('PASS: declining RevPAR counts direct comparisons, valid zero, missing/blocked values, eligibility, and empty refresh.');
