const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('script.js', 'utf8');
const code = source.slice(source.indexOf('  function restoreSnapshot('), source.indexOf('  function showNotice('));

function harness(saved) {
  const elements = {}, storage = new Map(saved ? [['snapshot', JSON.stringify(saved)]] : []);
  let resolve, reject;
  const context = {
    state: { loaded: false, loading: false }, API_URL: 'https://example.test/api', API_TOKEN: 'test',
    SNAPSHOT_KEY: 'snapshot', SNAPSHOT_MAX_AGE: 900000, AbortController, URL,
    Date, setTimeout: () => 1, clearTimeout() {},
    $: id => elements[id] ||= { setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; } },
    sessionStorage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
    fetch(url) { context.url = url; context.requests++; return new Promise((yes, no) => { resolve = yes; reject = no; }); },
    showNotice(text) { context.notice = text; }, esc: s => s,
    normalize(data) { context.state.schemaVersion = data.schemaVersion; },
    renderAll() { context.renders++; }, route() {}, requests: 0, renders: 0
  };
  vm.createContext(context); vm.runInContext(code, context);
  return { context, elements, storage,
    async complete(data) { resolve({ ok: true, json: async () => data }); await new Promise(r => setImmediate(r)); },
    async fail() { reject(Error('Network unavailable')); await new Promise(r => setImmediate(r)); },
    async httpError(status, url = 'https://script.googleusercontent.com/macros/echo') {
      resolve({ ok: false, status, url }); await new Promise(r => setImmediate(r));
    } };
}

(async () => {
  const data = { ok: true, schemaVersion: 2, listings: [], version: 'one' };
  let h = harness();
  h.context.restoreSnapshot(); h.context.load(); h.context.load();
  assert.equal(h.context.requests, 1);
  assert.equal(h.elements['dashboard-skeleton'].hidden, false);
  assert.equal(h.elements['dashboard-content'].hidden, true);
  for (const view of ['listings', 'regions', 'data', 'overview']) {
    h.context.state.loadingView = view;
    h.context.renderLoadingView();
    for (const name of ['overview', 'listings', 'regions', 'data']) {
      assert.equal(h.elements[name + '-skeleton'].hidden, name !== view, 'Only the current page skeleton is visible');
    }
    assert.match(h.elements['loading-status'].textContent, new RegExp(view === 'overview' ? 'dashboard' : view));
    assert.equal(h.elements['dashboard-content'].hidden, true);
    assert.equal(h.context.requests, 1, 'Navigation during loading reuses the pending request');
  }
  assert.match(h.elements['listings-skeleton'].innerHTML, /skeleton-filters/);
  assert.doesNotMatch(h.elements['regions-skeleton'].innerHTML, /skeleton-tabs/);
  assert.match(h.elements['data-skeleton'].innerHTML, /skeleton-tabs/);
  await h.complete(data);
  assert.equal(h.elements['dashboard-skeleton'].hidden, true);
  assert.equal(h.elements['dashboard-content'].hidden, false);
  assert.equal(h.context.renders, 1);
  assert.ok(h.storage.has('snapshot'));

  h = harness({ savedAt: Date.now(), data });
  h.context.restoreSnapshot(); h.context.load();
  assert.equal(h.elements['dashboard-skeleton'].hidden, true);
  assert.equal(h.elements['dashboard-content'].hidden, false);
  assert.match(h.context.url, /since=one/);
  await h.complete({ ok: true, notModified: true, version: 'one' });
  assert.equal(h.context.renders, 1, 'Unchanged response must not re-render');
  h.context.load(true);
  assert.match(h.context.url, /fresh=1/); assert.doesNotMatch(h.context.url, /since=/);
  await h.fail();
  assert.equal(h.elements['dashboard-content'].hidden, false);
  assert.match(h.context.notice, /Showing last loaded data/);
  assert.equal(h.elements.refresh.disabled, false);

  for (const saved of [{ savedAt: Date.now() - 900001, data }, { savedAt: Date.now(), data: {} }]) {
    h = harness(saved); h.context.restoreSnapshot(); assert.equal(h.context.state.loaded, false);
  }
  h = harness(); h.context.load(); await h.fail();
  assert.equal(h.elements['dashboard-content'].hidden, true);
  assert.equal(h.elements['dashboard-skeleton'].hidden, true);
  assert.match(h.context.notice, /Use Refresh/);
  h = harness(); h.context.sessionStorage.getItem = () => { throw Error('Blocked'); };
  h.context.restoreSnapshot(); h.context.load(); await h.complete(data);
  assert.equal(h.context.state.loaded, true);
  // Older deployed APIs remain supported without the new version field.
  h = harness(); h.context.load(); await h.complete({ ok: true, listings: [], schemaVersion: 2 });
  assert.equal(h.context.state.version, '');
  h = harness(); h.context.load();
  const firstUrl = h.context.url;
  assert.match(firstUrl, /requestId=/);
  await h.httpError(404);
  assert.equal(h.context.requests, 2);
  assert.notEqual(h.context.url, firstUrl);
  assert.equal(h.elements['dashboard-skeleton'].hidden, false, 'Keep loading through the retry');
  await h.complete(data);
  assert.equal(h.context.state.loaded, true);
  h = harness(); h.context.load(true);
  await h.httpError(404);
  assert.match(h.context.url, /fresh=1/);
  await h.httpError(404);
  assert.equal(h.context.requests, 2, 'Never retry indefinitely');
  assert.match(h.context.notice, /could not deliver.*after retrying/);
  assert.equal(h.elements.refresh.disabled, false);
  h = harness(); h.context.load();
  await h.httpError(404, 'https://script.google.com/macros/s/missing/exec');
  await h.httpError(404, 'https://script.google.com/macros/s/missing/exec');
  assert.match(h.context.notice, /active deployment/);
  h = harness(); h.context.load(); await h.httpError(403);
  assert.equal(h.context.requests, 1);
  assert.match(h.context.notice, /HTTP 403/);
  console.log('PASS: unique request URLs, recovery from 404, bounded retries, refresh parameter preservation, and redirect/deployment error messages.');
  console.log('PASS: first load, session restore, conditional fetch, manual refresh, failed refresh, stale/invalid cache, blocked storage, old API compatibility, and duplicate request prevention.');
})().catch(err => { console.error(err); process.exitCode = 1; });
