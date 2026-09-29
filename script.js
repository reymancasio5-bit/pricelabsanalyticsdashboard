(function () {
  'use strict';

  /* ---------- Settings ---------- */
  var API_URL = 'https://script.google.com/macros/s/AKfycbyu8Cl-OooWP5zSxAIe09X1aZWNKmaumCJR9ZQIVWZHabQ5wLA2Qa8AUNxLwiYwaOhg/exec'; // Apps Script web app URL (ends with /exec)
  var API_TOKEN = 'e5f2a9b8c3d7e1f0a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1';                          // Same value as API_TOKEN in Code.gs, or leave empty
  var REFRESH_MS = 5 * 60 * 1000;
  var PAGE_SIZE = 25;
  var BAR_LIMIT = 12;

  /* ---------- State ---------- */
  var state = { listings: [], regions: [], metric: 'past', shown: PAGE_SIZE, sort: 'name', asc: true };

  /* ---------- Helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pct(n) { return (Math.round(n * 10) / 10) + '%'; }
  function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function avg(arr) { if (!arr.length) return 0; var t = 0; for (var i = 0; i < arr.length; i++) t += arr[i]; return t / arr.length; }
  function statusClass(s) { s = String(s).toLowerCase(); return s === 'green' ? 'g' : s === 'yellow' ? 'y' : s === 'red' ? 'r' : 'n'; }

  /* ---------- Data ---------- */
  function normalize(data) {
    state.listings = (data.listings || []).map(function (r) {
      return {
        id: r['Listing ID'], name: r['Listing Name'], status: r['Listing Status'] || '',
        city: r['City'] || '', group: r['Customization Group'] || '', beds: r['Bedrooms'],
        base: num(r['Base Price']), rec: num(r['Recommended Base Price']),
        rev: num(r['RevPAR Past 30D']), revN: num(r['RevPAR Next 30D']),
        occ30: num(r['Occupancy Past 30D']), occN: num(r['Occupancy Next 30D']),
        pick: num(r['Bookings Pickup 30D'])
      };
    });
    state.regions = (data.regions || []).map(function (r) {
      return {
        name: r['Region'], act: num(r['Active Listings']), past: num(r['Past 30D']),
        n14: num(r['Next 14D (est.)']), next: num(r['Next 30D']), bench: num(r['30D Benchmark %']),
        status: r['Overall Status'], tasks: num(r['Open Tasks'])
      };
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

  /* ---------- Rendering ---------- */
  function render() { renderKpis(); renderBars(); renderAttention(); renderSplit(); renderFilters(); renderListings(); renderRegions(); }

  function activeListings() { return state.listings.filter(function (l) { return String(l.status).toLowerCase() === 'available'; }); }

  function renderKpis() {
    var act = activeListings();
    $('k-occ').textContent = pct(avg(act.map(function (l) { return l.occ30; })));
    $('k-occ-sub').textContent = 'Next 30 days: ' + pct(avg(act.map(function (l) { return l.occN; })));
    $('k-active').textContent = act.length.toLocaleString('en-US');
    $('k-active-sub').textContent = 'of ' + state.listings.length.toLocaleString('en-US') + ' total records';
    $('k-rev').textContent = money(avg(act.map(function (l) { return l.rev; })));
    $('k-rev-sub').textContent = 'Next 30 days: ' + money(avg(act.map(function (l) { return l.revN; })));
    var p = 0; act.forEach(function (l) { p += l.pick; });
    $('k-pick').textContent = p.toLocaleString('en-US');
    $('k-pick-sub').textContent = 'Across active listings';
  }

  function renderBars() {
    var key = state.metric;
    var rows = state.regions.slice().sort(function (a, b) { return b.act - a.act; }).slice(0, BAR_LIMIT);
    if (!rows.length) { $('bars').innerHTML = '<p class="empty">No regional data yet.</p>'; return; }
    $('bars').innerHTML = rows.map(function (r) {
      var v = r[key], w = Math.max(0, Math.min(100, v)), b = Math.max(0, Math.min(100, r.bench));
      return '<div class="bar-row"><div class="bar-name" title="' + esc(r.name) + '">' + esc(r.name) + '</div>' +
        '<div class="bar-track"><div class="bar-fill' + (v < r.bench ? ' low' : '') + '" style="width:' + w + '%"></div>' +
        '<div class="bar-mark" style="left:' + b + '%"></div></div>' +
        '<div class="bar-val">' + pct(v) + '</div></div>';
    }).join('');
  }

  function renderAttention() {
    var rows = state.regions.filter(function (r) { return String(r.status).toLowerCase() === 'red'; })
      .sort(function (a, b) { return (a.next - a.bench) - (b.next - b.bench); }).slice(0, 6);
    $('attention').innerHTML = rows.length ? rows.map(function (r) {
      return '<li><div class="av"><i class="fa-solid fa-triangle-exclamation"></i></div><div class="txt"><b>' + esc(r.name) + '</b>' +
        '<span>Next 30D ' + pct(r.next) + ' vs ' + pct(r.bench) + ' benchmark</span></div></li>';
    }).join('') : '<li class="empty">No regions are below target.</li>';
  }

  function renderSplit() {
    var c = { g: 0, y: 0, r: 0 };
    state.regions.forEach(function (r) { var k = statusClass(r.status); if (c[k] !== undefined) c[k]++; });
    var total = c.g + c.y + c.r || 1;
    var labels = { g: 'On track', y: 'Watch', r: 'Action' };
    $('status-split').innerHTML = ['g', 'y', 'r'].map(function (k) {
      return '<div class="split-row"><div class="lbl">' + labels[k] + '</div><div class="track"><div class="fill ' + k +
        '" style="width:' + (c[k] / total * 100) + '%"></div></div><div class="n">' + c[k] + '</div></div>';
    }).join('');
  }

  function renderFilters() {
    fillSelect($('f-city'), 'All cities', unique(state.listings.map(function (l) { return l.city; })));
    fillSelect($('f-status'), 'All statuses', unique(state.listings.map(function (l) { return l.status; })));
  }
  function unique(a) { var o = {}, out = []; a.forEach(function (v) { if (v && !o[v]) { o[v] = 1; out.push(v); } }); return out.sort(); }
  function fillSelect(sel, first, items) {
    var cur = sel.value;
    sel.innerHTML = '<option value="">' + first + '</option>' + items.map(function (i) { return '<option>' + esc(i) + '</option>'; }).join('');
    sel.value = cur;
  }

  function filteredListings() {
    var q = $('q').value.toLowerCase(), city = $('f-city').value, st = $('f-status').value;
    var rows = state.listings.filter(function (l) {
      return (!q || String(l.name).toLowerCase().indexOf(q) > -1 || String(l.id).indexOf(q) > -1) &&
        (!city || l.city === city) && (!st || l.status === st);
    });
    var k = state.sort, dir = state.asc ? 1 : -1;
    rows.sort(function (a, b) {
      var x = a[k], y = b[k];
      if (typeof x === 'string') return x.localeCompare(y) * dir;
      return (x - y) * dir;
    });
    return rows;
  }

  function renderListings() {
    var rows = filteredListings(), part = rows.slice(0, state.shown);
    $('count').textContent = rows.length.toLocaleString('en-US') + ' listings';
    $('tbl-listings').getElementsByTagName('tbody')[0].innerHTML = part.map(function (l) {
      var diff = l.rec > l.base ? 'up' : l.rec < l.base ? 'down' : '';
      return '<tr><td class="name"><b>' + esc(l.name) + '</b><span>ID ' + esc(l.id) + (l.group ? ' | ' + esc(l.group) : '') + '</span></td>' +
        '<td data-l="City">' + esc(l.city) + '</td>' +
        '<td class="num" data-l="Occ. past">' + pct(l.occ30) + '</td>' +
        '<td class="num" data-l="Occ. next">' + pct(l.occN) + '</td>' +
        '<td class="num" data-l="RevPAR">' + money(l.rev) + '</td>' +
        '<td class="num" data-l="Base">' + money(l.base) + '</td>' +
        '<td class="num ' + diff + '" data-l="Suggested">' + money(l.rec) + '</td>' +
        '<td class="num" data-l="Pickup">' + l.pick + '</td></tr>';
    }).join('') || '<tr><td class="empty">No listings match.</td></tr>';
    $('more').hidden = rows.length <= state.shown;
    var ths = $('tbl-listings').querySelectorAll('th[data-sort]');
    for (var i = 0; i < ths.length; i++) {
      var on = ths[i].getAttribute('data-sort') === state.sort;
      ths[i].className = on ? 'sorted' + (state.asc ? ' asc' : '') : '';
    }
  }

  function renderRegions() {
    var rows = state.regions.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    $('tbl-regions').getElementsByTagName('tbody')[0].innerHTML = rows.map(function (r) {
      var cls = statusClass(r.status);
      return '<tr><td class="name"><b>' + esc(r.name) + '</b></td>' +
        '<td class="num" data-l="Listings">' + r.act + '</td>' +
        '<td class="num" data-l="Past 30D">' + pct(r.past) + '</td>' +
        '<td class="num" data-l="Next 14D">' + pct(r.n14) + '</td>' +
        '<td class="num" data-l="Next 30D">' + pct(r.next) + '</td>' +
        '<td class="num" data-l="Benchmark">' + pct(r.bench) + '</td>' +
        '<td class="num" data-l="Tasks">' + r.tasks + '</td>' +
        '<td data-l="Status"><span class="pill ' + cls + '">' + esc(r.status || 'None') + '</span></td></tr>';
    }).join('');
  }

  /* ---------- Events ---------- */
  var titles = { overview: 'Dashboard', listings: 'Listings', regions: 'Regions' };
  function go(view) {
    ['overview', 'listings', 'regions'].forEach(function (v) { $('view-' + v).hidden = v !== view; });
    var btns = document.querySelectorAll('.nav-btn');
    for (var i = 0; i < btns.length; i++) btns[i].className = 'nav-btn' + (btns[i].getAttribute('data-view') === view ? ' active' : '');
    $('title').textContent = titles[view];
    closeMenu();
    window.scrollTo(0, 0);
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
  $('seg').addEventListener('click', function (e) {
    var m = e.target.getAttribute('data-metric'); if (!m) return;
    state.metric = m;
    var bs = this.getElementsByTagName('button');
    for (var i = 0; i < bs.length; i++) bs[i].className = bs[i] === e.target ? 'active' : '';
    renderBars();
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
