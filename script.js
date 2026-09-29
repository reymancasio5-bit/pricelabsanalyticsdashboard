(function () {
  'use strict';

  /* ---------- Settings ---------- */
  var API_URL = 'https://script.google.com/macros/s/AKfycbyu8Cl-OooWP5zSxAIe09X1aZWNKmaumCJR9ZQIVWZHabQ5wLA2Qa8AUNxLwiYwaOhg/exec'; // Apps Script web app URL (ends with /exec)
  var API_TOKEN = 'e5f2a9b8c3d7e1f0a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1';                          // Same value as API_TOKEN in Code.gs, or leave empty
  var REFRESH_MS = 5 * 60 * 1000;
  var PAGE_SIZE = 25;

  var state = { ov: null, listings: [], regions: [], type: 'all', shown: PAGE_SIZE, sort: 'rank', asc: true };

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
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function sign(n) { return n > 0 ? '+' : ''; }
  function clamp(n) { return Math.max(0, Math.min(100, n)); }
  function statusClass(s) {
    s = String(s).toLowerCase();
    if (s === 'green' || /improv/.test(s)) return 'g';
    if (s === 'yellow' || /watch|review/.test(s)) return 'y';
    if (s === 'red' || /declin|immediate|action|attention/.test(s)) return 'r';
    return 'n';
  }
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
        occ: pn(r[8]), occN: pn(r[9]), mk: pn(r[10]), mkN: pn(r[11]), status: r[12] || ''
      };
    }).filter(function (l) { return l.rank != null; }); // skip blank ranks
    state.regions = (data.regions || []).map(function (r) {
      return { name: r.name, active: nz(r.active), past: pn(r.past), n14: pn(r.next14), next: pn(r.next30), bench: pn(r.bench), status: r.status };
    });
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
      showNotice('', false);
      render();
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

  /* ---------- Homepage (Executive Overview) ---------- */
  function outlookRow(h) {
    for (var i = 0; i < state.ov.outlook.length; i++) {
      if (state.ov.outlook[i].horizon.toLowerCase().indexOf(h) > -1) return state.ov.outlook[i];
    }
    return null;
  }

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

    var gap = s['CHANGE VS TARGET'] || (n30 ? n30.gap : '');
    var g = pn(gap);
    $('k-gap').textContent = gap || 'n/a';
    $('k-gap').className = 'big ' + (g == null ? '' : g < 0 ? 'down' : 'up');
    $('k-gap-sub').textContent = g == null ? 'Next 30D vs benchmark' : (g < 0 ? 'Below benchmark' : 'At or above benchmark');
    $('k-active').textContent = s['ACTIVE LISTINGS'] || 'n/a';
    $('k-active-sub').textContent = ov.leBijou ? 'Le Bijou: ' + ov.leBijou : 'Portfolio total';

    var h = s['OVERALL HEALTH'] || 'Health';
    $('health').textContent = h;
    $('health').className = 'pill ' + statusClass(h);

    // Actual vs benchmark by horizon
    var html = ov.outlook.map(function (o) {
      var cur = pn(o.current), b = pn(o.benchmark), gp = pn(o.gap);
      var gcls = gp == null ? 'n' : gp < 0 ? 'r' : 'g';
      return '<div class="ol"><div class="ol-head"><b>' + esc(o.horizon) + '</b><span class="ol-val">' +
        pct(cur) + (b != null ? ' vs ' + pct(b) : '') + '</span>' +
        (gp != null ? '<span class="pill ' + gcls + '">' + sign(gp) + pct(gp) + '</span>' : '') + '</div>' +
        '<div class="bar-track"><div class="bar-fill' + (b != null && cur < b ? ' low' : '') + '" style="width:0" data-w="' + clamp(cur || 0) + '"></div>' +
        (b != null ? '<div class="bar-mark" style="left:' + clamp(b) + '%"></div>' : '') + '</div></div>';
    }).join('');
    $('outlook').innerHTML = html || '<p class="empty">No outlook data found.</p>';
    setBars($('outlook'));

    // Risk indicators
    $('risks').innerHTML = ov.risks.length ? ov.risks.map(function (r) {
      var c = statusClass(r.status);
      return '<li><div class="av ' + c + '"><i class="fa-solid ' + (c === 'r' ? 'fa-triangle-exclamation' : 'fa-eye') + '"></i></div>' +
        '<div class="txt"><b>' + esc(r.label) + '</b><span>' + esc(r.category) + '</span></div>' +
        '<div class="right"><strong>' + esc(r.value) + '</strong><span class="pill ' + c + '">' + esc(r.status) + '</span></div></li>';
    }).join('') : '<li class="empty">No risk data found.</li>';

    // Region status mix and KPIs
    var k = ov.kpis || {};
    var gr = nz(k['Green Regions']), ye = nz(k['Yellow Regions']), re = nz(k['Red Regions']), tot = (gr + ye + re) || 1;
    var rows = [['g', 'On track', gr], ['y', 'Watch', ye], ['r', 'Action', re]];
    $('status-split').innerHTML = rows.map(function (x) {
      return '<div class="split-row"><div class="lbl">' + x[1] + '</div><div class="track"><div class="fill ' + x[0] +
        '" style="width:0" data-w="' + (x[2] / tot * 100) + '"></div></div><div class="n">' + x[2] + '</div></div>';
    }).join('');
    setBars($('status-split'));
    var list = ['Total Active Listings', '14D Red Regions', '14D Yellow Regions', 'At-Risk Regions', 'Action Regions',
      'Overall Past 30D', 'Overall Next 14D', 'Overall Next 30D', 'Overall Next 60D'];
    $('kv').innerHTML = list.filter(function (n) { return k[n]; }).map(function (n) {
      return '<li><span>' + esc(n) + '</span><b>' + esc(k[n]) + '</b></li>';
    }).join('');
  }

  /* ---------- Listings (Pricelabs Report) ---------- */
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
    var cls = v != null && m != null ? (v >= m ? 'up' : 'down') : '';
    return '<span class="' + cls + '">' + pct(v) + '</span><span class="mk">Market ' + pct(m) + '</span>';
  }

  function renderListings() {
    var rows = filtered(), part = rows.slice(0, state.shown);
    $('count').textContent = rows.length.toLocaleString('en-US') + ' listings';
    var labels = { entire: 'Entire Unit', room: 'By Room' };
    $('tbl-listings').getElementsByTagName('tbody')[0].innerHTML = part.map(function (l) {
      var cc = l.chg == null ? '' : l.chg < 0 ? 'down' : 'up';
      return '<tr><td data-l="Rank">' + l.rank + '</td>' +
        '<td class="name"><b>' + esc(l.name) + '</b>' + (l.group ? '<span>' + esc(l.group) + '</span>' : '') + '</td>' +
        '<td data-l="City">' + esc(l.city) + '</td>' +
        '<td data-l="Type">' + (l.type ? '<span class="pill n">' + labels[l.type] + '</span>' : 'Other') + '</td>' +
        '<td class="num occ" data-l="Occ. past">' + occCell(l.occ, l.mk) + '</td>' +
        '<td class="num occ" data-l="Occ. next">' + occCell(l.occN, l.mkN) + '</td>' +
        '<td class="num" data-l="RevPAR past">' + money(l.rev) + '</td>' +
        '<td class="num" data-l="RevPAR next">' + money(l.revN) + '</td>' +
        '<td class="num ' + cc + '" data-l="Change">' + (l.chg == null ? 'n/a' : sign(l.chg) + pct(l.chg)) + '</td>' +
        '<td data-l="Status"><span class="pill ' + statusClass(l.status) + '">' + esc(l.status || 'None') + '</span></td></tr>';
    }).join('') || '<tr><td class="empty">No listings match.</td></tr>';
    $('more').hidden = rows.length <= state.shown;
    var ths = $('tbl-listings').querySelectorAll('th[data-sort]');
    for (var i = 0; i < ths.length; i++) {
      var on = ths[i].getAttribute('data-sort') === state.sort;
      ths[i].className = (ths[i].className.indexOf('num') > -1 ? 'num ' : '') + (on ? 'sorted' + (state.asc ? ' asc' : '') : '');
    }
  }

  /* ---------- Regions ---------- */
  function renderRegions() {
    var rows = state.regions.slice().sort(function (a, b) { return String(a.name).localeCompare(b.name); });
    $('tbl-regions').getElementsByTagName('tbody')[0].innerHTML = rows.map(function (r) {
      var gp = r.next != null && r.bench != null ? r.next - r.bench : null;
      return '<tr><td class="name"><b>' + esc(r.name) + '</b></td>' +
        '<td class="num" data-l="Listings">' + r.active + '</td>' +
        '<td class="num" data-l="Past 30D">' + pct(r.past) + '</td>' +
        '<td class="num" data-l="Next 14D">' + pct(r.n14) + '</td>' +
        '<td class="num" data-l="Next 30D">' + pct(r.next) + '</td>' +
        '<td class="num" data-l="Benchmark">' + pct(r.bench) + '</td>' +
        '<td class="num ' + (gp == null ? '' : gp < 0 ? 'down' : 'up') + '" data-l="Gap">' + (gp == null ? 'n/a' : sign(gp) + pct(gp)) + '</td>' +
        '<td data-l="Status"><span class="pill ' + statusClass(r.status) + '">' + esc(r.status || 'None') + '</span></td></tr>';
    }).join('');
  }

  function render() { renderOverview(); renderFilters(); renderListings(); renderRegions(); }

  /* ---------- Events ---------- */
  var titles = { overview: 'Dashboard', listings: 'Listings', regions: 'Regions' };
  function go(view) {
    ['overview', 'listings', 'regions'].forEach(function (v) { $('view-' + v).hidden = v !== view; });
    var btns = document.querySelectorAll('.nav-btn');
    for (var i = 0; i < btns.length; i++) btns[i].className = 'nav-btn' + (btns[i].getAttribute('data-view') === view ? ' active' : '');
    $('title').textContent = titles[view];
    $('rdate').style.display = view === 'overview' ? '' : 'none';
    closeMenu();
    window.scrollTo(0, 0);
    if (view === 'overview' && state.ov) renderOverview();
  }
  function openMenu() { $('side').className = 'side open'; $('scrim').className = 'scrim show'; }
  function closeMenu() { $('side').className = 'side'; $('scrim').className = 'scrim'; }

  $('nav').addEventListener('click', function (e) {
    var b = e.target; while (b && b !== this && !b.getAttribute('data-view')) b = b.parentNode;
    if (b && b.getAttribute) go(b.getAttribute('data-view'));
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

  load();
  setInterval(load, REFRESH_MS);
})();
