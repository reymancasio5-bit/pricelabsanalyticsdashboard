(function () {
  'use strict';

  /* ---------- Settings ---------- */
  var API_URL = 'https://script.google.com/macros/s/AKfycbyu8Cl-OooWP5zSxAIe09X1aZWNKmaumCJR9ZQIVWZHabQ5wLA2Qa8AUNxLwiYwaOhg/exec'; // Apps Script web app URL (ends with /exec)
  var API_TOKEN = 'e5f2a9b8c3d7e1f0a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1';                          // Same value as API_TOKEN in Code.gs, or leave empty
  var REFRESH_MS = 5 * 60 * 1000;
  var PAGE_SIZE = 25;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  var state = { ov: null, listings: [], wl: [], setup: {}, monthly: [], actions: [], details: {},
    type: 'all', shown: PAGE_SIZE, sort: 'rank', asc: true, loaded: false };
  var navCount = 0;

  /* ---------- Helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function pn(v) {
    var s = String(v == null ? '' : v);
    if (!/\d/.test(s)) return null;
    var n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? null : n;
  }
  function nz(v) { var n = pn(v); return n == null ? 0 : n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pct(n) { return n == null ? 'n/a' : (Math.round(n * 10) / 10) + '%'; }
  function money(n) { return n == null ? 'n/a' : '$' + Math.round(n).toLocaleString('en-US'); }
  function sign(n) { return n > 0 ? '+' : ''; }
  function clamp(n) { return Math.max(0, Math.min(100, n)); }
  function enc(s) { return encodeURIComponent(s); }
  function cls(n) { return n == null ? '' : n < 0 ? 'down' : 'up'; }
  function statusClass(s) {
    s = String(s).toLowerCase();
    if (s === 'green' || /improv|on track/.test(s)) return 'g';
    if (s === 'yellow' || /watch|review/.test(s)) return 'y';
    if (s === 'red' || /declin|immediate|action|attention|needs/.test(s)) return 'r';
    return 'n';
  }
  function rate(v, b) { // color logic from the Legend tab
    if (v == null || b == null) return '';
    return v >= b ? 'Green' : (b - v <= 10 ? 'Yellow' : 'Red');
  }
  function sev(s) { s = String(s).toLowerCase(); return s === 'red' ? 0 : s === 'yellow' ? 1 : s === 'green' ? 2 : 3; } // worst first
  function pill(text) { return '<span class="pill ' + statusClass(text) + '">' + esc(text || 'None') + '</span>'; }
  function setBars(root) {
    var els = root.querySelectorAll('[data-w]');
    setTimeout(function () { for (var i = 0; i < els.length; i++) els[i].style.width = els[i].getAttribute('data-w') + '%'; }, 40);
  }

  /* ---------- Data ---------- */
  function normalize(data) {
    state.ov = data.overview || null;
    state.listings = (data.listings || []).map(function (r) {
      var tags = String(r[3] || '');
      return {
        rank: pn(r[0]), name: r[1], group: r[2] || '', tags: tags, city: r[4] || '',
        type: /by room/i.test(tags) ? 'room' : /entire unit/i.test(tags) ? 'entire' : '',
        rev: nz(r[5]), revN: nz(r[6]), chg: pn(r[7]),
        occ15: pn(r[8]), occ: pn(r[9]), occN: pn(r[10]), mk: pn(r[11]), mkN: pn(r[12]), status: r[13] || ''
      };
    }).filter(function (l) { return l.rank != null; });
    state.wl = (data.worklist || []).map(function (r) {
      return { region: r[1], act: nz(r[2]), past: pn(r[3]), n14: pn(r[4]), next: pn(r[5]), c14: pn(r[6]), c30: pn(r[7]),
        b14: pn(r[8]), b30: pn(r[9]), s14: r[10], s30: r[11] };
    });
    state.setup = {};
    (data.setup || []).forEach(function (s) {
      state.setup[String(s.region).toLowerCase()] = { months: s.months.map(pn), b14: pn(s.b14), b30: pn(s.b30), b60: pn(s.b60) };
    });
    state.monthly = data.monthly || [];
    state.actions = data.regions || [];
    state.details = data.details || {};
    $('updated').textContent = data.updated ? new Date(data.updated).toLocaleString() : 'Unknown';
  }

  function load() {
    var btn = $('refresh');
    if (!API_URL || API_URL.indexOf('PASTE_') === 0) {
      showNotice('Set <code>API_URL</code> in script.js to your Apps Script web app URL.', false);
      return;
    }
    btn.className = 'icon-btn spin';
    var url = API_URL + (API_TOKEN ? (API_URL.indexOf('?') > -1 ? '&' : '?') + 'token=' + encodeURIComponent(API_TOKEN) : '');
    fetch(url).then(function (res) { return res.json(); }).then(function (data) {
      if (!data.ok) throw new Error(data.error || 'The API returned an error');
      normalize(data);
      state.loaded = true;
      showNotice('', false);
      renderAll();
      route(true);
    }).catch(function (err) {
      showNotice('Could not load data. ' + esc(err.message) + '. Check the web app URL and that access is set to Anyone.', true);
    }).then(function () { btn.className = 'icon-btn'; });
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

  // Actual vs benchmark row with bar, benchmark marker and gap
  function olRow(label, cur, b, href, note) {
    var gp = cur != null && b != null ? cur - b : null;
    var gc = gp == null ? 'n' : gp < 0 ? 'r' : 'g';
    return '<div class="ol' + (href ? ' clk' : '') + '"' + go(href) + '><div class="ol-head"><b>' + esc(label) + '</b><span class="ol-val">' +
      pct(cur) + (b != null ? ' vs ' + pct(b) : '') + '</span>' +
      (gp != null ? '<span class="pill ' + gc + '">' + sign(gp) + pct(gp) + '</span>' : '') + chev(href) + '</div>' +
      (note ? '<div class="ol-note">' + esc(note) + '</div>' : '') +
      '<div class="bar-track"><div class="bar-fill' + (b != null && cur < b ? ' low' : '') + '" style="width:0" data-w="' + clamp(cur || 0) + '"></div>' +
      (b != null ? '<div class="bar-mark" style="left:' + clamp(b) + '%"></div>' : '') + '</div></div>';
  }
  function numRow(label, val, max, href) {
    return '<div class="ol' + (href ? ' clk' : '') + '"' + go(href) + '><div class="ol-head"><b>' + esc(label) + '</b><span class="ol-val">' + val + '</span>' + chev(href) +
      '</div><div class="bar-track"><div class="bar-fill" style="width:0" data-w="' + clamp(max ? val / max * 100 : 0) + '"></div></div></div>';
  }
  function moneyRow(label, v, max) {
    return '<div class="ol"><div class="ol-head"><b>' + label + '</b><span class="ol-val">' + money(v) + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:0" data-w="' + clamp(max ? v / max * 100 : 0) + '"></div></div></div>';
  }
  function stat(label, val, sub, c) {
    return '<div class="stat"><span>' + label + '</span><b class="' + (c || '') + '">' + val + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
  }
  function panel(title, inner) { return '<article class="panel"><h2>' + title + '</h2>' + inner + '</article>'; }
  function explain(paras) { return panel('What this means', paras.map(function (p) { return '<p class="txt-p">' + p + '</p>'; }).join('')); }

  var LOGIC = 'Status uses the dashboard color logic. Green means the result is at or above its benchmark. Yellow means it is below the benchmark by no more than 10 percentage points. Red means it is more than 10 points below.';
  var ACTION = { g: 'Maintain the current strategy and monitor normally.', y: 'Review pricing, availability and booking pace.', r: 'Investigate immediately and document an owner and follow-up.' };

  // Table of regions, each row opens the region page
  function regionTable(list) {
    if (!list.length) return '<p class="empty">No regions in this list.</p>';
    var head = ['Region', 'Listings', 'Past 30D', 'Next 14D', '14D gap', 'Next 30D', '30D gap', '14D status', '30D status'];
    var body = list.map(function (r) {
      var g14 = r.n14 != null && r.b14 != null ? r.n14 - r.b14 : null;
      var g30 = r.next != null && r.b30 != null ? r.next - r.b30 : null;
      return '<tr class="clk"' + go('#/region/' + enc(r.region)) + '><td class="name"><b>' + esc(r.region) + '</b></td>' +
        '<td class="num" data-l="Listings">' + r.act + '</td><td class="num" data-l="Past 30D">' + pct(r.past) + '</td>' +
        '<td class="num" data-l="Next 14D">' + pct(r.n14) + '</td>' +
        '<td class="num ' + cls(g14) + '" data-l="14D gap">' + (g14 == null ? 'n/a' : sign(g14) + pct(g14)) + '</td>' +
        '<td class="num" data-l="Next 30D">' + pct(r.next) + '</td>' +
        '<td class="num ' + cls(g30) + '" data-l="30D gap">' + (g30 == null ? 'n/a' : sign(g30) + pct(g30)) + '</td>' +
        '<td data-l="14D status" data-sv="' + sev(r.s14) + '">' + pill(r.s14) + '</td><td data-l="30D status" data-sv="' + sev(r.s30) + '">' + pill(r.s30) + '</td></tr>';
    }).join('');
    return '<div class="table-wrap"><table class="tbl"><thead><tr>' + head.map(function (h, i) { return '<th' + (i > 0 && i < 7 ? ' class="num"' : '') + '>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function byGap30(a, b) { return ((a.next == null ? 0 : a.next) - (a.b30 || 0)) - ((b.next == null ? 0 : b.next) - (b.b30 || 0)); }
  function findRegion(name) { for (var i = 0; i < state.wl.length; i++) if (state.wl[i].region === name) return state.wl[i]; return null; }
  function outlookRow(h) {
    if (!state.ov) return null;
    for (var i = 0; i < state.ov.outlook.length; i++) if (state.ov.outlook[i].horizon.toLowerCase().indexOf(h) > -1) return state.ov.outlook[i];
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
    var h = s['OVERALL HEALTH'] || 'Health';
    $('health').textContent = h;
    $('health').className = 'pill ' + statusClass(h);

    $('outlook').innerHTML = ov.outlook.map(function (o) {
      return olRow(o.horizon, pn(o.current), pn(o.benchmark), '#/horizon/' + horizonKey(o.horizon));
    }).join('') || '<p class="empty">No outlook data found.</p>';
    setBars($('outlook'));

    $('risks').innerHTML = ov.risks.length ? ov.risks.map(function (r, i) {
      var c = statusClass(r.status);
      return '<li><a class="row-link" href="#/risk/' + i + '"><div class="av ' + c + '"><i class="fa-solid ' + (c === 'r' ? 'fa-triangle-exclamation' : 'fa-eye') + '"></i></div>' +
        '<div class="txt"><b>' + esc(r.label) + '</b><span>' + esc(r.category) + '</span></div>' +
        '<div class="right"><strong>' + esc(r.value) + '</strong><span class="pill ' + c + '">' + esc(r.status) + '</span></div>' + chev(1) + '</a></li>';
    }).join('') : '<li class="empty">No risk data found.</li>';

    var k = ov.kpis || {};
    var gr = nz(k['Green Regions']), ye = nz(k['Yellow Regions']), re = nz(k['Red Regions']), tot = (gr + ye + re) || 1;
    $('status-split').innerHTML = [['g', 'On track', gr], ['y', 'Watch', ye], ['r', 'Action', re]].map(function (x) {
      return '<a class="split-row row-link" href="#/status/' + x[0] + '"><div class="lbl">' + x[1] + '</div><div class="track"><div class="fill ' + x[0] +
        '" style="width:0" data-w="' + (x[2] / tot * 100) + '"></div></div><div class="n">' + x[2] + '</div>' + chev(1) + '</a>';
    }).join('');
    setBars($('status-split'));
    $('kv').innerHTML = ['Total Active Listings', '14D Red Regions', '14D Yellow Regions', 'At-Risk Regions', 'Action Regions',
      'Overall Past 30D', 'Overall Next 14D', 'Overall Next 30D', 'Overall Next 60D'].filter(function (n) { return k[n]; }).map(function (n) {
      return '<li><a class="row-link" href="#/kpi/' + enc(n) + '"><span>' + esc(n) + '</span><b>' + esc(k[n]) + '</b>' + chev(1) + '</a></li>';
    }).join('');
  }
  function horizonKey(t) {
    t = String(t).toLowerCase();
    return /past/.test(t) ? 'past' : /14/.test(t) ? '14' : /60/.test(t) ? '60' : '30';
  }

  /* ---------- Listings ---------- */
  function unique(a) { var o = {}, out = []; a.forEach(function (v) { if (v && !o[v]) { o[v] = 1; out.push(v); } }); return out.sort(); }
  function fillSelect(sel, first, items) {
    var cur = sel.value;
    sel.innerHTML = '<option value="">' + first + '</option>' + items.map(function (i) { return '<option>' + esc(i) + '</option>'; }).join('');
    sel.value = cur;
  }
  function renderFilters() {
    fillSelect($('f-city'), 'All cities', unique(state.listings.map(function (l) { return l.city; })));
    fillSelect($('f-status'), 'All statuses', unique(state.listings.map(function (l) { return l.status; })));
    var c = { all: state.listings.length, entire: 0, room: 0 };
    state.listings.forEach(function (l) { if (l.type) c[l.type]++; });
    $('n-all').textContent = c.all; $('n-entire').textContent = c.entire; $('n-room').textContent = c.room;
  }
  function filtered() {
    var q = $('q').value.toLowerCase(), city = $('f-city').value, st = $('f-status').value, t = state.type;
    var rows = state.listings.filter(function (l) {
      return (t === 'all' || l.type === t) && (!q || String(l.name).toLowerCase().indexOf(q) > -1) &&
        (!city || l.city === city) && (!st || l.status === st);
    });
    var k = state.sort, dir = state.asc ? 1 : -1;
    rows.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (x == null) x = -99999;
      if (y == null) y = -99999;
      if (typeof x === 'string') return x.localeCompare(y) * dir;
      return (x - y) * dir;
    });
    return rows;
  }
  function occCell(v, m) {
    var c = v != null && m != null ? (v >= m ? 'up' : 'down') : '';
    return '<span class="' + c + '">' + pct(v) + '</span>' + (m != null ? '<span class="mk">Market ' + pct(m) + '</span>' : '');
  }
  var TYPE = { entire: 'Entire Unit', room: 'By Room' };
  function renderListings() {
    var rows = filtered(), part = rows.slice(0, state.shown);
    $('count').textContent = rows.length.toLocaleString('en-US') + ' listings. Select a listing for details.';
    $('tbl-listings').getElementsByTagName('tbody')[0].innerHTML = part.map(function (l) {
      return '<tr class="clk"' + go('#/listing/' + l.rank) + '><td data-l="Rank">' + l.rank + '</td>' +
        '<td class="name"><b>' + esc(l.name) + '</b>' + (l.group ? '<span>' + esc(l.group) + '</span>' : '') + '</td>' +
        '<td data-l="City">' + esc(l.city) + '</td>' +
        '<td data-l="Type">' + (l.type ? '<span class="pill n">' + TYPE[l.type] + '</span>' : 'Other') + '</td>' +
        '<td class="num occ" data-l="Occ. next 15D">' + occCell(l.occ15, null) + '</td>' +
        '<td class="num occ" data-l="Occ. past 30D">' + occCell(l.occ, l.mk) + '</td>' +
        '<td class="num occ" data-l="Occ. next 30D">' + occCell(l.occN, l.mkN) + '</td>' +
        '<td class="num" data-l="RevPAR past">' + money(l.rev) + '</td>' +
        '<td class="num" data-l="RevPAR next">' + money(l.revN) + '</td>' +
        '<td class="num ' + cls(l.chg) + '" data-l="Change">' + (l.chg == null ? 'n/a' : sign(l.chg) + pct(l.chg)) + '</td>' +
        '<td data-l="Status">' + pill(l.status) + '</td></tr>';
    }).join('') || '<tr><td class="empty">No listings match.</td></tr>';
    $('more').hidden = rows.length <= state.shown;
    var ths = $('tbl-listings').querySelectorAll('th[data-sort]');
    for (var i = 0; i < ths.length; i++) {
      var on = ths[i].getAttribute('data-sort') === state.sort;
      ths[i].className = (ths[i].className.indexOf('num') > -1 ? 'num ' : '') + (on ? 'sorted' + (state.asc ? ' asc' : '') : '');
      if (on) ths[i].setAttribute('aria-sort', state.asc ? 'ascending' : 'descending'); else ths[i].removeAttribute('aria-sort');
    }
    $('sort-by').value = state.sort;
    $('sort-dir').className = 'icon-btn sort-dir' + (state.asc ? '' : ' desc');
  }
  function renderRegions() {
    var rows = state.wl.slice().sort(function (a, b) { return String(a.region).localeCompare(String(b.region)); });
    var heads = ['Region', 'Listings', 'Past 30D', 'Next 14D', '14D gap', 'Next 30D', '30D gap', '14D status', '30D status'];
    var bar = '<div class="sortbar"><label for="r-sort-by">Sort by</label><select id="r-sort-by">' +
      heads.map(function (h, i) { return '<option value="' + i + '">' + h + '</option>'; }).join('') +
      '</select><button class="icon-btn sort-dir" id="r-sort-dir" aria-label="Reverse order"><i class="fa-solid fa-arrow-up-wide-short"></i></button></div>';
    $('regions-wrap').innerHTML = bar + regionTable(rows);
    enableSort($('regions-wrap'));
    var rs = state.rsort || { ci: 0, asc: true };
    sortBy($('regions-wrap').getElementsByTagName('table')[0], rs.ci, rs.asc);
  }
  function renderAll() { renderOverview(); renderFilters(); renderListings(); renderRegions(); }

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
      meaning = 'These regions have a Next 30D occupancy more than 10 points below their rolling 30D benchmark.';
      how = 'Counts regions whose 30D status is Red on the Weekly AM Worklist. ' + LOGIC;
    } else if (/red 14d/.test(t)) {
      list = state.wl.filter(function (x) { return x.s14 === 'Red'; }); hz = '14';
      meaning = 'These regions have a Next 14D estimate more than 10 points below their rolling 14D benchmark. This is the nearest term warning.';
      how = 'Counts regions whose 14D status is Red on the Weekly AM Worklist. The 14D figure uses manual overrides, and blank overrides use Next 30D occupancy plus 10 points, capped at 100%.';
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
    var html = '<div class="stats">' + stat('Reported value', esc(r.value), esc(r.category)) + stat('Status', pill(r.status), '') +
      stat('Regions listed', list.length, hz === 'below' ? 'Next 30D vs past 30D' : 'Next ' + (hz === '14' ? '14' : '30') + 'D vs benchmark') + '</div>' +
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
    var html = '<div class="stats">' + stat('Regions', list.length, 'of ' + state.wl.length + ' regions') + stat('Active listings', listings, 'in these regions') +
      stat('Mix', all.g + ' / ' + all.y + ' / ' + all.r, 'Green / Yellow / Red') + '</div>' +
      explain([LOGIC, '<b>Suggested action.</b> ' + ACTION[k], 'This page uses the 30D status, which compares each region\'s Next 30D occupancy with its rolling 30D benchmark.']) +
      panel('Next 30D occupancy vs benchmark', '<div class="legend"><span><i class="sw sw-fill"></i>Next 30D</span><span><i class="sw sw-mark"></i>Benchmark</span></div>' + (regionBars(list, '30') || '<p class="empty">No regions in this group.</p>')) +
      panel('Region numbers', regionTable(list.sort(byGap30)));
    return { title: STATUS_NAME[k] + ' regions', sub: '30D status', parent: 'overview', html: html };
  }

  var HZ = {
    past: { t: 'Past 30D occupancy', key: 'past', d: 'What recently happened. This is the historical occupancy baseline used for comparison, so it has no benchmark of its own.' },
    '14': { t: 'Next 14D occupancy', key: 'n14', b: 'b14', s: 's14', d: 'The near term outlook. It uses undated manual overrides, and blank overrides use Next 30D occupancy plus 10 points, capped at 100%.' },
    '30': { t: 'Next 30D occupancy', key: 'next', b: 'b30', s: 's30', d: 'The forward booking outlook, compared with the rolling 30D benchmark to assign status.' },
    '60': { t: 'Next 60D occupancy', key: null, d: 'The longer range outlook. The workbook reports the portfolio figure and a benchmark per region, but it does not break out regional actuals for 60 days.' }
  };
  function dHorizon(h) {
    var def = HZ[h];
    if (!def) return null;
    var o = outlookRow(h === 'past' ? 'past' : 'next ' + h), cur = o ? pn(o.current) : null, b = o ? pn(o.benchmark) : null;
    var html = '<div class="stats">' + stat('Actual', pct(cur), 'Portfolio') + stat('Benchmark', pct(b), b == null ? 'No benchmark for this period' : 'Portfolio') +
      stat('Gap', cur != null && b != null ? sign(cur - b) + pct(cur - b) : 'n/a', 'Actual minus benchmark', cur != null && b != null ? cls(cur - b) : '') + '</div>';
    var paras = [def.d];
    if (def.s) paras.push(LOGIC);
    html += explain(paras);
    if (def.key) {
      html += '<div class="stats">' + (function () {
        if (!def.s) return stat('Regions', state.wl.length, 'reporting');
        var c = counts(state.wl, def.s);
        return stat('Green', c.g, 'Regions') + stat('Yellow', c.y, 'Regions') + stat('Red', c.r, 'Regions');
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
    var map = { 'Overall Past 30D': 'past', 'Overall Next 14D': '14', 'Overall Next 30D': '30', 'Overall Next 60D': '60' };
    if (map[name]) return dHorizon(map[name]);
    var k = (state.ov && state.ov.kpis) || {}, list, html, paras;
    if (name === 'Total Active Listings') {
      var max = 0, tot = 0;
      var rows = state.wl.slice().sort(function (a, b) { return b.act - a.act; });
      rows.forEach(function (r) { tot += r.act; if (r.act > max) max = r.act; });
      paras = ['Eligible listings are unique listing IDs that are synced, available and shown, with no inactive override. This page splits the total across regions.'];
      html = '<div class="stats">' + stat('Reported total', esc(k[name] || tot), 'Executive Overview') + stat('Regions', rows.length, 'with listings') + stat('Largest region', rows[0] ? esc(rows[0].region) : 'n/a', rows[0] ? rows[0].act + ' listings' : '') + '</div>' +
        explain(paras) + panel('Active listings by region', rows.map(function (r) { return numRow(r.region, r.act, max, '#/region/' + enc(r.region)); }).join('')) + panel('Region numbers', regionTable(rows));
      return { title: name, sub: 'Portfolio view', parent: 'overview', html: html };
    }
    var hz = '30', desc;
    if (name === '14D Red Regions') { list = state.wl.filter(function (x) { return x.s14 === 'Red'; }); hz = '14'; desc = 'Regions with a 14D status of Red.'; }
    else if (name === '14D Yellow Regions') { list = state.wl.filter(function (x) { return x.s14 === 'Yellow'; }); hz = '14'; desc = 'Regions with a 14D status of Yellow.'; }
    else if (name === 'At-Risk Regions') { list = state.wl.filter(function (x) { return x.s30 === 'Red'; }); desc = 'Regions with a 30D status of Red. This matches the Red Regions count.'; }
    else if (name === 'Action Regions') {
      var names = {}; state.actions.forEach(function (a) { names[a.name] = 1; });
      list = state.wl.filter(function (x) { return names[x.region]; }); desc = 'Regions on the AM Actions exception list: not fully green, or with an open task. Overall status is the worse of the 14D and 30D status.';
    } else return null;
    var tasks = 0; state.actions.forEach(function (a) { tasks += nz(a.tasks); });
    html = '<div class="stats">' + stat('Reported value', esc(k[name] || list.length), 'Executive Overview') + stat('Regions listed', list.length, '') +
      (name === 'Action Regions' ? stat('Open tasks', tasks, 'AM Action Inputs') : '') + '</div>' +
      explain([desc, LOGIC]) +
      panel('Actual vs benchmark by region', '<div class="legend"><span><i class="sw sw-fill"></i>Actual</span><span><i class="sw sw-mark"></i>Benchmark</span></div>' + (regionBars(list, hz) || '<p class="empty">No regions in this list.</p>')) +
      panel('Region numbers', regionTable(list));
    return { title: name, sub: 'Portfolio view', parent: 'overview', html: html };
  }

  function dRegion(name) {
    var r = findRegion(name);
    if (!r) return null;
    var su = state.setup[String(name).toLowerCase()] || {};
    var act = null;
    state.actions.forEach(function (a) { if (a.name === name) act = a; });
    var overall = statusClass(r.s14) === 'r' || statusClass(r.s30) === 'r' ? 'Red' : (statusClass(r.s14) === 'y' || statusClass(r.s30) === 'y' ? 'Yellow' : 'Green');
    var html = '<div class="stats">' + stat('Active listings', r.act, '') + stat('Overall status', pill(overall), 'Worse of 14D and 30D') +
      stat('Open tasks', act ? esc(act.tasks) : '0', act ? 'On the AM Actions list' : 'Not on the AM Actions list') +
      stat('30D change vs past', r.c30 == null ? 'n/a' : sign(r.c30) + pct(r.c30), 'Next 30D minus past 30D', cls(r.c30)) + '</div>';
    html += panel('Actual vs benchmark',
      '<div class="legend"><span><i class="sw sw-fill"></i>Actual</span><span><i class="sw sw-mark"></i>Benchmark</span></div>' +
      olRow('Past 30 days', r.past, null) + olRow('Next 14 days, status ' + (r.s14 || 'n/a'), r.n14, r.b14) + olRow('Next 30 days, status ' + (r.s30 || 'n/a'), r.next, r.b30) +
      (su.b60 != null ? olRow('Next 60 days benchmark', su.b60, null) : ''));
    html += explain([LOGIC, '<b>Suggested action.</b> ' + ACTION[statusClass(overall)]]);
    if (su.months && su.months.length) {
      var cm = new Date().getMonth();
      html += panel('Monthly occupancy targets', '<div class="cols">' + su.months.map(function (v, i) {
        return '<div class="col' + (i === cm ? ' now' : '') + '"><div class="col-wrap"><div class="col-bar" style="height:' + clamp(v || 0) + '%"></div></div><em>' + (v == null ? '' : Math.round(v)) + '</em><span>' + MONTHS[i] + '</span></div>';
      }).join('') + '</div><p class="hint">Targets by calendar month. The current month is highlighted.</p>');
    }
    var mp = state.monthly.filter(function (m) { return m.region === name; });
    if (mp.length) {
      html += panel('Monthly performance', '<div class="table-wrap"><table class="tbl"><thead><tr><th>Month</th><th class="num">Target</th><th class="num">Actual</th><th class="num">Actual vs target</th><th>Review</th></tr></thead><tbody>' +
        mp.map(function (m) {
          return '<tr><td class="name"><b>' + esc(m.month) + '</b></td><td class="num" data-l="Target">' + esc(m.target || 'n/a') + '</td><td class="num" data-l="Actual">' + esc(m.actual || 'n/a') + '</td>' +
            '<td class="num ' + cls(pn(m.gap)) + '" data-l="Actual vs target">' + esc(m.gap || 'n/a') + '</td><td data-l="Review"><span class="pill n">' + esc(m.status || 'None') + '</span></td></tr>';
        }).join('') + '</tbody></table></div>');
    }
    var ls = state.listings.filter(function (l) { return String(l.city).toLowerCase() === String(name).toLowerCase(); }).slice(0, 15);
    if (ls.length) html += panel('Listings in ' + esc(name), listingTable(ls));
    return { title: name, sub: 'Region detail', parent: 'regions', html: html };
  }

  function listingTable(ls) {
    return '<div class="table-wrap"><table class="tbl"><thead><tr><th>Rank</th><th>Listing</th><th class="num">Next 30D</th><th class="num">RevPAR next</th><th>Status</th></tr></thead><tbody>' +
      ls.map(function (l) {
        return '<tr class="clk"' + go('#/listing/' + l.rank) + '><td data-l="Rank">' + l.rank + '</td><td class="name"><b>' + esc(l.name) + '</b></td>' +
          '<td class="num" data-l="Next 30D">' + pct(l.occN) + '</td><td class="num" data-l="RevPAR next">' + money(l.revN) + '</td><td data-l="Status">' + pill(l.status) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function dListing(rank) {
    var l = null;
    state.listings.forEach(function (x) { if (String(x.rank) === String(rank)) l = x; });
    if (!l) return null;
    var d = state.details[String(l.name).trim().toLowerCase()];
    var maxRev = Math.max(l.rev, l.revN, 1);
    var html = '<div class="stats">' + stat('Rank', '#' + l.rank, 'By forward RevPAR') + stat('Status', pill(l.status), '') +
      stat('Type', l.type ? TYPE[l.type] : 'Other', esc(l.group || '')) + stat('City', esc(l.city || 'n/a'), '') + '</div>';
    html += panel('Occupancy vs market', '<div class="legend"><span><i class="sw sw-fill"></i>Listing</span><span><i class="sw sw-mark"></i>Market</span></div>' +
      olRow('Next 15 days', l.occ15, null) + olRow('Past 30 days', l.occ, l.mk) + olRow('Next 30 days', l.occN, l.mkN));
    html += panel('RevPAR', '<div class="stats">' + stat('Past 30 days', money(l.rev), '') + stat('Next 30 days', money(l.revN), '') +
      stat('Change', l.chg == null ? 'n/a' : sign(l.chg) + pct(l.chg), 'Next vs past', cls(l.chg)) + '</div>' +
      moneyRow('Past 30 days', l.rev, maxRev) + moneyRow('Next 30 days', l.revN, maxRev));
    if (d) {
      var base = pn(d[3]), rec = pn(d[4]);
      html += panel('Pricing and bookings', '<div class="stats">' + stat('Base price', money(base), '') + stat('Recommended base', money(rec), base && rec ? (rec >= base ? '+' : '') + pct((rec / base - 1) * 100) + ' vs base' : '', base && rec ? cls(rec - base) : '') +
        stat('Bookings pickup 30D', esc(d[5] || 'n/a'), '') + stat('Last booked', esc(d[6] || 'n/a'), d[2] ? esc(d[2]) + ' bedrooms' : '') + '</div>');
    }
    var notes = [];
    if (l.occN != null && l.mkN != null) notes.push('Next 30 day occupancy is ' + pct(Math.abs(l.occN - l.mkN)) + ' points ' + (l.occN >= l.mkN ? 'above' : 'below') + ' the market.');
    if (l.occ != null && l.mk != null) notes.push('Past 30 day occupancy was ' + pct(Math.abs(l.occ - l.mk)) + ' points ' + (l.occ >= l.mk ? 'above' : 'below') + ' the market.');
    if (l.chg != null) notes.push('Forward RevPAR is ' + (l.chg >= 0 ? 'up ' : 'down ') + pct(Math.abs(l.chg)) + ' compared with the past 30 days.');
    notes.push('The rank orders listings by forward RevPAR. The Pricelabs Report includes all raw listings, including inactive and test records.');
    html += explain(notes);
    if (l.city && findRegion(l.city)) html += '<p class="lead-link"><a class="more" href="#/region/' + enc(l.city) + '">View region: ' + esc(l.city) + '</a></p>';
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


  /* ---------- Sortable tables (Regions and detail tables) ---------- */
  function cellVal(c) {
    var t = String(c.getAttribute('data-sv') || c.textContent).replace(/\s+/g, ' ').trim();
    var low = t.toLowerCase();
    if (/^[+\-]?\$?\d[\d,]*(\.\d+)?\s*%?$/.test(t)) return { n: parseFloat(t.replace(/[^0-9.\-]/g, '')) };
    return { s: low, na: low === '' || low === 'n/a' || low === 'none' };
  }
  function sortBy(table, ci, asc) {
    var tb = table.tBodies[0], rows = [].slice.call(tb.rows), i;
    var keyed = rows.map(function (r, n) { return { r: r, v: cellVal(r.cells[ci]), n: n }; });
    keyed.sort(function (a, b) {
      if (a.v.na !== b.v.na) return a.v.na ? 1 : -1; // blanks always last
      var d;
      if (a.v.n != null && b.v.n != null) d = a.v.n - b.v.n;
      else d = String(a.v.s != null ? a.v.s : a.v.n).localeCompare(String(b.v.s != null ? b.v.s : b.v.n));
      return d ? (asc ? d : -d) : a.n - b.n;
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
  var TITLES = { overview: 'Dashboard', listings: 'Listings', regions: 'Regions' };
  function setTitle(t, sub) {
    $('title').textContent = t;
    $('rdate').textContent = sub || '';
  }
  function show(view, navView) {
    ['overview', 'listings', 'regions', 'detail'].forEach(function (v) { $('view-' + v).hidden = v !== view; });
    var btns = document.querySelectorAll('.nav-btn');
    for (var i = 0; i < btns.length; i++) btns[i].className = 'nav-btn' + (btns[i].getAttribute('data-view') === navView ? ' active' : '');
    closeMenu();
  }
  function route(keepScroll) {
    var p = location.hash.replace(/^#\/?/, '').split('/');
    var kind = p[0] || 'overview', arg = p[1] ? decodeURIComponent(p[1]) : '';
    if (TITLES[kind]) {
      show(kind, kind);
      setTitle(TITLES[kind], kind === 'overview' && state.ov && state.ov.reportDate ? 'Reporting date: ' + state.ov.reportDate : '');
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
  $('refresh').addEventListener('click', load);
  $('types').addEventListener('click', function (e) {
    var b = e.target; while (b && b !== this && !b.getAttribute('data-type')) b = b.parentNode;
    if (!b || !b.getAttribute) return;
    state.type = b.getAttribute('data-type');
    state.shown = PAGE_SIZE;
    var cs = this.getElementsByTagName('button');
    for (var i = 0; i < cs.length; i++) cs[i].className = 'chip' + (cs[i] === b ? ' active' : '');
    renderListings();
  });
  ['q', 'f-city', 'f-status'].forEach(function (id) {
    $(id).addEventListener(id === 'q' ? 'input' : 'change', function () { state.shown = PAGE_SIZE; renderListings(); });
  });
  $('more').addEventListener('click', function () { state.shown += PAGE_SIZE; renderListings(); });
  $('tbl-listings').getElementsByTagName('thead')[0].addEventListener('click', function (e) {
    var k = e.target.getAttribute('data-sort'); if (!k) return;
    state.asc = state.sort === k ? !state.asc : true;
    state.sort = k;
    renderListings();
  });


  // Mobile sort controls and header clicks for sortable tables
  (function () {
    var sb = $('sort-by'), ths = $('tbl-listings').querySelectorAll('th[data-sort]');
    sb.innerHTML = [].map.call(ths, function (th) { return '<option value="' + th.getAttribute('data-sort') + '">' + th.textContent + '</option>'; }).join('');
    sb.addEventListener('change', function () { state.sort = this.value; state.asc = true; renderListings(); });
    $('sort-dir').addEventListener('click', function () { state.asc = !state.asc; renderListings(); });
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
  load();
  setInterval(load, REFRESH_MS);
})();
