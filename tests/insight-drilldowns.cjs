const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = {};
const context = { setTimeout() {}, document: { getElementById(id) {
  return elements[id] ||= { innerHTML: '', querySelectorAll: () => [] };
} } };
vm.createContext(context);
vm.runInContext(fs.readFileSync('script.js', 'utf8').split('/* ---------- Events ---------- */')[0] +
  'globalThis.api = { normalize, renderInsights, dInsight };})();', context);
const { normalize, renderInsights, dInsight } = context.api;
normalize({ listings: [
  { id: 'down', name: 'Declining home', occN: 40, rev: 100, revN: 50, status: 'Red' },
  { id: 'up', name: 'Improving home', occN: 60, rev: 50, revN: 100, status: 'Green' },
  { id: 'unflagged-down', name: 'Unflagged decline', occN: 40, rev: 100, revN: 50, status: 'Improving' },
  { id: 'blocked', name: 'Blocked home', occN: 0, rev: 'Fully blocked', revN: null }
] });
renderInsights();
assert.doesNotMatch(elements.pulse.innerHTML, /RevPAR Declining|#\/insight\/declining/);
for (const key of ['occupancy', 'revpar', 'flagged', 'blocked']) {
  assert.ok(elements.pulse.innerHTML.includes('data-go="#/insight/' + key + '"'));
  const detail = dInsight(key);
  assert.equal(detail.parent, 'overview');
  assert.match(detail.html, /RevPAR Past 30D/);
  assert.match(detail.html, /RevPAR Next 30D/);
}
for (const key of ['declining', 'flagged']) {
  assert.match(dInsight(key).html, /Declining home/);
  assert.doesNotMatch(dInsight(key).html, /Improving home|Blocked home/);
}
assert.match(dInsight('blocked').html, /Blocked home/);
assert.doesNotMatch(dInsight('blocked').html, /Declining home/);
assert.match(dInsight('occupancy').html, /Improving home/);
assert.match(dInsight('revpar').html, /#\/listing\/down/);
assert.doesNotMatch(dInsight('revpar').html, /Blocked home/);
assert.equal(dInsight('invalid'), null);
assert.match(dInsight('declining').html, /Unflagged decline/);
assert.doesNotMatch(dInsight('flagged').html, /Unflagged decline/);
for (const [rev, revN, expected] of [
  [410, 207, 'Declining'], [50, 100, 'Improving'], [100, 100, 'Stable'],
  [100, 0, 'Declining'], [0, 0, 'Stable'], [null, 100, 'Unavailable'],
  [100, null, 'Unavailable'], ['Fully blocked', 100, 'Unavailable'],
  [100, 'Fully blocked', 'Unavailable']
]) {
  normalize({ listings: [{ name: 'Comparison home', occN: 50, rev, revN, status: 'Improving' }] });
  for (const key of ['occupancy', 'revpar']) {
    const html = dInsight(key).html;
    if (expected === 'Stable' || expected === 'Unavailable') {
      assert.doesNotMatch(html, /Comparison home/);
      assert.match(html, /No listings match/);
    } else {
      assert.match(html, /<th>RevPAR Status<\/th>/);
      assert.ok(html.includes('data-sv="' + expected + '"'));
      assert.ok(html.includes('aria-label="' + expected + '"'));
      if (expected === 'Declining') assert.match(html, /class="ind r"[^>]*>[\s\S]*?fa-arrow-trend-down/);
      if (expected === 'Improving') assert.match(html, /class="ind g"[^>]*>[\s\S]*?fa-arrow-trend-up/);
    }
  }
  // The source status must not override the numeric RevPAR comparison.
  normalize({ listings: [{ name: 'Comparison home', occN: 50, rev, revN, status: 'Needs attention' }] });
  renderInsights();
  const flagged = dInsight('flagged');
  assert.equal(flagged.sub.startsWith('1 listings'), expected === 'Declining');
  const card = elements.pulse.innerHTML.split('data-go="#/insight/flagged"')[1].split('</div>')[0];
  assert.ok(card.includes('>' + (expected === 'Declining' ? 1 : 0) + '</b>'));
}
normalize({ listings: [] });
assert.match(dInsight('declining').html, /No listings match/);
console.log('PASS: four insight cards link to matching data; RevPAR Declining card is removed; filters and empty states pass.');
