const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const grids = {
  'Pricelabs Report': [
    ['Listing Name', 'Total Occupancy ( Next 15 Days )', 'Total Occupancy ( Next 15 Days )', 'Total Occupancy ( Past 30 Days )', 'Total Occupancy ( Next 30 Days )', 'Next 30D Benchmark %', 'Status'],
    ['Sample', '███', '75%', '50%', '60%', '70%', 'Yellow']
  ],
  'Detailed Listings': [[], [], [], ['Listing ID', 'Listing Name', 'Base Price', 'Recommended Base Price'], ['one', 'Sample', '$100', '$110']],
  'Property Setup': [['Region', 'Active Listings'], ['North', '1'], ['Reporting Month', 'Oct 2026']],
  'Executive Overview': [['ACTIVE LISTINGS'], ['1']]
};
for (const name of ['Weekly AM Worklist', 'AM Actions', 'Monthly Performance', 'Regional Performance', 'AM Action Inputs', 'Monthly Inputs', 'Management Inputs', 'Legend']) grids[name] = [['Region'], ['North']];

let displayReads = 0, rawReads = 0, releases = 0, builds = 0, locked = false, failCache = false;
const entries = new Map();
const cache = {
  get(key) { if (failCache) throw Error('Cache unavailable'); return entries.get(key) ?? null; },
  getAll(keys) { return Object.fromEntries(keys.filter(k => entries.has(k)).map(k => [k, entries.get(k)])); },
  put(key, value) { assert.ok(Buffer.byteLength(value) < 100000); entries.set(key, value); },
  putAll(values) { for (const [key, value] of Object.entries(values)) this.put(key, value); }
};
const ss = { getSheetByName(name) { return { getDataRange() { return {
  getDisplayValues() { displayReads++; return structuredClone(grids[name]); },
  getValues() { rawReads++; return grids[name].map(r => r.map(v => /^\d+%$/.test(v) ? parseFloat(v) / 100 : v)); }
}; } }; } };
const context = {
  CacheService: { getScriptCache: () => cache },
  SpreadsheetApp: { getActiveSpreadsheet() { builds++; return ss; } },
  LockService: { getScriptLock: () => ({ tryLock: () => !locked, releaseLock() { releases++; } }) },
  Utilities: { getUuid: () => 'generation-' + builds },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput(text) { return { text, setMimeType() { return this; } }; } }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('apps-script/Code.gs', 'utf8'), context);
const request = (params = {}) => JSON.parse(context.doGet({ parameter: { token: context.API_TOKEN, ...params } }).text);

assert.equal(request({ token: 'wrong' }).ok, false);
assert.equal(builds, 0);
const first = request();
assert.equal(first.ok, true);
assert.equal(first.listings[0].occ15, '75%'); // Skip duplicate visual-bar column.
assert.equal(first.listings[0].occ, '50%'); // Preserve fractional raw-value conversion.
assert.equal(first.reportingMonth, 'Oct 2026');
assert.equal(displayReads, 12);
assert.equal(rawReads, 1);
assert.equal(releases, 1);
assert.deepEqual(request(), first);
assert.equal(builds, 1, 'Cache hits must not access the spreadsheet');
assert.equal(request({ since: first.version }).notModified, true);
assert.equal(builds, 1);
assert.notEqual(request({ fresh: '1', since: first.version }).version, first.version);
assert.equal(builds, 2);

let manifest = JSON.parse(entries.get(context.CACHE_KEY));
entries.delete(manifest.keys[0]);
assert.equal(request().ok, true, 'A partially evicted response must rebuild');
assert.equal(builds, 3);
manifest = JSON.parse(entries.get(context.CACHE_KEY));
manifest.expires = 0;
entries.set(context.CACHE_KEY, JSON.stringify(manifest));
assert.equal(request().ok, true);
assert.equal(builds, 4, 'Expired cache must rebuild');

const large = { text: JSON.stringify({ value: '🏠é漢'.repeat(30000) }), version: 'unicode', updated: 'now' };
context.writeCache_(large);
assert.equal(context.readCache_().text, large.text, 'Large Unicode responses survive chunking');
assert.ok(JSON.parse(entries.get(context.CACHE_KEY)).keys.length > 1);

failCache = true;
assert.equal(request().ok, true, 'Cache failure must not break normal responses');
failCache = false;
locked = true;
assert.equal(request({ fresh: '1' }).ok, false);
locked = false;
grids['Pricelabs Report'] = [['Wrong header']];
assert.equal(request({ fresh: '1' }).ok, false);
assert.equal(releases, builds, 'Every acquired lock must be released, including failures');
console.log('PASS: API schema, 12 display + 1 raw reads, warm cache, conditional response, forced refresh, eviction, expiry, Unicode chunks, cache failure, authorization, and lock cleanup.');
