const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = {};
const context = { setTimeout() {}, document: { getElementById(id) {
  return elements[id] ||= { value: '', innerHTML: '', textContent: '', querySelectorAll: () => [] };
} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('script.js', 'utf8').split('/* ---------- Events ---------- */')[0] +
  'globalThis.api = { normalize, state, renderInsights, renderFilters };})();', context);
const { normalize, state, renderInsights, renderFilters } = context.api;
const data = { listings: [
  { id: 'missing', name: 'Unavailable', city: 'Excluded city', group: 'Excluded team', status: 'Source match review', occ: 'n/a', occ15: '', occN: null, benchmark30: '35%' },
  { id: 'blank', name: 'Blank occupancy', status: '', benchmark15: '50%' },
  { id: 'unmatched', name: 'Unmatched', status: ' Source match review ', occN: '20%' },
  { id: 'zero', name: 'Zero is valid', city: 'Toronto', status: 'Stable', occ: 0, occ15: '0%', occN: 0 },
  { id: 'partial', name: 'Partial is valid', city: 'Toronto', status: 'Improving', occN: '60%' },
  [6, 'Legacy missing', '', '', '', '', '', '', 'n/a', '', '', '', '35%', 'Source match review'],
  [7, 'Legacy zero', '', '', 'Toronto', '', '', '', '0%', '0%', '0%', '', '35%', 'Stable']
] };
const original = JSON.stringify(data);
normalize(data);
assert.deepEqual(Array.from(state.listings, l => l.id), ['zero', 'partial', '7']);
assert.equal(JSON.stringify(data), original, 'Do not mutate source or cached data');
renderInsights();
renderFilters();
assert.equal(elements['n-all'].textContent, 3);
assert.doesNotMatch(elements.mix.innerHTML, /Source match review/);
assert.doesNotMatch(elements['f-status'].innerHTML, /Source match review/);
assert.doesNotMatch(elements['f-city'].innerHTML, /Excluded city/);
assert.doesNotMatch(elements['f-team'].innerHTML, /Excluded team/);
assert.match(elements.mix.innerHTML, /Stable/);
normalize({ listings: [data.listings[0]] });
renderInsights();
renderFilters();
assert.equal(state.listings.length, 0);
for (const id of ['pulse', 'mix', 'teams', 'cities', 'movers']) assert.equal(elements[id].innerHTML, '');
assert.equal(elements['n-all'].textContent, 0);
console.log('PASS: unavailable/unmatched listings excluded, zero and partial occupancy retained, filters/counts consistent, source unchanged, empty refresh clears stale groups.');
