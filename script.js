(function () {
  'use strict';

  /* ---------- Settings ---------- */
  var API_URL = 'https://script.google.com/macros/s/AKfycbyu8Cl-OooWP5zSxAIe09X1aZWNKmaumCJR9ZQIVWZHabQ5wLA2Qa8AUNxLwiYwaOhg/exec';
  var API_TOKEN = 'e5f2a9b8c3d7e1f0a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1';
  var REFRESH_MS = 5 * 60 * 1000;
  var SNAPSHOT_MAX_AGE = 15 * 60 * 1000;
  var SNAPSHOT_KEY = 'pd-snapshot-v1:' + API_URL + ':' + API_TOKEN;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TABICON = { 'Regional Performance': 'fa-map-location-dot', 'AM Action Inputs': 'fa-clipboard-list', 'Monthly Inputs': 'fa-calendar-check', 'Management Inputs': 'fa-sliders', 'Legend': 'fa-palette' };

  var state = { ov: null, listings: [], wl: [], setup: {}, monthly: [], actions: [], details: {}, tabs: {}, tab: '',
    type: 'all', listingsPage: 0, regionsPage: 0, sort: 'name', asc: true, loaded: false, loading: false };
  var navCount = 0;

  /* ---------- Helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function pn(v) {
    var s = String(v == null ? '' : v).trim().replace(/[$,%\s]/g, '');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function nz(v) { var n = pn(v); return n == null ? 0 : n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pct(n) { return n == null ? 'n/a' : (Math.round(n * 10) / 10) + '%'; }
  function money(n) { return n == null ? 'n/a' : '$' + Math.round(n).toLocaleString('en-US'); }
  function sign(n) { return n > 0 ? '+' : ''; }
  function clamp(n) { return Math.max(0, Math.min(100, n)); }
  function enc(s) { return encodeURIComponent(s); }
  function cls(n) { return n == null ? '' : n < 0 ? 'down' : 'up'; }
  function tcase(s) { return String(s || '').trim().toLowerCase().replace(/(^|[\s\-])([a-z\u00e0-\u00ff])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
  function heading(s) {
    // Preserve acronyms, HTML and entities; keep the comparison word "vs" lowercase.
    return String(s == null ? '' : s).replace(/(<[^>]*>|&[^;\s]+;)|\b([A-Za-z][A-Za-z0-9]*)/g, function (match, markup, word) {
      return markup || (word.toLowerCase() === 'vs' ? 'vs' : word.charAt(0).toUpperCase() + word.slice(1));
    });
  }
  function avg(a) { var v = a.filter(function (x) { return x != null; }); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; }
  function weighted(list, key) {
    var total = 0, weight = 0;
    list.forEach(function (r) {
      if (r[key] != null && r.act > 0) { total += r[key] * r.act; weight += r.act; }
    });
    return weight ? total / weight : null;
  }
  function group(list, key) {
    var o = {}, out = [];
    list.forEach(function (l) { var k = l[key] || 'Other'; (o[k] = o[k] || { k: k, items: [] }).items.push(l); });
    for (var k in o) out.push(o[k]);
    return out;
  }
  function pluck(a, k) { return a.map(function (x) { return x[k]; }); }
  function statusClass(s) {
    s = String(s).toLowerCase();
    if (s === 'green' || /improv|on track/.test(s)) return 'g';
    if (s === 'yellow' || /watch|review/.test(s)) return 'y';
    if (s === 'red' || /declin|immediate|action|attention|needs/.test(s)) return 'r';
    return 'n';
  }
  function rate(v, b) {
    if (v == null || b == null) return '';
    return v >= b ? 'Green' : (b - v <= 10 ? 'Yellow' : 'Red');
  }
  function sev(s) { s = String(s).toLowerCase(); return s === 'red' ? 0 : s === 'yellow' ? 1 : s === 'green' ? 2 : 3; }

  /* Status indicators: icon only, the word stays in the tooltip and for screen readers */
  var ICO = { g: 'fa-circle-check', y: 'fa-triangle-exclamation', r: 'fa-circle-exclamation', n: 'fa-circle-minus', stable: 'fa-arrows-left-right' };
  function isStable(status) { return /^stable$/i.test(String(status || '').trim()); }
  function ind(text) {
    var t = String(text || 'None'), c = statusClass(t), i = ICO[c];
    if (/improv/i.test(t)) i = 'fa-arrow-trend-up';
    else if (isStable(t)) i = ICO.stable;
    else if (/need|attention/i.test(t)) i = 'fa-circle-exclamation';
    return '<span class="ind ' + c + '" title="' + esc(t) + '" role="img" aria-label="' + esc(t) + '"><i class="fa-solid ' + i + '" aria-hidden="true"></i></span>';
  }
  var pill = ind;
  function horizonValue(value, benchmark, horizon, status) {
    var c = statusClass(status == null ? rate(value, benchmark) : status);
    var labels = { g: 'On track', y: 'Watch', r: 'Needs attention', n: 'Status unavailable' };
    var icons = { g: 'fa-arrow-trend-up', y: 'fa-triangle-exclamation', r: 'fa-circle-exclamation', n: ICO.n };
    var stable = isStable(status), icon = stable ? ICO.stable : icons[c];
    var label = horizon + ' status: ' + (stable ? 'Stable' : labels[c]);
    return '<span class="horizon-value"><span>' + pct(value) + '</span><span class="ind ' + c + '" title="' + esc(label) +
      '" role="img" aria-label="' + esc(label) + '"><i class="fa-solid ' + icon + '" aria-hidden="true"></i></span></span>';
  }
  function tag(icon, label) { return '<span class="tag" title="' + esc(label) + '" role="img" aria-label="' + esc(label) + '"><i class="fa-solid ' + icon + '" aria-hidden="true"></i></span>'; }
  var TYPE = { entire: 'Entire Unit', room: 'By Room' };
  function typeTag(t) { return t ? tag(t === 'room' ? 'fa-door-open' : 'fa-house', TYPE[t]) : tag('fa-ellipsis', 'Other'); }
  function teamTag(g, useIcon) {
    if (useIcon) return '<span class="tag team" title="' + esc(g || 'No team') + '" role="img" aria-label="' + esc(g || 'No team') + '"><i class="fa-solid ' + (g ? 'fa-people-group' : 'fa-user-slash') + '" aria-hidden="true"></i></span>';
    var m = /team\s*(\w+)/i.exec(g || '');
    return g ? '<span class="tag team" title="' + esc(g) + '">' + esc(m ? m[1].toUpperCase() : g.charAt(0)) + '</span>' : tag('fa-minus', 'No team');
  }
  function rvm(l, v) { return l.blocked ? tag('fa-lock', 'Fully blocked') : money(v); }
  function setBars(root) {
    var els = root.querySelectorAll('[data-w]');
    setTimeout(function () { for (var i = 0; i < els.length; i++) els[i].style.width = els[i].getAttribute('data-w') + '%'; }, 40);
  }

  /* ---------- Data ---------- */
  function normalize(data) {
    state.ov = data.overview || null;
    if (state.ov) { state.ov.outlook = state.ov.outlook || []; state.ov.risks = state.ov.risks || []; }
    state.reportingMonth = data.reportingMonth || (state.ov && state.ov.reportDate) || '';
    state.schemaVersion = data.schemaVersion || 1;
    state.listings = (data.listings || []).map(function (row, i) {
      // Schema 2 uses named fields so added spreadsheet columns cannot shift values.
      var r = Array.isArray(row) ? { rank: row[0], name: row[1], group: row[2], tags: row[3], city: row[4],
        rev: row[5], revN: row[6], chg: row[7], occ15: row[8], occ: row[9], occN: row[10], marketPast: row[11], benchmark30: row[12], status: row[13] } : row;
      var tags = String(r.tags || ''), o = {
        id: String(r.id || r.rank || ('report-' + (i + 2))), rank: pn(r.rank), name: r.name, group: String(r.group || '').trim(), tags: tags, city: tcase(r.city),
        type: /by room/i.test(tags) ? 'room' : /entire unit/i.test(tags) ? 'entire' : '',
        rev: pn(r.rev), revN: pn(r.revN), chg: pn(r.chg), blocked: /block/i.test(String(r.rev)), blockedN: /block/i.test(String(r.revN)),
        occ15: pn(r.occ15), occ: pn(r.occ), occN: pn(r.occN), mk: pn(r.marketPast), mk15: pn(r.benchmark15), mkN: pn(r.benchmark30), status: r.status || ''
      };
      o.gapN = o.occN != null && o.mkN != null ? o.occN - o.mkN : null;
      return o;
    }).filter(function (l) {
      // Exclude unmatched source rows and listings with no occupancy data.
      // Zero occupancy is valid; benchmarks alone do not make a listing usable.
      return String(l.name || '').trim() && !/^source match review$/i.test(String(l.status).trim()) &&
        (l.occ != null || l.occ15 != null || l.occN != null);
    });
    state.wl = (data.worklist || []).map(function (r) {
      return { region: r[1], act: nz(r[2]), past: pn(r[3]), n14: pn(r[4]), next: pn(r[5]), c14: pn(r[6]), c30: pn(r[7]),
        b14: pn(r[8]), b30: pn(r[9]), s14: r[10], s30: r[11] };
    });
    state.setup = {};
    (data.setup || []).forEach(function (s) {
      state.setup[String(s.region).toLowerCase()] = { months: s.months.map(pn), b14: pn(s.b14), b30: pn(s.b30), b60: pn(s.b60) };
    });
    // Fill blanks from Property Setup so gaps and statuses are never n/a when a benchmark exists
    state.wl.forEach(function (r) {
      var s = state.setup[String(r.region).toLowerCase()] || {};
      if (r.b14 == null && s.b14 != null) r.b14 = s.b14;
      if (r.b30 == null && s.b30 != null) r.b30 = s.b30;
      if (!r.s14) r.s14 = rate(r.n14, r.b14);
      if (!r.s30) r.s30 = rate(r.next, r.b30);
      if (r.c30 == null && r.next != null && r.past != null) r.c30 = r.next - r.past;
    });
    if (state.ov) {
      var snapshot = state.ov.snapshot || {};
      function addOutlook(horizon, current, benchmark) {
        if (current && current !== 'n/a' && !outlookRow(horizon.toLowerCase())) {
          state.ov.outlook.push({ horizon: horizon, current: current, benchmark: benchmark == null ? '' : pct(benchmark) });
        }
      }
      addOutlook('Past 30 Days', snapshot['PAST 30D OCCUPANCY'], null);
      addOutlook('Next 15 Days', pct(weighted(state.wl, 'n14')), weighted(state.wl, 'b14'));
      addOutlook('Next 30 Days', snapshot['NEXT 30D OCCUPANCY'] || pct(weighted(state.wl, 'next')), weighted(state.wl, 'b30'));
      var order = ['past 30', 'next 15', 'next 30', 'next 60'];
      state.ov.outlook.sort(function (a, b) {
        var ah = String(a.horizon).toLowerCase().replace(/\s+days?$/, '').replace(/d$/, ''),
          bh = String(b.horizon).toLowerCase().replace(/\s+days?$/, '').replace(/d$/, ''),
          ai = order.indexOf(ah), bi = order.indexOf(bh);
        return (ai < 0 ? order.length : ai) - (bi < 0 ? order.length : bi);
      });
    }
    state.monthly = data.monthly || [];
    state.actions = data.regions || [];
    state.details = data.details || {};
    state.tabs = data.tabs || {};
    state.dataDirty = true;
    $('updated').textContent = data.updated ? new Date(data.updated).toLocaleString() : 'Unknown';
  }

  function restoreSnapshot() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(SNAPSHOT_KEY) || 'null');
      if (!saved || !saved.data || !saved.data.ok || !Array.isArray(saved.data.listings) ||
          !saved.savedAt || Date.now() - saved.savedAt > SNAPSHOT_MAX_AGE || saved.savedAt > Date.now()) return;
      normalize(saved.data);
      renderAll();
      state.loaded = true;
      state.version = saved.data.version || '';
      route(true);
    } catch (err) {
      // Storage may be blocked, full, or contain an older incompatible response.
      state.loaded = false;
      state.version = '';
      try { sessionStorage.removeItem(SNAPSHOT_KEY); } catch (ignore) {}
    }
  }

  function renderLoadingView() {
    var view = state.loadingView || 'overview';
    ['overview', 'listings', 'regions', 'data'].forEach(function (name) {
      var skeleton = $(name + '-skeleton');
      skeleton.hidden = name !== view;
      if (name === 'overview' || name !== view || skeleton.innerHTML) return;
      var block = '<span class="skeleton skeleton-control"></span>';
      var html = '<div class="panel skeleton-table-panel">';
      if (name !== 'regions') html += '<div class="skeleton-controls skeleton-tabs">' + block.repeat(name === 'listings' ? 3 : 5) + '</div>';
      else html += '<span class="skeleton skeleton-heading"></span>';
      if (name === 'listings') {
        html += '<div class="skeleton-controls skeleton-filters">' + block.repeat(4) + '</div>' +
          '<span class="skeleton skeleton-caption skeleton-count"></span>';
      }
      html += '<div class="skeleton-controls skeleton-pagination">' + block.repeat(2) +
        '<div class="skeleton-page-buttons">' + block.repeat(2) + '</div></div>';
      var columns = name === 'listings' ? 10 : 8;
      html += '<div class="skeleton-table-scroll"><div class="skeleton-table" style="--skeleton-columns:' + columns + '">';
      for (var row = 0; row < 9; row++) {
        html += '<div class="skeleton-table-row' + (row === 0 ? ' skeleton-table-head' : '') + '">';
        for (var col = 0; col < columns; col++) html += '<span class="skeleton skeleton-cell"></span>';
        html += '</div>';
      }
      skeleton.innerHTML = html + '</div></div></div>';
    });
    $('loading-status').textContent = state.loaded ? 'Showing last loaded data. Checking for updates…' :
      'Loading ' + (view === 'overview' ? 'dashboard' : view) + ' data…';
  }

  function setLoading(loading) {
    state.loading = loading;
    $('dashboard-skeleton').hidden = !loading || state.loaded;
    renderLoadingView();
    $('loading-status').hidden = !loading;
    $('dashboard-content').hidden = !state.loaded;
    $('dashboard-content').setAttribute('aria-busy', String(loading));
    $('refresh').disabled = loading;
    $('refresh').className = 'icon-btn' + (loading ? ' spin' : '');
    if (loading) $('refresh').setAttribute('aria-busy', 'true');
    else $('refresh').removeAttribute('aria-busy');
  }

  function fetchDashboard(url, signal, retried) {
    // ContentService redirects to a temporary response URL. A unique request URL
    // prevents reuse of an expired redirect without bypassing our Apps Script cache.
    var requestUrl = url + (url.indexOf('?') > -1 ? '&' : '?') +
      'requestId=' + Date.now() + '-' + Math.random().toString(36).slice(2);
    return fetch(requestUrl, { signal: signal, cache: 'no-store', redirect: 'follow', credentials: 'omit' }).then(function (res) {
      if (res.status === 404 && !retried) return fetchDashboard(url, signal, true);
      if (!res.ok) {
        if (res.status === 404) {
          var responseHost = '';
          try { responseHost = new URL(res.url).hostname; } catch (ignore) {}
          throw new Error(responseHost === 'script.googleusercontent.com' ?
            'Google could not deliver the Apps Script response (HTTP 404), even after retrying' :
            'The Apps Script web app could not be reached (HTTP 404). Check that API_URL matches the active deployment’s /exec URL');
        }
        throw new Error('The data service returned HTTP ' + res.status);
      }
      return res.json();
    });
  }

  function load(forceFresh) {
    if (state.loading) return;
    if (!API_URL || API_URL.indexOf('PASTE_') === 0) {
      setLoading(false);
      showNotice('Set <code>API_URL</code> in script.js to your Apps Script web app URL.', false);
      return;
    }
    setLoading(true);
    showNotice('', false);
    var url = API_URL + (API_TOKEN ? (API_URL.indexOf('?') > -1 ? '&' : '?') + 'token=' + encodeURIComponent(API_TOKEN) : '');
    if (forceFresh === true) url += (url.indexOf('?') > -1 ? '&' : '?') + 'fresh=1';
    else if (state.loaded && state.version) url += (url.indexOf('?') > -1 ? '&' : '?') + 'since=' + encodeURIComponent(state.version);
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 60000);
    fetchDashboard(url, controller.signal, false).then(function (data) {
      if (!data.ok) throw new Error(data.error || 'The API returned an error');
      if (data.notModified && state.loaded && data.version === state.version) return;
      if (data.notModified || !Array.isArray(data.listings)) throw new Error('The API returned an incomplete response');
      // Capture the original response before normalization enriches it in memory.
      var snapshot = JSON.stringify({ savedAt: Date.now(), data: data });
      normalize(data);
      showNotice(state.schemaVersion < 2 ? 'Some listing occupancy and detail data are unavailable. The data connection needs an update.' : '', false);
      renderAll();
      state.loaded = true;
      state.version = data.version || '';
      route(true);
      try { sessionStorage.setItem(SNAPSHOT_KEY, snapshot); } catch (ignore) {}
    }).catch(function (err) {
      var reason = err.name === 'AbortError' ? 'The request timed out' : esc(err.message);
      showNotice((state.loaded ? 'Could not refresh data. Showing last loaded data. ' : 'Could not load data. ') + reason + '. Use Refresh to try again.', true);
    }).then(function () {
      clearTimeout(timeout);
      setLoading(false);
    });
  }

  function showNotice(html, isErr) {
    var n = $('notice');
    n.hidden = !html;
    n.className = 'notice' + (isErr ? ' err' : '');
    n.innerHTML = html;
  }

  /* ---------- Shared building blocks ---------- */
  function go(href) { return href ? ' data-go="' + href + '" tabindex="0" role="link"' : ''; }
  function chev(href) { return href ? '<i class="fa-solid fa-chevron-right go"></i>' : ''; }

  function olRow(label, cur, b, href, note) {
    var gp = cur != null && b != null ? cur - b : null;
    var gc = gp == null ? 'n' : gp < 0 ? 'r' : 'g';
    return '<div class="ol' + (href ? ' clk' : '') + '"' + go(href) + '><div class="ol-head"><b>' + heading(esc(label)) + '</b><span class="ol-val">' +
      pct(cur) + (b != null ? ' vs ' + pct(b) : '') + '</span>' +
      (gp != null ? '<span class="pill ' + gc + '">' + sign(gp) + pct(gp) + '</span>' : '') + chev(href) + '</div>' +
      (note ? '<div class="ol-note">' + esc(note) + '</div>' : '') +
      '<div class="bar-track"><div class="bar-fill' + (b != null && cur < b ? ' low' : '') + '" style="width:0" data-w="' + clamp(cur || 0) + '"></div>' +
      (b != null ? '<div class="bar-mark" style="left:' + clamp(b) + '%"></div>' : '') + '</div></div>';
  }
  function numRow(label, val, max, href) {
    return '<div class="ol' + (href ? ' clk' : '') + '"' + go(href) + '><div class="ol-head"><b>' + heading(esc(label)) + '</b><span class="ol-val">' + val + '</span>' + chev(href) +
      '</div><div class="bar-track"><div class="bar-fill" style="width:0" data-w="' + clamp(max ? val / max * 100 : 0) + '"></div></div></div>';
  }
  function moneyRow(label, v, max) {
    return '<div class="ol"><div class="ol-head"><b>' + heading(label) + '</b><span class="ol-val">' + money(v) + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:0" data-w="' + clamp(max ? v / max * 100 : 0) + '"></div></div></div>';
  }
  function stat(label, val, sub, c, icon) {
    var status = /class="ind [^"]*" title="([^"]*)"/.exec(String(val));
    return '<div class="stat"><span class="stat-label">' + (icon ? '<i class="fa-solid ' + icon + '" aria-hidden="true"></i>' : '') + '<span class="stat-label-text">' + heading(label) + '</span></span><b class="' + (c || '') + '">' + val + '</b>' + (status ? '<em class="desktop-status">' + status[1] + '</em>' : '') + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
  }
  function panel(title, inner) { return '<article class="panel"><h2>' + heading(title) + '</h2>' + inner + '</article>'; }
  function explain(paras) { return panel('What this means', paras.map(function (p) { return '<p class="txt-p">' + p + '</p>'; }).join('')); }

  var LOGIC = 'Status uses the dashboard color logic. Green means the result is at or above its benchmark. Yellow means it is below the benchmark by no more than 10 percentage points. Red means it is more than 10 points below.';
  var ACTION = { g: 'Maintain the current strategy and monitor normally.', y: 'Review pricing, availability and booking pace.', r: 'Investigate immediately and document an owner and follow-up.' };

  function regionTable(list) {
    if (!list.length) return '<p class="empty">No regions in this list.</p>';
    var head = ['Region', 'Listings', 'Past 30D', 'Next 15D', 'Next 15D Benchmark', 'Next 30D', 'Next 30D Benchmark', 'Indicator'];
    var body = list.map(function (r) {
      return '<tr class="clk"' + go('#/region/' + enc(r.region)) + '><td class="name"><b>' + esc(r.region) + '</b></td>' +
        '<td class="num" data-l="Listings">' + r.act + '</td><td class="num" data-l="Past 30D">' + pct(r.past) + '</td>' +
        '<td class="num" data-l="Next 15D">' + horizonValue(r.n14, r.b14, '15D', r.act ? r.s14 : '') + '</td>' +
        '<td class="num" data-l="Next 15D Benchmark">' + pct(r.b14) + '</td>' +
        '<td class="num" data-l="Next 30D">' + horizonValue(r.next, r.b30, '30D', r.act ? r.s30 : '') + '</td>' +
        '<td class="num" data-l="Next 30D Benchmark">' + pct(r.b30) + '</td>' +
        '<td class="indicator-cell" data-l="Indicator" data-sv="' + sev(regionIndicator(r)) + '">' + ind(regionIndicator(r)) + '</td></tr>';
    }).join('');
    return '<div class="table-wrap"><table class="tbl"><thead><tr>' + head.map(function (h, i) { return '<th' + (i > 0 && i < 7 ? ' class="num"' : '') + '>' + heading(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function regionIndicator(r) {
    if (!r.act) return 'No active listings';
    var statuses = [r.s14, r.s30].filter(function (status) { return status && statusClass(status) !== 'n'; });
    statuses.sort(function (a, b) { return { r: 0, y: 1, g: 2 }[statusClass(a)] - { r: 0, y: 1, g: 2 }[statusClass(b)]; });
    var names = { r: 'Red', y: 'Yellow', g: 'Green' };
    return statuses.length ? names[statusClass(statuses[0])] : 'None';
  }
  function byGap30(a, b) { return ((a.next == null ? 0 : a.next) - (a.b30 || 0)) - ((b.next == null ? 0 : b.next) - (b.b30 || 0)); }
  function findRegion(name) {
    var n = String(name).toLowerCase();
    for (var i = 0; i < state.wl.length; i++) if (String(state.wl[i].region).toLowerCase() === n) return state.wl[i];
    return null;
  }
  function outlookRow(h) {
    if (!state.ov) return null;
    var match = h === 'next 14' ? 'next 15' : h;
    for (var i = 0; i < state.ov.outlook.length; i++) if (state.ov.outlook[i].horizon.toLowerCase().indexOf(match) > -1) return state.ov.outlook[i];
    return null;
  }

  /* ---------- Homepage ---------- */
  function renderOverview() {
    var ov = state.ov;
    if (!ov) return;
    var s = ov.snapshot || {};
    $('rdate').textContent = ov.reportDate ? 'Reporting date: ' + ov.reportDate : '';
    var n30 = outlookRow('next 30');
    $('k-past').textContent = s['PAST 30D OCCUPANCY'] || 'n/a';
    $('k-past-sub').textContent = 'Actual, last 30 days';
    $('k-next').textContent = s['NEXT 30D OCCUPANCY'] || 'n/a';
    $('k-next-sub').textContent = n30 ? 'Benchmark ' + n30.benchmark : 'Actual, next 30 days';
    var gap = s['CHANGE VS TARGET'] || (n30 ? n30.gap : ''), g = pn(gap);
    $('k-gap').textContent = gap || 'n/a';
    $('k-gap').className = 'big ' + cls(g);
    $('k-gap-sub').textContent = g == null ? 'Next 30D vs benchmark' : (g < 0 ? 'Below benchmark' : 'At or above benchmark');
    $('k-active').textContent = s['ACTIVE LISTINGS'] || 'n/a';
    $('k-active-sub').textContent = ov.leBijou ? 'Le Bijou: ' + ov.leBijou : 'Portfolio total';
    $('health').innerHTML = ind(s['OVERALL HEALTH'] || 'Health');

    $('outlook').innerHTML = ov.outlook.map(function (o) {
      return olRow(o.horizon, pn(o.current), pn(o.benchmark), '#/horizon/' + horizonKey(o.horizon));
    }).join('') || '<p class="empty">No outlook data found.</p>';
    setBars($('outlook'));

    $('risks').innerHTML = ov.risks.length ? ov.risks.map(function (r, i) {
      var c = statusClass(r.status);
      return '<li><a class="row-link" href="#/risk/' + i + '"><div class="av ' + c + '"><i class="fa-solid ' + (c === 'r' ? 'fa-triangle-exclamation' : 'fa-eye') + '"></i></div>' +
        '<div class="txt"><b>' + heading(esc(r.label)) + '</b><span>' + esc(r.category) + '</span></div>' +
        '<div class="right"><strong>' + esc(r.value) + '</strong></div><i class="fa-solid fa-chevron-right go desktop-risk-arrow" aria-hidden="true"></i></a></li>';
    }).join('') : '<li class="empty">No risk data found.</li>';

    var k = ov.kpis || {};
    // Use the same Weekly AM Worklist 30D statuses as the linked detail pages.
    // Executive Overview KPI labels can change (for example, adding "(30D)").
    var regionCounts = counts(state.wl, 's30');
    var gr = regionCounts.g, ye = regionCounts.y, re = regionCounts.r, tot = (gr + ye + re) || 1;
    $('status-split').innerHTML = [['g', 'Green', gr], ['y', 'Yellow', ye], ['r', 'Red', re]].map(function (x) {
      return '<a class="split-row row-link" href="#/status/' + x[0] + '">' + ind(x[1]) + '<div class="track"><div class="fill ' + x[0] +
        '" style="width:0" data-w="' + (x[2] / tot * 100) + '"></div></div><div class="split-count">' + x[2] + '</div>' + chev(1) + '</a>';
    }).join('');
    setBars($('status-split'));
    var rows = [
      ['Total Active Listings', 'Total Active Listings'],
      [k['15D Red Regions'] ? '15D Red Regions' : '14D Red Regions', '15D Red Regions'],
      [k['15D Yellow Regions'] ? '15D Yellow Regions' : '14D Yellow Regions', '15D Yellow Regions'],
      ['At-Risk Regions', 'At-Risk Regions'], ['Action Regions', 'Action Regions'],
      ['Overall Past 30D', 'Overall Past 30D'],
      [k['Overall Next 15D'] ? 'Overall Next 15D' : 'Overall Next 14D', 'Overall Next 15D'],
      ['Overall Next 30D', 'Overall Next 30D'], ['Overall Next 60D', 'Overall Next 60D']
    ];
    $('kv').innerHTML = rows.filter(function (r) { return k[r[0]]; }).map(function (r) {
      return '<li><a class="row-link" href="#/kpi/' + enc(r[0]) + '"><span>' + esc(r[1]) + '</span><b>' + esc(k[r[0]]) + '</b>' + chev(1) + '</a></li>';
    }).join('');
  }
  function horizonKey(t) {
    t = String(t).toLowerCase();
    return /past/.test(t) ? 'past' : /14|15/.test(t) ? '14' : /60/.test(t) ? '60' : '30';
  }

  /* Portfolio insights built from the Pricelabs Report and AM Actions tabs */
  function moverList(a, up) {
    return a.map(function (l) {
      return '<li><a class="row-link" href="#/listing/' + enc(l.id) + '"><div class="av ' + (up ? 'g' : 'r') + '"><i class="fa-solid ' + (up ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down') + '"></i></div>' +
        '<div class="txt"><b>' + esc(l.name) + '</b><span>' + esc(l.city) + '</span></div>' +
        '<div class="right"><strong class="' + cls(l.chg) + '">' + sign(l.chg) + pct(l.chg) + '</strong><span>' + money(l.rev) + ' to ' + (l.blockedN ? tag('fa-lock', 'Fully blocked') : money(l.revN)) + '</span></div>' + chev(1) + '</a></li>';
    }).join('');
  }
  function renderInsights() {
    var L = state.listings;
    if (!L.length) {
      ['pulse', 'mix', 'teams', 'cities', 'movers', 'acts'].forEach(function (id) { $(id).innerHTML = ''; });
      return;
    }
    var occN = avg(pluck(L, 'occN')), mkN = avg(pluck(L, 'mkN')), rev = avg(pluck(L, 'revN'));
    var revP = avg(pluck(L.filter(function (l) { return !l.blocked; }), 'rev'));
    var chg = revP ? (rev / revP - 1) * 100 : null, gap = occN != null && mkN != null ? occN - mkN : null;
    var need = L.filter(function (l) { return statusClass(l.status) === 'r'; }).length;
    var blocked = L.filter(function (l) { return l.blocked; }).length;
    $('pulse').innerHTML = stat('Listings tracked', L.length, 'Pricelabs report', '', 'fa-house') +
      stat('Average Next 30D Occupancy', pct(occN), mkN == null ? '' : 'Benchmark ' + pct(mkN) + ', ' + sign(gap) + pct(gap), cls(gap), 'fa-chart-pie') +
      stat('Avg RevPAR Next 30D', money(rev), chg == null ? '' : sign(chg) + pct(chg) + ' vs past', cls(chg), 'fa-sack-dollar') +
      stat('Flagged listings', need, 'Need attention', need ? 'down' : 'up', 'fa-circle-exclamation') +
      stat('Fully blocked', blocked, 'No past RevPAR', '', 'fa-lock');

    var gs = group(L, 'status').sort(function (a, b) { return b.items.length - a.items.length; });
    $('mix').innerHTML = gs.map(function (x) {
      var c = statusClass(x.k);
      return '<a class="split-row row-link" href="#/listings/status:' + enc(x.k) + '">' + ind(x.k) + '<div class="track"><div class="fill ' + (c === 'n' ? 'mid' : c) +
        '" style="width:0" data-w="' + (x.items.length / L.length * 100) + '"></div></div><div class="split-count">' + x.items.length + '</div>' + chev(1) + '</a>';
    }).join('');
    setBars($('mix'));

    $('teams').innerHTML = group(L, 'group').sort(function (a, b) { return String(a.k).localeCompare(b.k); }).map(function (x) {
      return olRow(x.k, avg(pluck(x.items, 'occN')), avg(pluck(x.items, 'mkN')), '#/listings/team:' + enc(x.k),
        x.items.length + ' listings, avg RevPAR Next ' + money(avg(pluck(x.items, 'revN'))));
    }).join('');
    setBars($('teams'));

    $('cities').innerHTML = group(L, 'city').sort(function (a, b) { return b.items.length - a.items.length; }).slice(0, 6).map(function (x) {
      return olRow(x.k, avg(pluck(x.items, 'occN')), avg(pluck(x.items, 'mkN')), '#/listings/city:' + enc(x.k), x.items.length + ' listings');
    }).join('');
    setBars($('cities'));

    var mv = L.filter(function (l) { return l.chg != null && !l.blocked && l.rev >= 50; });
    var up = mv.slice().sort(function (a, b) { return b.chg - a.chg; }).slice(0, 5);
    var dn = mv.slice().sort(function (a, b) { return a.chg - b.chg; }).slice(0, 5);
    $('movers').innerHTML = mv.length ? moverList(up, true) + moverList(dn, false) : '<li class="empty">No RevPAR data found.</li>';

    var A = state.actions.slice().sort(function (a, b) { return sev(a.status) - sev(b.status) || nz(b.tasks) - nz(a.tasks); });
    $('acts').innerHTML = A.length ? A.map(function (a) {
      return '<li><a class="row-link" href="#/region/' + enc(a.name) + '">' + ind(a.status) + '<div class="txt"><b>' + esc(a.name) + '</b><span><i class="fa-solid fa-house"></i> ' + esc(a.active || 0) + '</span></div>' +
        '<div class="right"><strong><i class="fa-solid fa-list-check"></i> ' + esc(a.tasks || 0) + '</strong></div>' + chev(1) + '</a></li>';
    }).join('') : '<li class="empty">No AM actions found.</li>';
  }

  /* ---------- Listings ---------- */
  function unique(a) { var o = {}, out = []; a.forEach(function (v) { if (v && !o[v]) { o[v] = 1; out.push(v); } }); return out.sort(); }
  function fillSelect(sel, first, items) {
    var cur = sel.value;
    sel.innerHTML = '<option value="">' + first + '</option>' + items.map(function (i) { return '<option>' + esc(i) + '</option>'; }).join('');
    sel.value = cur;
  }
  function renderFilters() {
    fillSelect($('f-city'), 'All cities', unique(pluck(state.listings, 'city')));
    fillSelect($('f-team'), 'All teams', unique(pluck(state.listings, 'group')));
    fillSelect($('f-status'), 'All statuses', unique(pluck(state.listings, 'status')));
    var c = { all: state.listings.length, entire: 0, room: 0 };
    state.listings.forEach(function (l) { if (l.type) c[l.type]++; });
    $('n-all').textContent = c.all; $('n-entire').textContent = c.entire; $('n-room').textContent = c.room;
  }
  function filtered() {
    var q = $('q').value.toLowerCase(), city = $('f-city').value, st = $('f-status').value, tm = $('f-team').value, t = state.type;
    var rows = state.listings.filter(function (l) {
      return (t === 'all' || l.type === t) && (!q || String(l.name).toLowerCase().indexOf(q) > -1) &&
        (!city || l.city === city) && (!st || l.status === st) && (!tm || l.group === tm);
    });
    var k = state.sort, dir = state.asc ? 1 : -1;
    rows.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      if (typeof x === 'string') return x.localeCompare(y) * dir;
      return (x - y) * dir;
    });
    return rows;
  }
  function occCell(v, m, horizon) {
    var c = v != null && m != null ? (v >= m ? 'up' : 'down') : '';
    return (horizon ? horizonValue(v, m, horizon) : '<span class="' + c + '">' + pct(v) + '</span>') + (m != null ? '<span class="mk">Benchmark ' + pct(m) + '</span>' : '');
  }
  function renderListings() {
    var rows = filtered(), part = batchRows('listings', rows);
    var headers = $('tbl-listings').querySelectorAll('th[data-sort]');
    $('count').textContent = rows.length.toLocaleString('en-US') + ' listings. Select a listing for details.';
    $('tbl-listings').getElementsByTagName('tbody')[0].innerHTML = part.map(function (l) {
      var cells = {
        name: ['name', '<b>' + esc(l.name) + '</b>'],
        city: ['', esc(l.city)], group: ['', teamTag(l.group)], type: ['', typeTag(l.type)],
        occ: ['num', pct(l.occ)], occ15: ['num occ', horizonValue(l.occ15, l.mk15, '15D')],
        mk15: ['num', pct(l.mk15)], occN: ['num occ', horizonValue(l.occN, l.mkN, '30D')],
        mkN: ['num', pct(l.mkN)],
        status: ['', ind(l.status)]
      };
      return '<tr class="clk"' + go('#/listing/' + enc(l.id)) + '>' + Array.prototype.map.call(headers, function (header) {
        var key = header.getAttribute('data-sort'), cell = cells[key] || ['', 'n/a'];
        return '<td class="' + cell[0] + '" data-l="' + esc(header.textContent.trim()) + '"' +
          (key === 'status' ? ' data-sv="' + esc(l.status) + '"' : '') + '>' + cell[1] + '</td>';
      }).join('') + '</tr>';
    }).join('') || '<tr><td class="empty" colspan="' + headers.length + '">No listings match.</td></tr>';
    var ths = $('tbl-listings').querySelectorAll('th[data-sort]');
    for (var i = 0; i < ths.length; i++) {
      var on = ths[i].getAttribute('data-sort') === state.sort;
      ths[i].className = (ths[i].className.indexOf('num') > -1 ? 'num ' : '') + (on ? 'sorted' + (state.asc ? ' asc' : '') : '');
      if (on) ths[i].setAttribute('aria-sort', state.asc ? 'ascending' : 'descending'); else ths[i].removeAttribute('aria-sort');
    }
    $('sort-by').value = state.sort;
    $('sort-dir').className = 'icon-btn sort-dir' + (state.asc ? '' : ' desc');
  }
  function setChip() {
    var cs = $('types').getElementsByTagName('button');
    for (var i = 0; i < cs.length; i++) cs[i].className = 'chip' + (cs[i].getAttribute('data-type') === state.type ? ' active' : '');
  }
  function applyFilter(arg) {
    var i = arg.indexOf(':');
    if (i < 0) return;
    var k = arg.slice(0, i), v = arg.slice(i + 1);
    $('q').value = ''; $('f-city').value = ''; $('f-status').value = ''; $('f-team').value = ''; state.type = 'all';
    if (k === 'city') $('f-city').value = v; else if (k === 'status') $('f-status').value = v; else if (k === 'team') $('f-team').value = v;
    state.listingsPage = 0; setChip(); renderListings();
  }
  function batchRows(view, rows) {
    var size = state[view + 'PageSize'] || 20;
    var pages = Math.max(1, Math.ceil(rows.length / size));
    var page = Math.max(0, Math.min(state[view + 'Page'] || 0, pages - 1));
    state[view + 'Page'] = page;
    var start = page * size, end = Math.min(start + size, rows.length);
    $(view + '-page-size').value = String(size);
    $(view + '-page-info').textContent = rows.length ? 'Rows ' + (start + 1) + '–' + end + ' of ' + rows.length + ' · Batch ' + (page + 1) + ' of ' + pages : '0 rows';
    $(view + '-prev').disabled = page === 0;
    $(view + '-next').disabled = page >= pages - 1;
    return rows.slice(start, end);
  }
  function renderRegions() {
    var rs = state.rsort || { ci: 0, asc: true };
    var keys = ['region', 'act', 'past', 'n14', 'b14', 'next', 'b30'];
    var rows = state.wl.map(function (r, i) {
      var value = rs.ci === 7 ? sev(regionIndicator(r)) : r[keys[rs.ci]];
      return { r: r, n: i, v: sortValue(value == null ? '' : value) };
    }).sort(function (a, b) { return compareCells(a, b, rs.asc); }).map(function (item) { return item.r; });
    var heads = ['Region', 'Listings', 'Past 30D', 'Next 15D', 'Next 15D Benchmark', 'Next 30D', 'Next 30D Benchmark', 'Indicator'];
    var bar = '<div class="sortbar"><label for="r-sort-by">Sort by</label><select id="r-sort-by">' +
      heads.map(function (h, i) { return '<option value="' + i + '">' + h + '</option>'; }).join('') +
      '</select><button class="icon-btn sort-dir" id="r-sort-dir" aria-label="Reverse order"><i class="fa-solid fa-arrow-up-wide-short"></i></button></div>';
    $('regions-wrap').innerHTML = bar + regionTable(batchRows('regions', rows));
    enableSort($('regions-wrap'));
    var table = $('regions-wrap').getElementsByTagName('table')[0];
    if (table) {
      table.id = 'tbl-regions';
      table.tHead.rows[0].cells[rs.ci].setAttribute('aria-sort', rs.asc ? 'ascending' : 'descending');
      table.parentNode.setAttribute('tabindex', '0');
      table.parentNode.setAttribute('role', 'region');
      table.parentNode.setAttribute('aria-label', 'Regions table');
    }
    $('r-sort-by').value = rs.ci;
    $('r-sort-dir').className = 'icon-btn sort-dir' + (rs.asc ? '' : ' desc');
  }

  /* Extra tabs (Regional Performance, AM Action Inputs, Monthly Inputs, Legend) */
  function dataTitle() {
    return state.tab === 'Legend' ? 'Dashboard Legend And Guide' : 'Data';
  }
  function renderData() {
    state.dataDirty = false;
    var names = Object.keys(state.tabs);
    $('data-pagination').hidden = !names.length;
    if (!names.length) { $('data-tabs').innerHTML = ''; $('data-wrap').innerHTML = '<p class="empty">No extra tabs were returned by the API.</p>'; return; }
    if (!state.tabs[state.tab]) { state.tab = names[0]; state.dataPage = 0; state.dataSort = null; }
    $('data-tabs').innerHTML = names.map(function (n) {
      return '<button class="chip' + (n === state.tab ? ' active' : '') + '" data-tab="' + esc(n) + '"><i class="fa-solid ' + (TABICON[n] || 'fa-table') + '"></i>' + esc(n) + '</button>';
    }).join('');
    var t = state.tabs[state.tab];
    if (state.tab === 'Legend') {
      var legendHeaders = ['Item', 'Description', 'Context', 'Guidance'];
      var firstRow = t.rows[0] || [];
      var hasHeaderRow = legendHeaders.every(function (h, i) {
        return String(firstRow[i] || '').trim().toLowerCase() === h.toLowerCase();
      });
      // The workbook's title row is metadata; its next row labels the columns.
      // Copy the presentation so cached API data stays unchanged across renders.
      t = { headers: legendHeaders, rows: hasHeaderRow ? t.rows.slice(1) : t.rows };
    }
    if (state.loadingView === 'data') setTitle(dataTitle());
    var size = state.dataPageSize || 20, rows = t.rows.slice(), sort = state.dataSort;
    if (sort && sort.ci < t.headers.length) {
      rows = rows.map(function (r, i) {
        var value = String(r[sort.ci] == null ? '' : r[sort.ci]);
        return { r: r, n: i, v: sortValue(/^(green|yellow|red)$/i.test(value) || isStable(value) ? String(sev(value)) : value) };
      }).sort(function (a, b) { return compareCells(a, b, sort.asc); }).map(function (item) { return item.r; });
    }
    var pages = Math.max(1, Math.ceil(rows.length / size));
    state.dataPage = Math.max(0, Math.min(state.dataPage || 0, pages - 1));
    var start = state.dataPage * size, end = Math.min(start + size, rows.length);
    $('data-page-size').value = String(size);
    $('data-page-info').textContent = rows.length ? 'Rows ' + (start + 1) + '–' + end + ' of ' + rows.length + ' · Batch ' + (state.dataPage + 1) + ' of ' + pages : '0 rows';
    $('data-prev').disabled = state.dataPage === 0;
    $('data-next').disabled = state.dataPage >= pages - 1;
    $('data-wrap').innerHTML = '<div class="table-wrap" tabindex="0" role="region" aria-label="' + esc(state.tab) + ' data table"><table class="tbl" id="tbl-data"><thead><tr>' +
      t.headers.map(function (h, i) { return '<th' + (sort && sort.ci === i ? ' aria-sort="' + (sort.asc ? 'ascending' : 'descending') + '"' : '') + '>' + heading(esc(h)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.slice(start, end).map(function (r) {
        return '<tr>' + r.map(function (c, i) {
          var s = String(c), st = /^(green|yellow|red)$/i.test(s) || isStable(s), num = /^[+\-]?\$?[\d,.]+%?$/.test(s);
          return '<td class="' + (num ? 'num' : '') + '" data-l="' + heading(esc(t.headers[i])) + '"' + (st ? ' data-sv="' + sev(s) + '"' : '') + '>' + (st ? ind(s) : esc(s)) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>';
    enableSort($('data-wrap'));
  }
  function renderAll() { renderOverview(); renderInsights(); renderFilters(); renderListings(); renderRegions(); }

  /* ---------- Detail pages ---------- */
  function regionBars(list, horizon) {
    var rows = list.slice();
    if (horizon === '14') rows.sort(function (a, b) { return ((a.n14 || 0) - (a.b14 || 0)) - ((b.n14 || 0) - (b.b14 || 0)); });
    else if (horizon === 'past') rows.sort(function (a, b) { return (b.past || 0) - (a.past || 0); });
    else if (horizon !== 'below') rows.sort(byGap30);
    return rows.map(function (r) {
      var h = '#/region/' + enc(r.region);
      if (horizon === '14') return olRow(r.region, r.n14, r.b14, h);
      if (horizon === 'past') return olRow(r.region, r.past, null, h);
      if (horizon === 'below') return olRow(r.region, r.next, r.past, h, '30D change vs past: ' + sign(r.c30) + pct(r.c30));
      return olRow(r.region, r.next, r.b30, h);
    }).join('');
  }
  function counts(list, key) {
    var c = { g: 0, y: 0, r: 0 };
    list.forEach(function (r) { var k = statusClass(r[key]); if (c[k] !== undefined) c[k]++; });
    return c;
  }

  function dRisk(i) {
    var r = state.ov && state.ov.risks[i];
    if (!r) return null;
    var t = r.label.toLowerCase(), list, hz = '30', how, meaning;
    if (/red 30d/.test(t)) {
      list = state.wl.filter(function (x) { return x.s30 === 'Red'; });
      meaning = 'These regions have a Next 30D occupancy more than 10 points below their reporting-month 30D benchmark.';
      how = 'Counts regions whose 30D status is Red on the Weekly AM Worklist. ' + LOGIC;
    } else if (/red (?:14|15)d/.test(t)) {
      list = state.wl.filter(function (x) { return x.s14 === 'Red'; }); hz = '14';
      meaning = 'These regions have a Next 15D estimate more than 10 points below their reporting-month 15D benchmark. This is the nearest term warning.';
      how = 'Counts regions whose 15D status is Red on the Weekly AM Worklist. The 15D figure and benchmark are read directly from the workbook.';
    } else if (/below past/.test(t)) {
      list = state.wl.filter(function (x) { return x.c30 != null && x.c30 < 0; }); hz = 'below';
      meaning = 'These regions are expected to book fewer nights over the next 30 days than they achieved over the past 30 days.';
      how = 'Counts regions where the 30D change vs past is below zero (Next 30D occupancy minus Past 30D occupancy).';
    } else {
      list = state.wl.filter(function (x) { return x.s30 === 'Red'; });
      meaning = 'This is the retention exposure reported on the Executive Overview. It is based on the client and retention tiers kept on the Management Inputs tab.';
      how = 'The count comes from the Executive Overview. The regions below are the Red 30D regions, shown as context because occupancy risk is what puts retention at risk.';
    }
    if (hz === 'below') list.sort(function (a, b) { return a.c30 - b.c30; });
    var c = statusClass(r.status);
    var html = '<div class="stats">' + stat('Reported value', esc(r.value), esc(r.category), '', 'fa-gauge-high') + stat('Status', ind(r.status), '', '', 'fa-flag') +
      stat('Regions listed', list.length, hz === 'below' ? 'Next 30D vs past 30D' : 'Next ' + (hz === '14' ? '15' : '30') + 'D vs benchmark', '', 'fa-location-dot') + '</div>' +
      explain([meaning, '<b>How it is calculated.</b> ' + how, '<b>Suggested action.</b> ' + ACTION[c === 'n' ? 'y' : c]]) +
      panel(hz === 'below' ? 'Next 30D occupancy vs past 30D level' : 'Actual vs benchmark by region', '<div class="legend"><span><i class="sw sw-fill"></i>Next occupancy</span><span><i class="sw sw-mark"></i>' + (hz === 'below' ? 'Past 30D level' : 'Benchmark') + '</span></div>' + (regionBars(list, hz) || '<p class="empty">No regions to list.</p>')) +
      panel('Region numbers', regionTable(list));
    return { title: r.label, sub: r.category, parent: 'overview', html: html };
  }

  var STATUS_NAME = { g: 'On track', y: 'Watch', r: 'Action' };
  function dStatus(k) {
    if (!STATUS_NAME[k]) return null;
    var list = state.wl.filter(function (x) { return statusClass(x.s30) === k; });
    var all = counts(state.wl, 's30'), listings = 0;
    list.forEach(function (x) { listings += x.act; });
    var html = '<div class="stats">' + stat('Regions', list.length, 'of ' + state.wl.length + ' regions', '', 'fa-location-dot') + stat('Active listings', listings, 'in these regions', '', 'fa-house') +
      stat('Mix', all.g + ' / ' + all.y + ' / ' + all.r, 'Green / Yellow / Red', '', 'fa-chart-simple') + '</div>' +
      explain([LOGIC, '<b>Suggested action.</b> ' + ACTION[k], 'This page uses the 30D status, which compares each region\'s Next 30D occupancy with its reporting-month 30D benchmark.']) +
      panel('Next 30D occupancy vs benchmark', '<div class="legend"><span><i class="sw sw-fill"></i>Next 30D</span><span><i class="sw sw-mark"></i>Benchmark</span></div>' + (regionBars(list, '30') || '<p class="empty">No regions in this group.</p>')) +
      panel('Region numbers', regionTable(list.sort(byGap30)));
    return { title: STATUS_NAME[k] + ' regions', sub: '30D status', parent: 'overview', html: html };
  }

  var HZ = {
    past: { t: 'Past 30D occupancy', key: 'past', d: 'What recently happened. This is the historical occupancy baseline used for comparison, so it has no benchmark of its own.' },
    '14': { t: 'Next 15D occupancy', key: 'n14', b: 'b14', s: 's14', d: 'The near term occupancy outlook and benchmark reported by the workbook.' },
    '30': { t: 'Next 30D occupancy', key: 'next', b: 'b30', s: 's30', d: 'The forward booking outlook, compared with the reporting-month 30D benchmark to assign status.' },
    '60': { t: 'Next 60D occupancy', key: null, d: 'The longer range outlook. The workbook reports the portfolio figure and a benchmark per region, but it does not break out regional actuals for 60 days.' }
  };
  function dHorizon(h) {
    var def = HZ[h];
    if (!def) return null;
    var o = outlookRow(h === 'past' ? 'past' : 'next ' + h), cur = o ? pn(o.current) : null, b = o ? pn(o.benchmark) : null;
    var html = '<div class="stats">' + stat('Actual', pct(cur), 'Portfolio', '', 'fa-chart-line') + stat('Benchmark', pct(b), b == null ? 'No benchmark for this period' : 'Portfolio', '', 'fa-bullseye') +
      stat('Gap', cur != null && b != null ? sign(cur - b) + pct(cur - b) : 'n/a', 'Actual minus benchmark', cur != null && b != null ? cls(cur - b) : '', 'fa-arrows-up-down') + '</div>';
    var paras = [def.d];
    if (def.s) paras.push(LOGIC);
    html += explain(paras);
    if (def.key) {
      html += '<div class="stats">' + (function () {
        if (!def.s) return stat('Regions', state.wl.length, 'reporting', '', 'fa-location-dot');
        var c = counts(state.wl, def.s);
        return stat(ind('Green'), c.g, 'Regions') + stat(ind('Yellow'), c.y, 'Regions') + stat(ind('Red'), c.r, 'Regions');
      })() + '</div>';
      html += panel('By region', (def.b ? '<div class="legend"><span><i class="sw sw-fill"></i>Actual</span><span><i class="sw sw-mark"></i>Benchmark</span></div>' : '') +
        regionBars(state.wl, h)) + panel('Region numbers', regionTable(state.wl.slice().sort(byGap30)));
    } else {
      var rows = state.wl.map(function (r) { var s = state.setup[String(r.region).toLowerCase()]; return { r: r.region, b: s ? s.b60 : null }; })
        .filter(function (x) { return x.b != null; }).sort(function (a, b) { return a.b - b.b; });
      html += panel('60D benchmark by region', rows.map(function (x) { return olRow(x.r, x.b, null, '#/region/' + enc(x.r)); }).join('') || '<p class="empty">No 60D data.</p>');
    }
    return { title: def.t, sub: 'Portfolio view', parent: 'overview', html: html };
  }

  function dKpi(name) {
    var map = { 'Overall Past 30D': 'past', 'Overall Next 14D': '14', 'Overall Next 15D': '14', 'Overall Next 30D': '30', 'Overall Next 60D': '60' };
    if (map[name]) return dHorizon(map[name]);
    var k = (state.ov && state.ov.kpis) || {}, list, html, paras;
    if (name === 'Total Active Listings') {
      var max = 0, tot = 0;
      var rows = state.wl.slice().sort(function (a, b) { return b.act - a.act; });
      rows.forEach(function (r) { tot += r.act; if (r.act > max) max = r.act; });
      paras = ['Eligible listings are unique listing IDs that are synced, available and shown, with no inactive override. This page splits the total across regions.'];
      html = '<div class="stats">' + stat('Reported total', esc(k[name] || tot), 'Executive Overview', '', 'fa-house') + stat('Regions', rows.length, 'with listings', '', 'fa-location-dot') + stat('Largest region', rows[0] ? esc(rows[0].region) : 'n/a', rows[0] ? rows[0].act + ' listings' : '', '', 'fa-trophy') + '</div>' +
        explain(paras) + panel('Active listings by region', rows.map(function (r) { return numRow(r.region, r.act, max, '#/region/' + enc(r.region)); }).join('')) + panel('Region numbers', regionTable(rows));
      return { title: name, sub: 'Portfolio view', parent: 'overview', html: html };
    }
    var hz = '30', desc;
    if (name === '14D Red Regions' || name === '15D Red Regions') { list = state.wl.filter(function (x) { return x.s14 === 'Red'; }); hz = '14'; desc = 'Regions with a 15D status of Red.'; }
    else if (name === '14D Yellow Regions' || name === '15D Yellow Regions') { list = state.wl.filter(function (x) { return x.s14 === 'Yellow'; }); hz = '14'; desc = 'Regions with a 15D status of Yellow.'; }
    else if (name === 'At-Risk Regions') { list = state.wl.filter(function (x) { return x.s30 === 'Red'; }); desc = 'Regions with a 30D status of Red. This matches the Red Regions count.'; }
    else if (name === 'Action Regions') {
      var names = {}; state.actions.forEach(function (a) { names[a.name] = 1; });
      list = state.wl.filter(function (x) { return names[x.region]; }); desc = 'Regions on the AM Actions exception list: not fully green, or with an open task. Overall status is the worse of the 15D and 30D status.';
    } else return null;
    var tasks = 0; state.actions.forEach(function (a) { tasks += nz(a.tasks); });
    html = '<div class="stats">' + stat('Reported value', esc(k[name] || list.length), 'Executive Overview', '', 'fa-gauge-high') + stat('Regions listed', list.length, '', '', 'fa-location-dot') +
      (name === 'Action Regions' ? stat('Open tasks', tasks, 'AM Action Inputs', '', 'fa-list-check') : '') + '</div>' +
      explain([desc, LOGIC]) +
      panel('Actual vs benchmark by region', '<div class="legend"><span><i class="sw sw-fill"></i>Actual</span><span><i class="sw sw-mark"></i>Benchmark</span></div>' + (regionBars(list, hz) || '<p class="empty">No regions in this list.</p>')) +
      panel('Region numbers', regionTable(list));
    return { title: name, sub: 'Portfolio view', parent: 'overview', html: html };
  }

  function dRegion(name) {
    var r = findRegion(name);
    if (!r) return null;
    name = r.region;
    var su = state.setup[String(name).toLowerCase()] || {};
    var act = null;
    state.actions.forEach(function (a) { if (a.name === name) act = a; });
    var overall = regionIndicator(r);
    var html = '<div class="stats">' + stat('Active listings', r.act, '', '', 'fa-house') + stat('Overall status', ind(overall), 'Worse of 15D and 30D', '', 'fa-flag') +
      stat('Open tasks', act ? esc(act.tasks) : '0', act ? 'On the AM Actions list' : 'Not on the AM Actions list', '', 'fa-list-check') +
      stat('30D change vs past', r.c30 == null ? 'n/a' : sign(r.c30) + pct(r.c30), 'Next 30D minus past 30D', cls(r.c30), 'fa-arrows-up-down') + '</div>';
    html += panel('Actual vs benchmark',
      '<div class="legend"><span><i class="sw sw-fill"></i>Actual</span><span><i class="sw sw-mark"></i>Benchmark</span></div>' +
      olRow('Past 30 days', r.past, null) + olRow('Next 15 days', r.n14, r.b14) + olRow('Next 30 days', r.next, r.b30) +
      (su.b60 != null ? olRow('Next 60 days benchmark', su.b60, null) : '') +
      '<div class="legend"><span>15D ' + ind(r.s14) + '</span><span>30D ' + ind(r.s30) + '</span></div>');
    html += explain([LOGIC, '<b>Suggested action.</b> ' + (ACTION[statusClass(overall)] || 'No active listings; no occupancy action is required.')]);
    if (su.months && su.months.length) {
      var monthName = String(state.reportingMonth).slice(0, 3).toLowerCase();
      var cm = MONTHS.map(function (m) { return m.toLowerCase(); }).indexOf(monthName);
      html += panel('Monthly occupancy targets', '<div class="cols">' + su.months.map(function (v, i) {
        return '<div class="col' + (i === cm ? ' now' : '') + '"><div class="col-wrap"><div class="col-bar" style="height:' + clamp(v || 0) + '%"></div></div><em>' + (v == null ? '' : Math.round(v)) + '</em><span>' + MONTHS[i] + '</span></div>';
      }).join('') + '</div><p class="hint">Targets by calendar month. The workbook reporting month is highlighted.</p>');
    }
    var mp = state.monthly.filter(function (m) { return m.region === name; });
    if (mp.length) {
      html += panel('Monthly performance', '<div class="table-wrap"><table class="tbl"><thead><tr><th>Month</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Coverage</th><th class="num">Actual vs Target</th><th>Review</th></tr></thead><tbody>' +
        mp.map(function (m) {
          return '<tr><td class="name"><b>' + esc(m.month) + '</b></td><td class="num" data-l="Target">' + esc(m.target || 'n/a') + '</td><td class="num" data-l="Actual">' + esc(m.actual || 'n/a') + '</td>' +
            '<td class="num" data-l="Coverage">' + esc(m.coverage || 'n/a') + '</td>' +
            '<td class="num ' + cls(pn(m.gap)) + '" data-l="Actual vs Target">' + esc(m.gap || 'n/a') + '</td><td data-l="Review" data-sv="' + esc(m.status) + '">' + ind(m.status) + '</td></tr>';
        }).join('') + '</tbody></table></div>');
    }
    var ls = state.listings.filter(function (l) { return String(l.city).toLowerCase() === String(name).toLowerCase(); });
    if (ls.length) html += panel('Listings in ' + esc(name), listingTable(ls.slice(0, 15)) + (ls.length > 15 ? '<p class="lead-link"><a class="more" href="#/listings/city:' + enc(ls[0].city) + '">View all ' + ls.length + ' listings</a></p>' : ''));
    return { title: name, sub: 'Region detail', parent: 'regions', html: html };
  }

  function listingTable(ls) {
    return '<div class="table-wrap"><table class="tbl"><thead><tr><th>Rank</th><th>Listing</th><th class="num">Next 30D</th><th class="num">RevPAR Next</th><th>Status</th></tr></thead><tbody>' +
      ls.map(function (l) {
        return '<tr class="clk"' + go('#/listing/' + enc(l.id)) + '><td data-l="Rank">' + (l.rank == null ? 'n/a' : l.rank) + '</td><td class="name"><b>' + esc(l.name) + '</b></td>' +
          '<td class="num" data-l="Next 30D">' + pct(l.occN) + '</td><td class="num" data-l="RevPAR Next">' + money(l.revN) + '</td><td data-l="Status" data-sv="' + esc(l.status) + '">' + ind(l.status) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function dListing(rank) {
    var l = null;
    state.listings.forEach(function (x) { if (String(x.id) === String(rank)) l = x; });
    if (!l) state.listings.forEach(function (x) { if (x.rank != null && String(x.rank) === String(rank)) l = x; });
    if (!l) return null;
    var d = state.details[String(l.name).trim().toLowerCase()];
    var maxRev = Math.max(l.rev, l.revN, 1);
    var html = '<div class="stats">' + stat('Rank', l.rank == null ? 'n/a' : '#' + l.rank, 'By forward RevPAR', '', 'fa-ranking-star') + stat('Status', ind(l.status), '', '', 'fa-flag') +
      stat('Type', typeTag(l.type), TYPE[l.type] || 'Other', '', 'fa-house') + stat('Team', teamTag(l.group, true), esc(l.group || 'No team'), '', 'fa-user-group') +
      stat('City', esc(l.city || 'n/a'), '', '', 'fa-location-dot') + '</div>';
    html += panel('Occupancy vs benchmark', '<div class="legend"><span><i class="sw sw-fill"></i>Listing</span><span><i class="sw sw-mark"></i>Benchmark</span></div>' +
      olRow('Next 15 days', l.occ15, l.mk15) + olRow('Past 30 days', l.occ, l.mk) + olRow('Next 30 days', l.occN, l.mkN));
    html += panel('RevPAR', '<div class="stats">' + stat('Past 30 days', rvm(l, l.rev), '') + stat('Next 30 days', l.blockedN ? tag('fa-lock', 'Fully blocked') : money(l.revN), '') +
      stat('Change', l.chg == null ? 'n/a' : sign(l.chg) + pct(l.chg), 'Next vs past', cls(l.chg)) + '</div>' +
      moneyRow('Past 30 days', l.rev, maxRev) + moneyRow('Next 30 days', l.revN, maxRev));
    if (d) {
      if (Array.isArray(d)) d = { bedrooms: d[2], base: d[3], recommended: d[4], pickup: d[5], lastBooked: d[6] };
      var base = pn(d.base), rec = pn(d.recommended);
      html += panel('Pricing and bookings', '<div class="stats">' + stat('Base price', money(base), '', '', 'fa-tag') + stat('Recommended base', money(rec), base && rec ? (rec >= base ? '+' : '') + pct((rec / base - 1) * 100) + ' vs base' : '', base && rec ? cls(rec - base) : '', 'fa-wand-magic-sparkles') +
        stat('30D Booking Pickup', esc(d.pickup === '' || d.pickup == null ? 'n/a' : d.pickup), '', '', 'fa-calendar-plus') + stat('Last booked', esc(d.lastBooked || 'n/a'), d.bedrooms ? esc(d.bedrooms) + ' bedrooms' : '', '', 'fa-bed') + '</div>');
    }
    var tg = String(l.tags).split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    if (tg.length) html += panel('Tags', '<div class="tagrow">' + tg.map(function (t) { return '<span class="tagchip">' + esc(t) + '</span>'; }).join('') + '</div>');
    var notes = [];
    if (l.occN != null && l.mkN != null) notes.push('Next 30 day occupancy is ' + pct(Math.abs(l.occN - l.mkN)) + ' points ' + (l.occN >= l.mkN ? 'above' : 'below') + ' the benchmark.');
    if (l.occ != null && l.mk != null) notes.push('Past 30 day occupancy was ' + pct(Math.abs(l.occ - l.mk)) + ' points ' + (l.occ >= l.mk ? 'above' : 'below') + ' the benchmark.');
    if (l.chg != null) notes.push('Forward RevPAR is ' + (l.chg >= 0 ? 'up ' : 'down ') + pct(Math.abs(l.chg)) + ' compared with the past 30 days.');
    if (l.blocked) notes.push('This listing was fully blocked over the past 30 days, so there is no past RevPAR to compare.');
    if (l.blockedN) notes.push('This listing is fully blocked over the next 30 days, so forward RevPAR is unavailable.');
    notes.push('The rank orders listings by forward RevPAR. The Pricelabs Report contains managed properties matched to raw data by unique property name. Missing or ambiguous matches are marked Source match review.');
    html += explain(notes);
    var reg = l.city ? findRegion(l.city) : null;
    if (reg) html += '<p class="lead-link"><a class="more" href="#/region/' + enc(reg.region) + '"><i class="fa-solid fa-location-dot"></i> ' + esc(reg.region) + '</a></p>';
    return { title: l.name, sub: 'Listing detail', parent: 'listings', html: html };
  }

  function renderDetail(kind, arg) {
    var r = null;
    if (kind === 'risk') r = dRisk(+arg);
    else if (kind === 'status') r = dStatus(arg);
    else if (kind === 'horizon') r = dHorizon(arg);
    else if (kind === 'kpi') r = dKpi(arg);
    else if (kind === 'region') r = dRegion(arg);
    else if (kind === 'listing') r = dListing(arg);
    var el = $('detail');
    if (!r) { el.innerHTML = '<a class="back" data-back="overview" href="#/overview"><i class="fa-solid fa-arrow-left"></i>Back</a><p class="empty">That item was not found in the latest data.</p>'; setTitle('Not found', ''); return; }
    el.innerHTML = '<a class="back" data-back="' + r.parent + '" href="#/' + r.parent + '"><i class="fa-solid fa-arrow-left"></i>Back</a>' + r.html;
    setTitle(r.title, r.sub);
    enableSort(el);
    setBars(el);
    return r.parent;
  }

  /* ---------- Sortable tables ---------- */
  function cellVal(c) {
    return sortValue(c.getAttribute('data-sv') || c.textContent);
  }
  function sortValue(value) {
    var t = String(value).replace(/\s+/g, ' ').trim();
    var low = t.toLowerCase();
    if (/^[+\-]?\$?\d[\d,]*(\.\d+)?\s*%?$/.test(t)) return { n: parseFloat(t.replace(/[^0-9.\-]/g, '')) };
    return { s: low, na: low === '' || low === 'n/a' || low === 'none' };
  }
  function compareCells(a, b, asc) {
    if (!!a.v.na !== !!b.v.na) return a.v.na ? 1 : -1;
    var d;
    if (a.v.n != null && b.v.n != null) d = a.v.n - b.v.n;
    else d = String(a.v.s != null ? a.v.s : a.v.n).localeCompare(String(b.v.s != null ? b.v.s : b.v.n));
    return d ? (asc ? d : -d) : a.n - b.n;
  }
  function sortBy(table, ci, asc) {
    if (!table) return;
    if (table.id === 'tbl-regions') {
      state.rsort = { ci: ci, asc: asc };
      state.regionsPage = 0;
      renderRegions();
      return;
    }
    if (table.id === 'tbl-data') {
      state.dataSort = { ci: ci, asc: asc };
      state.dataPage = 0;
      renderData();
      return;
    }
    var tb = table.tBodies[0], rows = [].slice.call(tb.rows), i;
    var keyed = rows.map(function (r, n) { return { r: r, v: cellVal(r.cells[ci]), n: n }; });
    keyed.sort(function (a, b) {
      return compareCells(a, b, asc);
    });
    keyed.forEach(function (k) { tb.appendChild(k.r); });
    var ths = table.tHead.rows[0].cells;
    for (i = 0; i < ths.length; i++) ths[i].removeAttribute('aria-sort');
    ths[ci].setAttribute('aria-sort', asc ? 'ascending' : 'descending');
    if (table.parentNode.parentNode.id === 'regions-wrap') {
      state.rsort = { ci: ci, asc: asc };
      var sel = $('r-sort-by'), btn = $('r-sort-dir');
      if (sel) sel.value = ci;
      if (btn) btn.className = 'icon-btn sort-dir' + (asc ? '' : ' desc');
    }
  }
  function enableSort(root) {
    var tables = root.querySelectorAll('.tbl');
    for (var t = 0; t < tables.length; t++) {
      if (tables[t].id === 'tbl-listings' || !tables[t].tHead) continue;
      var ths = tables[t].tHead.rows[0].cells;
      for (var i = 0; i < ths.length; i++) ths[i].className += ' sortable';
    }
  }

  /* ---------- Routing ---------- */
  var TITLES = { overview: 'Dashboard', listings: 'Listings', regions: 'Regions', data: 'Data' };
  function setTitle(t, sub) {
    $('title').textContent = heading(t);
    $('rdate').textContent = sub || '';
  }
  function show(view, navView) {
    state.loadingView = navView;
    renderLoadingView();
    ['overview', 'listings', 'regions', 'data', 'detail'].forEach(function (v) { $('view-' + v).hidden = v !== view; });
    var btns = document.querySelectorAll('.nav-btn');
    for (var i = 0; i < btns.length; i++) btns[i].className = 'nav-btn' + (btns[i].getAttribute('data-view') === navView ? ' active' : '');
    closeMenu();
  }
  function route(keepScroll) {
    var p = location.hash.replace(/^#\/?/, '').split('/');
    var kind = p[0] || 'overview', arg = p[1] ? decodeURIComponent(p[1]) : '';
    if (TITLES[kind]) {
      if (kind === 'data' && state.loaded && state.dataDirty) renderData();
      if (kind === 'listings' && arg && state.loaded) applyFilter(arg);
      show(kind, kind);
      setTitle(kind === 'data' ? dataTitle() : TITLES[kind], kind === 'overview' && state.ov && state.ov.reportDate ? 'Reporting date: ' + state.ov.reportDate : '');
    } else {
      var nav = kind === 'listing' ? 'listings' : kind === 'region' ? 'regions' : 'overview';
      show('detail', nav);
      if (!state.loaded) { $('detail').innerHTML = '<p class="empty">Loading data.</p>'; setTitle('Loading', ''); }
      else renderDetail(kind, arg);
    }
    if (!keepScroll) window.scrollTo(0, 0);
  }
  function openMenu() { $('side').className = 'side open'; $('scrim').className = 'scrim show'; }
  function closeMenu() { $('side').className = 'side'; $('scrim').className = 'scrim'; }

  /* ---------- Theme: classic or glass ---------- */
  function setTheme(glass, save) {
    $('glass-css').disabled = !glass;
    document.documentElement.setAttribute('data-theme', glass ? 'glass' : 'classic');
    $('theme').setAttribute('aria-pressed', glass ? 'true' : 'false');
    if (save) { try { localStorage.setItem('pd-theme', glass ? 'glass' : 'classic'); } catch (e) {} }
  }

  /* ---------- Events ---------- */
  window.addEventListener('hashchange', function () { navCount++; route(); });
  document.addEventListener('click', function (e) {
    var t = e.target, back = null, g = null;
    while (t && t !== document) {
      if (t.getAttribute) {
        if (!back && t.getAttribute('data-back')) back = t;
        if (!g && t.getAttribute('data-go')) g = t;
        if (t.tagName === 'A' && t.getAttribute('href')) break;
      }
      t = t.parentNode;
    }
    if (back && navCount > 0 && window.history.length > 1) { e.preventDefault(); window.history.back(); navCount = Math.max(0, navCount - 2); return; }
    if (g && !(t && t.tagName === 'A')) location.hash = g.getAttribute('data-go');
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.keyCode !== 13) return;
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-go')) location.hash = t.getAttribute('data-go');
  });
  $('nav').addEventListener('click', function (e) {
    var b = e.target; while (b && b !== this && !b.getAttribute('data-view')) b = b.parentNode;
    if (b && b.getAttribute && b.getAttribute('data-view')) location.hash = '#/' + b.getAttribute('data-view');
  });
  $('menu').addEventListener('click', openMenu);
  $('scrim').addEventListener('click', closeMenu);
  $('refresh').addEventListener('click', function () { load(true); });
  var glassOn = document.documentElement.getAttribute('data-theme') === 'glass';
  try {
    var savedTheme = localStorage.getItem('pd-theme');
    if (savedTheme === 'glass' || savedTheme === 'classic') glassOn = savedTheme === 'glass';
  } catch (e) {}
  setTheme(glassOn, false);
  $('theme').addEventListener('click', function () { glassOn = !glassOn; setTheme(glassOn, true); });
  $('types').addEventListener('click', function (e) {
    var b = e.target; while (b && b !== this && !b.getAttribute('data-type')) b = b.parentNode;
    if (!b || !b.getAttribute) return;
    state.type = b.getAttribute('data-type');
    state.listingsPage = 0;
    setChip();
    renderListings();
  });
  $('data-tabs').addEventListener('click', function (e) {
    var b = e.target; while (b && b !== this && !b.getAttribute('data-tab')) b = b.parentNode;
    if (!b || !b.getAttribute) return;
    state.tab = b.getAttribute('data-tab');
    state.dataPage = 0;
    state.dataSort = null;
    renderData();
  });
  $('data-page-size').addEventListener('change', function () {
    var size = Number(this.value);
    if ([20, 50, 100, 200].indexOf(size) === -1) return;
    state.dataPageSize = size;
    state.dataPage = 0;
    renderData();
  });
  $('data-prev').addEventListener('click', function () { state.dataPage = Math.max(0, (state.dataPage || 0) - 1); renderData(); });
  $('data-next').addEventListener('click', function () { state.dataPage = (state.dataPage || 0) + 1; renderData(); });
  ['q', 'f-city', 'f-team', 'f-status'].forEach(function (id) {
    $(id).addEventListener(id === 'q' ? 'input' : 'change', function () { state.listingsPage = 0; renderListings(); });
  });
  ['listings', 'regions'].forEach(function (view) {
    var render = view === 'listings' ? renderListings : renderRegions;
    function update() {
      render();
      var wrap = $('view-' + view).querySelector('.table-wrap');
      if (wrap) wrap.scrollTop = 0;
    }
    $(view + '-page-size').addEventListener('change', function () {
      var size = Number(this.value);
      if ([20, 50, 100, 200].indexOf(size) < 0) return;
      state[view + 'PageSize'] = size;
      state[view + 'Page'] = 0;
      update();
    });
    $(view + '-prev').addEventListener('click', function () { state[view + 'Page'] = Math.max(0, (state[view + 'Page'] || 0) - 1); update(); });
    $(view + '-next').addEventListener('click', function () { state[view + 'Page'] = (state[view + 'Page'] || 0) + 1; update(); });
  });
  $('tbl-listings').getElementsByTagName('thead')[0].addEventListener('click', function (e) {
    var k = e.target.getAttribute('data-sort'); if (!k) return;
    state.asc = state.sort === k ? !state.asc : true;
    state.sort = k;
    state.listingsPage = 0;
    renderListings();
  });

  (function () {
    var sb = $('sort-by'), ths = $('tbl-listings').querySelectorAll('th[data-sort]');
    sb.innerHTML = [].map.call(ths, function (th) { return '<option value="' + th.getAttribute('data-sort') + '">' + th.textContent + '</option>'; }).join('');
    sb.addEventListener('change', function () { state.sort = this.value; state.asc = true; state.listingsPage = 0; renderListings(); });
    $('sort-dir').addEventListener('click', function () { state.asc = !state.asc; state.listingsPage = 0; renderListings(); });
  })();
  document.addEventListener('change', function (e) {
    if (e.target.id === 'r-sort-by') sortBy($('regions-wrap').getElementsByTagName('table')[0], +e.target.value, true);
  });
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.id === 'r-sort-dir' || (t.parentNode && t.parentNode.id === 'r-sort-dir')) {
      var rs = state.rsort || { ci: 0, asc: true };
      sortBy($('regions-wrap').getElementsByTagName('table')[0], rs.ci, !rs.asc);
      return;
    }
    while (t && t.tagName !== 'TH') t = t.parentNode;
    if (t && /sortable/.test(t.className)) {
      var table = t.parentNode.parentNode.parentNode;
      sortBy(table, t.cellIndex, t.getAttribute('aria-sort') !== 'ascending');
    }
  });

  route();
  restoreSnapshot();
  load();
  setInterval(function () { if (!document.hidden) load(); }, REFRESH_MS);
})();
