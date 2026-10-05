const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = {};
const context = { document: { getElementById(id) {
  return elements[id] ||= { innerHTML: '', textContent: '', querySelectorAll: () => [] };
} } };
vm.createContext(context);
const source = fs.readFileSync('script.js', 'utf8');
vm.runInContext(source.split('/* ---------- Events ---------- */')[0] +
  'globalThis.api = { state, renderData, sortBy, renderListings, renderRegions };})();', context);
const { state, renderData, sortBy } = context.api;
state.tabs = { Sample: { headers: ['Number'], rows: Array.from({ length: 205 }, (_, i) => [String(205 - i)]) } };
function visibleRows() {
  return (elements['data-wrap'].innerHTML.split('<tbody>')[1].match(/<tr>/g) || []).length;
}
renderData();
assert.equal(visibleRows(), 20);
assert.match(elements['data-page-info'].textContent, /Rows 1–20 of 205/);
assert.equal(elements['data-prev'].disabled, true);
assert.equal(elements['data-next'].disabled, false);
for (const size of [20, 50, 100, 200]) {
  state.dataPageSize = size; state.dataPage = 0; renderData();
  assert.equal(visibleRows(), size);
}
state.dataPage = 1; renderData();
assert.equal(visibleRows(), 5);
assert.match(elements['data-page-info'].textContent, /Rows 201–205/);
assert.equal(elements['data-next'].disabled, true);
state.dataPageSize = 20;
sortBy({ id: 'tbl-data' }, 0, true);
assert.equal(state.dataPage, 0);
assert.match(elements['data-wrap'].innerHTML, /<tbody><tr><td[^>]*>1<\/td>/);
assert.match(elements['data-wrap'].innerHTML, /aria-sort="ascending"/);
state.dataPage = 1; renderData();
assert.match(elements['data-wrap'].innerHTML, /<tbody><tr><td[^>]*>21<\/td>/);
assert.equal(state.tabs.Sample.rows[0][0], '205', 'Sorting must not mutate API rows');
state.tabs.Sample.rows = [['7']]; renderData();
assert.equal(state.dataPage, 0, 'Clamp current batch after a smaller API response');
state.tabs.Sample.rows = []; renderData();
assert.equal(visibleRows(), 0);
assert.equal(elements['data-page-info'].textContent, '0 rows');
assert.equal(elements['data-next'].disabled, true);
state.tabs = {}; renderData();
assert.equal(elements['data-pagination'].hidden, true);
console.log('PASS: default 20 rows, all batch sizes, final batch, full-dataset sorting, refresh clamping, and empty data.');

function header(key) {
  return { textContent: key, className: '', getAttribute: () => key, setAttribute() {}, removeAttribute() {} };
}
const tbody = { innerHTML: '' }, headers = [header('rank'), header('name')];
elements['tbl-listings'] = { querySelectorAll: () => headers, getElementsByTagName: () => [tbody] };
for (const id of ['q', 'f-city', 'f-team', 'f-status']) context.document.getElementById(id).value = '';
state.listings = Array.from({ length: 205 }, (_, i) => ({ id: i, rank: 205 - i, name: 'Listing ' + (205 - i), city: i < 3 ? 'Small' : 'Large' }));
context.api.renderListings();
assert.equal((tbody.innerHTML.match(/<tr /g) || []).length, 20);
assert.match(tbody.innerHTML, /<td class="" data-l="rank">1<\/td>/);
for (const size of [20, 50, 100, 200]) {
  state.listingsPageSize = size; state.listingsPage = 0; context.api.renderListings();
  assert.equal((tbody.innerHTML.match(/<tr /g) || []).length, size);
}
state.listingsPage = 1; context.api.renderListings();
assert.equal((tbody.innerHTML.match(/<tr /g) || []).length, 5);
elements['f-city'].value = 'Small'; context.api.renderListings();
assert.equal(state.listingsPage, 0);
assert.equal((tbody.innerHTML.match(/<tr /g) || []).length, 3);
assert.equal(elements['listings-next'].disabled, true);

const regionTable = { id: 'tbl-regions', tHead: { rows: [{ cells: Array.from({ length: 8 }, () => header('')) }] }, parentNode: { setAttribute() {} } };
context.document.getElementById('regions-wrap').getElementsByTagName = () => [regionTable];
state.wl = Array.from({ length: 205 }, (_, i) => ({ region: 'Region ' + i, act: 205 - i, past: 50, next: 50, n14: 50, b14: 60, b30: 60 }));
context.api.renderRegions();
assert.equal((elements['regions-wrap'].innerHTML.match(/<tr class=/g) || []).length, 20);
for (const size of [20, 50, 100, 200]) {
  state.regionsPageSize = size; state.regionsPage = 0; context.api.renderRegions();
  assert.equal((elements['regions-wrap'].innerHTML.match(/<tr class=/g) || []).length, size);
}
state.regionsPageSize = 20; state.regionsPage = 4;
sortBy(regionTable, 1, true);
assert.equal(state.regionsPage, 0);
assert.match(elements['regions-wrap'].innerHTML, /<tbody><tr[^]*?<b>Region 204<\/b>/);
state.regionsPage = 10; context.api.renderRegions();
assert.equal((elements['regions-wrap'].innerHTML.match(/<tr class=/g) || []).length, 5);
assert.equal(elements['regions-next'].disabled, true);
state.wl = []; context.api.renderRegions();
assert.equal(state.regionsPage, 0);
assert.equal(elements['regions-page-info'].textContent, '0 rows');
console.log('PASS: Listings and Regions batch sizes, global sorting, final batches, filtering, and empty results.');
