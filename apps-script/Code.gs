/** Property Dashboard API. Replace the bound project's Code.gs with this file.
 * Update the existing web-app deployment after saving; keep its URL/access settings.
 * Values are selected by sheet headers, never by visual bar-column positions.
 */
var API_TOKEN = 'e5f2a9b8c3d7e1f0a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1';
var CACHE_SECONDS = 300;
// Change this namespace whenever the response-building code changes.
var CACHE_KEY = 'dashboard-v3';
var CACHE_CHUNK_SIZE = 20000; // At most 80 KB of UTF-8, below CacheService's 100 KB limit.

function doGet(e) {
  if (API_TOKEN && (!e || !e.parameter || e.parameter.token !== API_TOKEN)) {
    return json_({ ok: false, error: 'Invalid token' });
  }
  try {
    if (e && e.parameter && e.parameter.action === 'reportConfig') return json_(reportConfig_());
    var params = e && e.parameter || {}, cached = params.fresh === '1' ? null : readCache_();
    if (cached) return cachedResponse_(cached, params);
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      cached = params.fresh === '1' ? null : readCache_();
      if (cached) return cachedResponse_(cached, params);
      throw new Error('Data is being refreshed. Please try again shortly.');
    }
    try {
      // Another request may have filled the cache while this request waited.
      cached = params.fresh === '1' ? null : readCache_();
      if (!cached) {
        var data = dashboard_(SpreadsheetApp.getActiveSpreadsheet());
        data.version = Utilities.getUuid();
        cached = { text: JSON.stringify(data), version: data.version, updated: data.updated };
        writeCache_(cached);
      }
      return cachedResponse_(cached, params);
    } finally { lock.releaseLock(); }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}
function json_(data) {
  return textJson_(JSON.stringify(data));
}
function textJson_(text) {
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}
function cachedResponse_(cached, params) {
  if (params.since === cached.version) {
    return json_({ ok: true, notModified: true, version: cached.version, updated: cached.updated });
  }
  return textJson_(cached.text);
}
function readCache_() {
  try {
    var cache = CacheService.getScriptCache(), manifest = cache.get(CACHE_KEY);
    if (!manifest) return null;
    var meta = JSON.parse(manifest);
    if (Date.now() >= meta.expires || !meta.keys || !meta.keys.length) return null;
    var chunks = cache.getAll(meta.keys), parts = [];
    for (var i = 0; i < meta.keys.length; i++) {
      if (typeof chunks[meta.keys[i]] !== 'string') return null;
      parts.push(chunks[meta.keys[i]]);
    }
    return { text: parts.join(''), version: meta.version, updated: meta.updated };
  } catch (err) { return null; } // Eviction or cache failure must not break the API.
}
function writeCache_(cached) {
  try {
    var cache = CacheService.getScriptCache(), chunks = {}, keys = [];
    // Publish the manifest last; generation-specific keys prevent mixed responses.
    for (var start = 0; start < cached.text.length;) {
      var end = Math.min(start + CACHE_CHUNK_SIZE, cached.text.length);
      if (end < cached.text.length && /[\uD800-\uDBFF]/.test(cached.text.charAt(end - 1))) end--;
      var key = CACHE_KEY + ':' + cached.version + ':' + keys.length;
      keys.push(key);
      chunks[key] = cached.text.slice(start, end);
      start = end;
    }
    // Bound cache usage; oversized responses still work without caching.
    if (keys.length > 100) return;
    cache.putAll(chunks, CACHE_SECONDS);
    cache.put(CACHE_KEY, JSON.stringify({ keys: keys, version: cached.version,
      updated: cached.updated, expires: Date.now() + CACHE_SECONDS * 1000 }), CACHE_SECONDS);
  } catch (err) { /* Cache is a best-effort optimization. */ }
}
function key_(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
function table_(ss, name, headerRow, needsRaw) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Missing sheet: ' + name);
  var range = sheet.getDataRange(), display = range.getDisplayValues();
  var raw = needsRaw ? range.getValues() : [];
  var h = (headerRow || 1) - 1;
  return { headers: display[h] || [], rows: display.slice(h + 1), raw: raw.slice(h + 1),
    grid: display, columns: Object.create(null), barColumns: Object.create(null) };
}
function column_(t, names) {
  if (!Array.isArray(names)) names = [names];
  var lookup = JSON.stringify(names);
  if (Object.prototype.hasOwnProperty.call(t.columns, lookup)) return t.columns[lookup];
  for (var n = 0; n < names.length; n++) {
    for (var i = 0; i < t.headers.length; i++) {
      if (key_(t.headers[i]) !== key_(names[n])) continue;
      if (!Object.prototype.hasOwnProperty.call(t.barColumns, i)) {
        t.barColumns[i] = t.rows.some(function (row) { return /[█░▓▒]/.test(String(row[i] || '')); });
      }
      if (!t.barColumns[i]) return t.columns[lookup] = i;
    }
  }
  return t.columns[lookup] = -1;
}
function value_(t, row, names) {
  var c = column_(t, names);
  return c < 0 || row[c] == null ? '' : row[c];
}
function percent_(t, i, names) {
  var c = column_(t, names);
  if (c < 0) return '';
  var raw = (t.raw[i] || [])[c], display = (t.rows[i] || [])[c];
  if (typeof raw === 'number') return (Math.round(raw * 1000000) / 10000) + '%';
  return display == null ? '' : String(display);
}
function required_(t, names, sheet) {
  names.forEach(function (name) { if (column_(t, name) < 0) throw new Error(sheet + ': missing header ' + name); });
}
function dashboard_(ss) {
  var report = table_(ss, 'Pricelabs Report', 1, true), details = table_(ss, 'Detailed Listings', 4);
  required_(report, ['Listing Name', 'Total Occupancy ( Next 15 Days )', 'Total Occupancy ( Past 30 Days )', 'Total Occupancy ( Next 30 Days )', 'Next 30D Benchmark %', 'Status'], 'Pricelabs Report');
  var listings = report.rows.map(function (r, i) {
    return {
      id: 'report-' + (i + 2), rank: value_(report, r, 'Rank'), name: value_(report, r, 'Listing Name'),
      group: value_(report, r, 'Customization Group'), tags: value_(report, r, 'Tags'), city: value_(report, r, 'City'),
      rev: value_(report, r, 'RevPAR ( Past 30 Days )'), revN: value_(report, r, 'RevPAR ( Next 30 Days )'),
      chg: percent_(report, i, 'RevPAR Change'), occ15: percent_(report, i, 'Total Occupancy ( Next 15 Days )'),
      occ: percent_(report, i, 'Total Occupancy ( Past 30 Days )'), occN: percent_(report, i, 'Total Occupancy ( Next 30 Days )'),
      benchmark15: percent_(report, i, 'Next 15D Benchmark %'), benchmark30: percent_(report, i, 'Next 30D Benchmark %'),
      status: value_(report, r, 'Status')
    };
  }).filter(function (r) { return String(r.name).trim(); });
  var detailMap = {}, ambiguous = {};
  required_(details, ['Listing ID', 'Listing Name', 'Base Price', 'Recommended Base Price'], 'Detailed Listings');
  details.rows.forEach(function (r) {
    var name = String(value_(details, r, 'Listing Name')).trim().toLowerCase();
    if (!name) return;
    // The report identifies properties by name. Never join an ambiguous name.
    if (detailMap[name] || ambiguous[name]) { delete detailMap[name]; ambiguous[name] = true; return; }
    detailMap[name] = { id: value_(details, r, 'Listing ID'), name: value_(details, r, 'Listing Name'),
      bedrooms: value_(details, r, 'Bedrooms'), base: value_(details, r, 'Base Price'),
      recommended: value_(details, r, 'Recommended Base Price'), pickup: value_(details, r, 'Bookings Pickup 30D'),
      lastBooked: value_(details, r, 'Last Booked Date'), synced: value_(details, r, 'Last Synced') };
  });
  var work = table_(ss, 'Weekly AM Worklist');
  var worklist = work.rows.filter(function (r) { return value_(work, r, 'Region'); }).map(function (r) {
    return ['Reporting Week', 'Region', 'Active Listings', 'Past 30D', 'Next 15D', 'Next 30D',
      '15D Change vs Past', '30D Change vs Past', 'Next 15D benchmark', 'Next 30D benchmark', '15D Status', '30D Status']
      .map(function (h) { return value_(work, r, h); });
  });
  var setupTable = table_(ss, 'Property Setup');
  var setup = setupTable.rows.filter(function (r) { return value_(setupTable, r, 'Region') && /^\d+$/.test(value_(setupTable, r, 'Active Listings')); }).map(function (r) {
    return { region: value_(setupTable, r, 'Region'), months: ['Jan','Feb','Mar','April','May','June','July','Aug','Sep','Oct','Nov','Dec'].map(function (m) { return value_(setupTable, r, m); }),
      b14: value_(setupTable, r, 'Next 15D benchmark'), b30: value_(setupTable, r, 'Next 30D benchmark'), b60: value_(setupTable, r, '60D Benchmark %') };
  });
  var actionTable = table_(ss, 'AM Actions');
  var regions = actionTable.rows.filter(function (r) { return value_(actionTable, r, 'Region'); }).map(function (r) {
    return { name: value_(actionTable, r, 'Region'), active: value_(actionTable, r, 'Active Listings'), status: value_(actionTable, r, 'Overall Status'), tasks: value_(actionTable, r, 'Open Tasks') };
  });
  var monthlyTable = table_(ss, 'Monthly Performance');
  var monthly = monthlyTable.rows.filter(function (r) { return value_(monthlyTable, r, 'Region'); }).map(function (r) {
    return { region: value_(monthlyTable, r, 'Region'), month: value_(monthlyTable, r, 'Review Month'),
      actual: value_(monthlyTable, r, 'Finalized monthly occupancy'), coverage: value_(monthlyTable, r, 'Actuals coverage'),
      target: value_(monthlyTable, r, 'Monthly target'), gap: value_(monthlyTable, r, 'Actual vs target'), status: value_(monthlyTable, r, 'Review status') };
  });
  var tabs = {};
  ['Regional Performance', 'AM Action Inputs', 'Monthly Inputs', 'Management Inputs', 'Legend'].forEach(function (name) {
    var t = table_(ss, name);
    var width = t.headers.reduce(function (n, h, i) { return h ? i + 1 : n; }, 0);
    if (name === 'Legend') width = Math.max(width, 4);
    tabs[name] = { headers: t.headers.slice(0, width).map(function (h, i) { return h || 'Column ' + (i + 1); }),
      rows: t.rows.filter(function (r) { return r.some(function (v) { return v !== ''; }); }).map(function (r) { return r.slice(0, width); }) };
  });
  var setupGrid = setupTable.grid, reportingMonth = '';
  setupGrid.forEach(function (r) { if (key_(r[0]) === 'reportingmonth') reportingMonth = r[1]; });
  return { ok: true, schemaVersion: 2, updated: new Date().toISOString(), reportingMonth: reportingMonth,
    overview: overview_(ss), listings: listings, details: detailMap, worklist: worklist,
    setup: setup, monthly: monthly, regions: regions, tabs: tabs };
}
function overview_(ss) {
  var grid = ss.getSheetByName('Executive Overview').getDataRange().getDisplayValues();
  var out = { reportDate: '', snapshot: {}, outlook: [], risks: [], kpis: {}, leBijou: '' };
  var snapshotLabels = ['ACTIVE LISTINGS', 'PAST 30D OCCUPANCY', 'NEXT 30D OCCUPANCY', 'CHANGE VS TARGET', 'OVERALL HEALTH', 'RED REGIONS', 'ACTION REGIONS'];
  var outlookColumns = null, inKpis = false;
  grid.forEach(function (r, i) {
    r.forEach(function (v, c) {
      if (snapshotLabels.indexOf(v) >= 0) out.snapshot[v] = (grid[i + 1] || [])[c] || '';
      if (/^REPORTING MONTH/.test(v)) out.reportDate = v.replace(/^REPORTING MONTH\s*[•:]?\s*/, '');
    });
    if (key_(r[0]) === 'horizon') {
      outlookColumns = { current: r.indexOf('CURRENT'), benchmark: r.indexOf('BENCHMARK'), gap: r.indexOf('GAP') };
    } else if (outlookColumns && /^(Past|Next)\s+\d+\s*(D|Days)\b/i.test(r[0] || '')) {
      out.outlook.push({ horizon: r[0], current: r[outlookColumns.current], benchmark: r[outlookColumns.benchmark], gap: r[outlookColumns.gap] });
    }
    if (/^(Regions with red|Regions below past|Active listings at risk)/i.test(r[0] || '')) {
      var cells = r.filter(function (v) { return v !== ''; });
      out.risks.push({ label: cells[0], value: cells[1], category: cells[2], status: cells[3] });
    }
    if (key_(r[0]) === 'lebijouactivelistings') out.leBijou = r.filter(function (v) { return v !== ''; }).pop();
    if (key_(r[0]) === 'portfoliokpi') inKpis = true;
    else if (inKpis && r[0] && r[1]) out.kpis[r[0]] = r[1];
  });
  return out;
}
