/* Composable, read-only portfolio queries. Vocabulary is not a trained model. */
(function (root) {
  'use strict';
  var WORDS = {
    occupancy: ['occupancy', 'occupancy rate', 'occupancy levels', 'booking rate', 'booking rates', 'booking percentage', 'booked percentage', 'percent booked', 'percentage booked', 'bookings', 'booked', 'occ', 'utilization', 'utilisation'],
    revpar: ['revpar', 'revenue per available rental', 'revenue per available room', 'revenue per available night', 'revenue per available property'],
    benchmark: ['benchmark', 'benchmarks', 'target', 'targets', 'market benchmark', 'market average', 'market rate'],
    gap: ['gap', 'gaps', 'shortfall', 'shortfalls', 'variance', 'variances', 'difference from target'],
    change: ['change', 'changes', 'growth', 'drop', 'drops', 'decline', 'declines', 'gain', 'gains', 'increase', 'increases', 'decrease', 'decreases', 'improvement', 'improvements', 'deterioration'],
    count: ['how many', 'count', 'number of', 'quantity of', 'total number', 'total count'],
    average: ['average', 'mean', 'on average', 'avg'], median: ['median', 'middle value'],
    sum: ['sum', 'total'], compare: ['compare', 'comparison', 'versus', 'vs', 'side by side', 'difference between'],
    rank: ['rank', 'ranked', 'ranking', 'sort', 'sorted', 'top', 'bottom', 'best', 'worst', 'highest', 'lowest', 'largest', 'smallest', 'biggest', 'strongest', 'weakest', 'most', 'least', 'leading', 'lagging'],
    ascending: ['lowest', 'smallest', 'bottom', 'worst', 'weakest', 'least', 'lagging', 'ascending', 'low to high'],
    descending: ['highest', 'largest', 'top', 'best', 'strongest', 'biggest', 'most', 'leading', 'descending', 'high to low'],
    below: ['below', 'under', 'less than', 'lower than', 'falling short of', 'behind'],
    above: ['above', 'over', 'more than', 'greater than', 'higher than', 'exceeding', 'ahead of'],
    atMost: ['at most', 'no more than', 'less than or equal to'], atLeast: ['at least', 'no less than', 'greater than or equal to'],
    equal: ['equal to', 'exactly'],
    attention: ['needs attention', 'need attention', 'needing attention', 'flagged', 'flagged listings', 'at risk', 'needs action', 'need action', 'requiring attention', 'require attention'],
    blocked: ['fully blocked', 'blocked'], stable: ['stable', 'unchanged'], improving: ['improving'],
    red: ['red', 'critical'], yellow: ['yellow', 'watch'], green: ['green', 'on track'],
    underperforming: ['underperforming', 'under performing', 'underperform', 'missing targets', 'missing target', 'off track'],
    listing: ['listing', 'listings', 'property', 'properties', 'rental', 'rentals', 'homes', 'home', 'units', 'unit'],
    region: ['region', 'regions', 'city', 'cities', 'location', 'locations', 'market', 'markets', 'area', 'areas', 'where'],
    team: ['team', 'teams', 'group', 'groups'],
    entire: ['entire unit', 'entire units', 'entire home', 'entire homes', 'whole homes', 'whole home'],
    room: ['by room', 'private rooms', 'private room', 'shared rooms', 'shared room'],
    active: ['active', 'eligible active'], tracked: ['tracked', 'reported', 'report listings'],
    summary: ['summary', 'summarize', 'summarise', 'overview', 'snapshot', 'portfolio health', 'how is my portfolio', 'how is the portfolio', 'portfolio performance'],
    freshness: ['last updated', 'data freshness', 'how fresh', 'report date', 'reporting date', 'data date', 'when was this updated'],
    help: ['help', 'examples', 'what can you do', 'what can i ask', 'sample questions', 'suggest questions'],
    explain: ['explain', 'what does', 'what is', 'definition', 'define', 'meaning of'],
    list: ['show', 'list', 'find', 'give', 'tell', 'display', 'identify', 'get', 'check', 'which', 'what'],
    negative: ['drop', 'drops', 'decline', 'declines', 'decrease', 'decreases', 'deterioration'],
    positive: ['gain', 'gains', 'growth', 'increase', 'increases', 'improvement', 'improvements']
  };
  var PERIODS = { past: { label: 'Past 30D', region: 'past', listing: 'occ', benchmark: null, revpar: 'rev' },
    '15': { label: 'Next 15D', region: 'n14', listing: 'occ15', benchmark: 'b14', revpar: null },
    '30': { label: 'Next 30D', region: 'next', listing: 'occN', benchmark: 'b30', revpar: 'revN' } };
  var EXAMPLES = ['Portfolio summary', 'Which regions are below benchmark?', 'Top 5 listings by occupancy', 'Average RevPAR in Toronto', 'Compare Toronto and Montreal', 'How many properties need attention?', 'Median occupancy for entire units', 'Lowest occupancy next 15 days', 'Biggest RevPAR drops', 'When was this updated?', 'Remember "GTA" means Toronto and Markham'];
  function clean(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
  function escapeRE(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function phrase(q, s) { return new RegExp('(?:^| )' + escapeRE(clean(s)) + '(?= |$)').test(q); }
  function has(q, key) { return WORDS[key].some(function (s) { return phrase(q, s); }); }
  function finite(v) { return typeof v === 'number' && isFinite(v); }
  function round(v) { return Math.round(v * 10) / 10; }
  function fmt(v, metric) { return !finite(v) ? 'Unavailable' : metric === 'revpar' ? '$' + round(v).toLocaleString('en-US') : metric === 'active' ? String(v) : round(v) + (metric === 'gap' || metric === 'change' ? ' pp' : '%'); }
  function reply(text, rows, extra) { return Object.assign({ text: text, rows: rows || [], source: '', kind: 'answer' }, extra || {}); }
  function clarify(text, plan, choices) { return reply(text, [], { kind: 'clarify', pending: plan || null, choices: choices || [] }); }
  function catalog(data) {
    var out = [], seen = Object.create(null);
    function add(kind, name) { if (!name) return; var id = kind + ':' + clean(name); if (!seen[id]) { seen[id] = true; out.push({ kind: kind, name: String(name) }); } }
    (data.wl || []).forEach(function (r) { add('place', r.region); });
    (data.listings || []).forEach(function (l) { add('place', l.city); add('team', l.group); add('listing', l.name); });
    return out;
  }
  function resolve(q, data, aliases) {
    var entries = catalog(data).map(function (e) { return { term: clean(e.name), targets: [e] }; });
    Object.keys(aliases || {}).forEach(function (key) { entries.push({ term: clean(key), targets: aliases[key] }); });
    entries.sort(function (a, b) { return b.term.length - a.term.length; });
    var found = [], rest = q;
    entries.forEach(function (e) {
      if (!e.term || !phrase(rest, e.term)) return;
      e.targets.forEach(function (target) { if (!found.some(function (f) { return f.kind === target.kind && clean(f.name) === clean(target.name); })) found.push(target); });
      rest = rest.replace(new RegExp('(^| )' + escapeRE(e.term) + '(?= |$)', 'g'), '$1 ').replace(/\s+/g, ' ').trim();
    });
    var known = catalog(data);
    return { entities: found, rest: rest, stale: found.some(function (f) { return !known.some(function (k) { return k.kind === f.kind && clean(k.name) === clean(f.name); }); }) };
  }
  function safeAliases(value) {
    var out = Object.create(null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    Object.keys(value).slice(0, 50).forEach(function (key) {
      var v = value[key], k = clean(key);
      if (k.length < 2 || k.length > 40 || /^(constructor|prototype|proto)$/.test(k) || !Array.isArray(v) || !v.length || v.length > 20) return;
      if (v.every(function (e) { return e && ['place', 'team', 'listing'].indexOf(e.kind) !== -1 && typeof e.name === 'string' && e.name.length < 200; })) out[k] = v.map(function (e) { return { kind: e.kind, name: e.name }; });
    });
    return out;
  }
  function memoryCommand(question, data, aliases) {
    var raw = String(question).trim(), q = clean(raw), m;
    if (/^(what have you learned|show aliases|list aliases|remembered names|memory)$/.test(q)) return reply('Remembered aliases on this browser. These map names only; they never change spreadsheet facts.', Object.keys(aliases).map(function (k) { return { label: k, value: aliases[k].map(function (e) { return e.name; }).join(', ') }; }), { kind: 'memory' });
    if ((m = /^(?:forget|remove alias)\s+(.+)$/i.exec(raw))) return reply('Forget the alias "' + clean(m[1]) + '"?', [], { kind: 'confirm', memory: { remove: clean(m[1]) } });
    if (!(m = /^(?:remember|learn)\s+["']?(.+?)["']?\s+(?:means|is another name for|=)\s+(.+)$/i.exec(raw))) return null;
    var key = clean(m[1]), targets = resolve(clean(m[2]), data, {});
    var reserved = Object.keys(WORDS).some(function (k) { return WORDS[k].some(function (word) { return clean(word) === key; }); });
    if (reserved || /\b(next|past|last|month|day|days|and|in|for|not|without|proto|prototype|constructor)\b/.test(key) || catalog(data).some(function (e) { return clean(e.name) === key; }) || key.length < 2 || key.length > 40) return clarify('Choose a short nickname that does not replace a metric, date, command, or existing place name.');
    if (!targets.entities.length || targets.entities.length > 20 || targets.rest.replace(/\b(and|plus)\b/g, '').trim()) return clarify('Name existing regions, teams, or full listing names after “means”. I will ask you to confirm before remembering the nickname.');
    if (targets.entities.some(function (e) { return e.kind !== targets.entities[0].kind; })) return clarify('An alias can combine regions, teams, or listings, but not a mixture of those types.');
    if (Object.keys(aliases).length >= 50 && !aliases[key]) return clarify('You have 50 aliases. Forget an unused alias before adding another.');
    return reply('Remember "' + key + '" as ' + targets.entities.map(function (e) { return e.name; }).join(', ') + '? This is stored on this browser and can be removed with “Forget ' + key + '”.', [], { kind: 'confirm', memory: { key: key, targets: targets.entities } });
  }
  // Definitions do not need a spreadsheet scan or an internet round trip.
  function definition(question) {
    var q = clean(question).replace(/\bwhat s\b/g,'what is'), term;
    if (!/\b(explain|what is|what does|define|definition|meaning|mean|stand for|calculated|calculate|formula)\b/.test(q)) return null;
    if (has(q, 'revpar')) term = 'revpar';
    else if (/\b(adr|average daily rate)\b/.test(q)) term = 'adr';
    else if (has(q, 'occupancy')) term = 'occupancy';
    else if (has(q, 'benchmark')) term = 'benchmark';
    else return null;
    var remainder = q;
    (term === 'adr' ? ['average daily rate', 'adr'] : WORDS[term].slice().sort(function(a,b){return b.length-a.length;})).forEach(function(word){ remainder = remainder.replace(new RegExp('(^| )' + escapeRE(clean(word)) + '(?= |$)', 'g'), ' '); });
    remainder = remainder.replace(/\b(can|could|would|you|please|explain|to|me|what|is|does|a|an|the|define|definition|meaning|of|mean|stand|for|how|it|calculated|calculate|formula|work|works|in|simple|terms|with|example|and)\b/g, '').trim();
    if (remainder) return null; // A named property, period or value belongs to the data query path.
    var definitions = {
      revpar: 'RevPAR means Revenue per Available Room (or rental). It combines your nightly rate and occupancy into one measure.\n\nFormula: rental revenue / available nights, or ADR x occupancy expressed as a decimal.\n\nExample only: a $200 average daily rate at 75% occupancy gives $150 RevPAR ($200 x 0.75). Unbooked available nights count too.\n\nIt is not total revenue or profit. For your actual figures, I use the RevPAR values reported in the dashboard data.',
      adr: 'ADR means Average Daily Rate: rental revenue divided by booked nights. Example only: $1,000 from 5 booked nights gives a $200 ADR. Unlike RevPAR, ADR only counts booked nights. Fee and tax inclusion depends on the source system.',
      occupancy: 'Occupancy is the percentage of available nights that are booked. Example only: 15 booked nights out of 20 available nights means 75% occupancy. The dashboard uses the occupancy values supplied by the spreadsheet; treatment of blocked nights depends on the source.',
      benchmark: 'A benchmark is the comparison target supplied by your spreadsheet. The occupancy gap is actual occupancy minus benchmark, measured in percentage points. Example only: 60% occupancy against a 50% benchmark is a +10 percentage-point gap.'
    };
    return reply(definitions[term], [], {kind:'help', source: term === 'benchmark' ? 'Dashboard calculation rules' : 'PriceLabs metric terminology', reference: term === 'benchmark' ? null : 'https://help.pricelabs.co/portal/en/kb/articles/portfolio-analytics-terminology'});
  }
  function blankPlan() { return { operation: 'list', metric: null, entity: 'listing', period: '30', scopes: [], statuses: [], type: null, direction: 'desc', limit: 8, threshold: null, benchmarkFilter: null, changeSign: null }; }
  function parse(question, data, context) {
    var explained = definition(question); if (explained) return { response: explained };
    context = context || {};
    var aliases = safeAliases(context.aliases), q = clean(question), memory = memoryCommand(question, data, aliases);
    if (memory) return { response: memory };
    if (!q || /^(hi|hello|hey|thanks|thank you)$/.test(q) || has(q, 'help')) return { response: reply('I combine metrics, periods, locations, filters and calculations. Try an example, or teach a nickname with “Remember GTA means Toronto and Markham”. Follow up with “What about Montreal?” or “And next 15 days?”.', [], { choices: EXAMPLES, kind: 'help' }) };
    if (has(q, 'freshness')) return { response: reply('Snapshot updated: ' + (data.updated || 'Unknown') + '. Reporting date: ' + (data.reportDate || (data.ov && data.ov.reportDate) || 'Unknown') + '. Answers use data loaded by the dashboard, not a separate live file read.', [], { source: 'Dashboard snapshot metadata' }) };
    var entities = resolve(q, data, aliases), rest = entities.rest.replace(/\b(upcoming|coming|following)\b/g, 'next').replace(/\b(previous|prior)\b/g, 'past');
    if (entities.stale) return { response: clarify('A remembered name is not in the current data. Review “Show aliases” and update or forget that alias.') };
    var followup = /^(and|what about|how about|same|those|these|them|instead|now)\b/.test(q) || /^(next|past|last) \d+( days?|d)?$/.test(q);
    var previous = context.pending || (followup && context.lastPlan);
    var p = previous ? JSON.parse(JSON.stringify(previous)) : blankPlan();
    if (followup && !previous) return { response: clarify('Ask a complete question first, such as “Average occupancy in Toronto next 30 days”. Then you can change the location or period in a follow-up.') };
    if (entities.entities.length) p.scopes = entities.entities;
    if (/\b(all portfolio|whole portfolio|entire portfolio|across the portfolio)\b/.test(rest)) p.scopes = [];
    var raw = String(question).toLowerCase().replace(/[\u2010-\u2014]/g, '-');
    // Periods describe dashboard horizons, not interchangeable calendar dates.
    var periods = [], pm, periodIssue = null, re = /\b(next|past|last)\s*(\d+)\s*(?:-?\s*days?|d)?\b/g;
    while ((pm = re.exec(rest))) periods.push({ past: pm[1] !== 'next', days: Number(pm[2]) });
    if (/\b(next month|this month|last month|calendar month|next week|last week|this week|tomorrow|yesterday|today|year|quarter)\b/.test(rest) || /\b20\d{2}[-/]\d/.test(raw)) {
      periodIssue = 'Calendar dates are not interchangeable with rolling dashboard periods. I can use past 30 days, next 15 days, or next 30 days. Which do you mean?';
      rest = rest.replace(/\b(next month|this month|last month|calendar month|next week|last week|this week|tomorrow|yesterday|today|year|quarter)\b/g, ' ');
    }
    if (periods.length > 1) return { response: clarify('Use one horizon per question. For a past-to-future comparison, ask “Occupancy change” or “RevPAR change” (Next 30D vs Past 30D).', p) };
    if (periods.length) {
      var period = periods[0];
      if ((period.past && period.days !== 30) || (!period.past && [15, 30].indexOf(period.days) === -1)) periodIssue = 'That period is not available for these calculations. Choose past 30 days, next 15 days, or next 30 days.';
      else p.period = period.past ? 'past' : String(period.days);
      rest = rest.replace(re, ' ');
    } else if (/\b(?:15d|30d)\b/.test(rest)) { p.period = phrase(rest, '15d') ? '15' : '30'; rest = rest.replace(/\b(?:15d|30d)\b/g, ' '); }
    else if (/\b\d+\s*(?:days|day|d)\b/.test(rest)) return { response: clarify('Specify whether the period is past or next, using past 30 days, next 15 days, or next 30 days.', p) };
    if (/\b(not|excluding|exclude|except|without|between)\b/.test(rest)) return { response: clarify('I do not support exclusions or numeric ranges yet. Use a positive filter, such as “Listings in Toronto with occupancy below 40%”.') };
    var isOcc = has(rest, 'occupancy'), isRev = has(rest, 'revpar'), isBench = has(rest, 'benchmark'), isChange = has(rest, 'change'), isGap = has(rest, 'gap');
    if (isOcc && isRev) return { response: clarify('Ask about one metric at a time: occupancy or RevPAR. Counts can be combined with a metric filter.') };
    if (isRev) p.metric = isChange ? 'revparChange' : 'revpar';
    else if (isChange) p.metric = 'change';
    else if (isGap || has(rest, 'underperforming')) p.metric = 'gap';
    else if (isOcc) p.metric = 'occupancy';
    else if (isBench) p.metric = 'benchmark';
    if (has(rest, 'active')) p.metric = 'active';
    var explicitListing = has(rest, 'listing'), explicitRegion = has(rest, 'region'), explicitTeam = has(rest, 'team');
    if (explicitListing) p.entity = 'listing';
    else if (explicitTeam) p.entity = 'team';
    else if (explicitRegion) p.entity = 'region';
    else if (p.scopes.some(function (e) { return e.kind === 'listing'; })) p.entity = 'listing';
    else if (p.scopes.some(function (e) { return e.kind === 'team'; })) p.entity = 'team';
    else if (p.scopes.length && !previous) p.entity = isRev ? 'listing' : 'region';
    if (has(rest, 'count')) { p.operation = 'count'; if (!explicitRegion && !explicitTeam && !previous) p.entity = 'listing'; }
    else if (has(rest, 'median')) p.operation = 'median';
    else if (has(rest, 'average')) p.operation = 'average';
    else if (has(rest, 'compare')) p.operation = 'compare';
    else if (has(rest, 'rank')) p.operation = 'rank';
    else if (has(rest, 'sum')) p.operation = 'sum';
    else if (has(rest, 'list') && !previous) p.operation = 'list';
    if (has(rest, 'ascending')) p.direction = 'asc';
    else if (has(rest, 'descending')) p.direction = 'desc';
    if (has(rest, 'negative') && isChange) { p.changeSign = 'negative'; p.direction = 'asc'; if (!has(rest, 'count') && !has(rest, 'average') && !has(rest, 'median')) p.operation = 'rank'; }
    else if (has(rest, 'positive') && isChange) { p.changeSign = 'positive'; p.direction = 'desc'; if (!has(rest, 'count') && !has(rest, 'average') && !has(rest, 'median')) p.operation = 'rank'; }
    var top = /\b(?:top|bottom|first|best|worst|highest|lowest)\s+(\d+)\b/.exec(rest);
    if (top) { p.limit = Math.max(1, Math.min(50, Number(top[1]))); rest = rest.replace(top[0], top[0].replace(top[1], '')); }
    var statusKeys = ['attention', 'blocked', 'stable', 'improving', 'red', 'yellow', 'green'];
    var statuses = statusKeys.filter(function (k) { return has(rest, k); });
    if (statuses.length) p.statuses = statuses;
    if (has(rest, 'entire')) { p.type = 'entire'; p.entity = 'listing'; }
    if (has(rest, 'room')) { if (p.type === 'entire' && has(rest, 'entire')) return { response: clarify('Choose entire units or rooms for one query, or ask about all listings.') }; p.type = 'room'; p.entity = 'listing'; }
    if (has(rest, 'underperforming') || (isBench && has(rest, 'below'))) p.benchmarkFilter = 'below';
    else if (isBench && (has(rest, 'above') || has(rest, 'atLeast'))) p.benchmarkFilter = has(rest, 'atLeast') ? 'atLeast' : 'above';
    else if (isBench && has(rest, 'atMost')) p.benchmarkFilter = 'atMost';
    else if (isBench && has(rest, 'equal')) p.benchmarkFilter = 'equal';
    if (p.benchmarkFilter && !isOcc) p.metric = 'gap';
    if (has(rest, 'underperforming') || /\bshortfalls?\b/.test(rest)) {
      p.benchmarkFilter = 'below'; p.metric = 'gap';
      p.direction = /\b(smallest|least)\b/.test(rest) ? 'desc' : 'asc';
    }
    var threshold = /(?:\b(at most|no more than|at least|no less than|less than or equal to|greater than or equal to|less than|lower than|more than|greater than|higher than|below|under|above|over|exactly|equal to)\s*|([<>]=?|=)\s*)\$?(-?\d+(?:\.\d+)?)\s*(%|percent|dollars)?/i.exec(raw);
    if (threshold) {
      var op = threshold[2] || ({ 'at most': '<=', 'no more than': '<=', 'less than or equal to': '<=', 'at least': '>=', 'no less than': '>=', 'greater than or equal to': '>=', 'below': '<', 'under': '<', 'less than': '<', 'lower than': '<', 'above': '>', 'over': '>', 'more than': '>', 'greater than': '>', 'higher than': '>', 'exactly': '=', 'equal to': '=' })[threshold[1]];
      p.threshold = { op: op, value: Number(threshold[3]) };
      rest = rest.replace(clean(threshold[0]), ' ');
      if ((threshold[0].indexOf('$') !== -1 || threshold[4] === 'dollars') && p.metric !== 'revpar' || (threshold[4] === '%' || threshold[4] === 'percent') && (p.metric === 'revpar' || p.metric === 'active')) return { response: clarify('The filter unit does not match the metric. Use dollars for RevPAR and percentages for occupancy.') };
    }
    if (statuses.length && !p.metric && p.operation === 'list') p.metric = 'occupancy';
    if (has(rest, 'summary') && !isOcc && !isRev && !statuses.length && !p.scopes.length) return { plan: Object.assign(p, { operation: 'summary' }) };
    // Consume supported vocabulary and grammar; unexplained qualifiers require clarification.
    var terms = [].concat.apply([], Object.keys(WORDS).map(function (key) { return WORDS[key]; })).sort(function (a, b) { return b.length - a.length; });
    terms.forEach(function (term) { rest = rest.replace(new RegExp('(^| )' + escapeRE(clean(term)) + '(?= |$)', 'g'), '$1 '); });
    rest = rest.replace(/\b(a|an|the|please|can|could|would|you|i|we|our|my|me|give|tell|show|about|how|what|which|where|is|are|was|were|do|does|have|has|with|whose|that|their|there|it|of|in|for|from|at|by|on|to|and|or|all|any|across|portfolio|whole|entire|than|versus|compared|against|performing|perform|performance|doing|right|now|first|results|result|also|instead|same|those|these|them|only|per)\b/g, '').replace(/\s+/g, ' ').trim();
    if (periodIssue) return { response: clarify(periodIssue, p, ['Past 30 days', 'Next 15 days', 'Next 30 days']) };
    if (rest) return { response: clarify('I could not identify “' + rest + '” in the question. Use a full place/team/listing name from the dashboard, clarify the metric, or teach an alias with “Remember nickname means full name”.') };
    if (p.threshold && !p.metric) return { response: clarify('Which metric should the numeric filter apply to: occupancy, RevPAR, or benchmark gap?', p, ['Occupancy', 'RevPAR', 'Benchmark gap']) };
    if (p.operation === 'count' && p.metric && p.metric !== 'active' && !p.threshold && !p.benchmarkFilter && !p.statuses.length && !p.changeSign) return { response: clarify('I count matching listings or regions, not booking transactions. Add a filter such as “How many listings have occupancy below 40%?”', p) };
    if (!p.metric && p.operation !== 'count') {
      if (p.scopes.length || explicitRegion || explicitListing || explicitTeam) p.metric = 'occupancy';
      else return { response: clarify('Which metric should I use: occupancy, RevPAR, benchmark gap, or active-listing count?', p, ['Occupancy', 'RevPAR', 'Benchmark gap', 'Active listings']) };
    }
    if (p.operation === 'compare' && p.scopes.length < 2) return { response: clarify('Name at least two regions, teams, or listings to compare.', p) };
    if (p.scopes.length && p.scopes.some(function (e) { return e.kind !== p.scopes[0].kind; }) && p.operation === 'compare') return { response: clarify('Compare entities of the same kind: regions with regions, teams with teams, or listings with listings.') };
    return { plan: p };
  }

  function execute(p, data) {
    if (!data.loaded) return reply(data.loading ? 'Spreadsheet data is still loading. Try again when the dashboard is ready.' : 'No spreadsheet data is loaded. Use Refresh data on the dashboard, then ask again.', [], { kind: 'unavailable' });
    var L = data.listings || [], R = data.wl || [], per = PERIODS[p.period];
    if (p.operation === 'summary') {
      var s = data.ov && data.ov.snapshot || {};
      return reply('Portfolio summary from the loaded snapshot.', ['PAST 30D OCCUPANCY', 'NEXT 30D OCCUPANCY', 'ACTIVE LISTINGS'].map(function (k) { return { label: k, value: s[k] == null || s[k] === '' ? 'Unavailable' : String(s[k]) }; }).concat([{ label: 'Tracked report listings', value: String(L.length), href: '#/listings' }]), { source: 'Executive Overview and Pricelabs Report', plan: p });
    }
    if (p.period === 'past' && (p.metric === 'benchmark' || p.metric === 'gap' || p.benchmarkFilter)) return clarify('Past-30-day benchmark comparisons are not supported here. Choose next 15 or next 30 days.', p, ['Next 15 days', 'Next 30 days']);
    if (/^revpar/.test(p.metric || '') && p.period === '15') return clarify('The spreadsheet report has RevPAR for past 30 and next 30 days, not next 15 days.', p, ['Past 30 days', 'Next 30 days']);
    if (['change', 'revparChange'].indexOf(p.metric) !== -1 && p.period !== '30') return clarify('Change compares Next 30D with Past 30D. Use next 30 days for that calculation.', p, ['Next 30 days']);
    if (p.operation === 'sum' && p.metric !== 'active') return clarify('Occupancy percentages and RevPAR are not additive. Use average or median; total revenue cannot be derived from these fields.', p, ['Average', 'Median']);
    if (p.statuses.length > 1) return clarify('Use one status filter at a time so the count is unambiguous.');
    if (p.entity !== 'listing' && p.type) return clarify('Property-type filters apply to listings.');
    var source = p.entity === 'region' || p.metric === 'active' ? 'Weekly AM Worklist; Property Setup benchmarks' : 'Pricelabs Report';
    if (p.entity === 'region' && p.statuses.length && p.period === 'past') return clarify('Regional status labels describe forward horizons. Choose next 15 or next 30 days.', p, ['Next 15 days', 'Next 30 days']);
    if (p.statuses[0] === 'blocked' && p.period === '15') return clarify('Blocked flags come from past or next 30-day RevPAR fields. Choose one of those horizons.', p, ['Past 30 days', 'Next 30 days']);
    function matches(kind, value) { var scopes = p.scopes.filter(function (s) { return s.kind === kind; }); return !scopes.length || scopes.some(function (s) { return clean(s.name) === clean(value); }); }
    if ((p.entity === 'region' || p.metric === 'active') && p.scopes.some(function (e) { return e.kind !== 'place'; })) return clarify('Regional active-listing totals cannot be filtered by team or individual listing. Ask for tracked listings instead.');
    L = L.filter(function (l) { return matches('place', l.city) && matches('team', l.group) && matches('listing', l.name) && (!p.type || l.type === p.type); });
    R = R.filter(function (r) { return matches('place', r.region); });
    if (p.entity === 'region' && p.scopes.some(function (s) { return s.kind === 'place' && !R.some(function (r) { return clean(r.region) === clean(s.name); }); })) return clarify('A named city has listing data but no regional summary. Ask about listings in that city instead.');
    if (p.entity === 'listing' && p.scopes.some(function (s) { return s.kind === 'listing' && L.filter(function (l) { return clean(l.name) === clean(s.name); }).length > 1; })) return reply('More than one listing has that name. Open the intended listing.', L.slice(0, 8).map(function (l) { return { label: l.name, value: l.city || '', href: '#/listing/' + encodeURIComponent(l.id) }; }), { kind: 'clarify' });
    function listingMetric(l, metric) {
      var benchmark = l[p.period === '15' ? 'mk15' : 'mkN'], value = l[per.listing];
      if (metric === 'revpar') return (p.period === 'past' ? l.blocked : l.blockedN) ? null : l[per.revpar];
      if (metric === 'revparChange') return l.blocked || l.blockedN ? null : l.chg;
      if (metric === 'change') return finite(l.occN) && finite(l.occ) ? l.occN - l.occ : null;
      if (metric === 'benchmark') return benchmark;
      if (metric === 'gap') return finite(value) && finite(benchmark) ? value - benchmark : null;
      return value;
    }
    function status(l) {
      var st = clean(l.status);
      if (p.statuses[0] === 'blocked') return p.period === 'past' ? !!l.blocked : !!l.blockedN;
      if (p.statuses[0] === 'attention') return st === 'red' || /declin|immediate|action|attention|needs/.test(st);
      return !p.statuses.length || (p.statuses[0] === 'stable' ? st === 'stable' : p.statuses[0] === 'improving' ? /improv/.test(st) : st === p.statuses[0]);
    }
    function compare(v, t) { return finite(v) && (t.op === '<' ? v < t.value : t.op === '<=' ? v <= t.value : t.op === '>' ? v > t.value : t.op === '>=' ? v >= t.value : v === t.value); }
    var records;
    if (p.metric === 'active') {
      if (p.statuses.length || p.type) return clarify('Active counts come from the regional worklist. Status and type filters require tracked listing counts.');
      records = R.map(function (r) { return { name: r.region, value: finite(r.act) ? r.act : null, href: '#/region/' + encodeURIComponent(r.region), weight: 1, gap: null }; });
      if (!records.length) return reply('No regional active-listing counts are available in the loaded snapshot.', [], { kind: 'unavailable', source: source });
    } else if (p.entity === 'region') {
      if (/^revpar/.test(p.metric || '')) return clarify('RevPAR is available at listing level. Ask for “Average RevPAR in [city]” or “Top listings by RevPAR”.');
      if (p.statuses.some(function (s) { return ['red', 'yellow', 'green'].indexOf(s) === -1; })) return clarify('Regional status filters are red, yellow or green. Reported attention and blocked flags belong to listings.');
      records = R.filter(function (r) { return !p.statuses.length || clean(r[p.period === '15' ? 's14' : 's30']) === p.statuses[0]; }).map(function (r) {
        var v = r[per.region], b = r[per.benchmark], gap = finite(v) && finite(b) ? v - b : null;
        return { name: r.region, value: p.metric === 'gap' ? gap : p.metric === 'benchmark' ? b : p.metric === 'change' ? finite(r.next) && finite(r.past) ? r.next - r.past : null : v,
          occupancy: v, benchmark: b, gap: gap, weight: r.act, href: '#/region/' + encodeURIComponent(r.region) };
      });
    } else {
      records = L.filter(status).map(function (l) { return { name: l.name, value: listingMetric(l, p.metric), gap: listingMetric(l, 'gap'), occupancy: l[per.listing], benchmark: l[p.period === '15' ? 'mk15' : 'mkN'], weight: 1, team: l.group || 'Other', status: l.status || 'Unavailable', href: '#/listing/' + encodeURIComponent(l.id) }; });
    }
    var before = records.length;
    if (p.benchmarkFilter) records = records.filter(function (r) { return (p.entity !== 'region' || r.weight > 0) && finite(r.gap) && (p.benchmarkFilter === 'below' ? r.gap < 0 : p.benchmarkFilter === 'above' ? r.gap > 0 : p.benchmarkFilter === 'atMost' ? r.gap <= 0 : p.benchmarkFilter === 'equal' ? r.gap === 0 : r.gap >= 0); });
    if (p.threshold) records = records.filter(function (r) { return compare(r.value, p.threshold); });
    if (p.changeSign) records = records.filter(function (r) { return finite(r.value) && (p.changeSign === 'negative' ? r.value < 0 : r.value > 0); });
    var compareCities = p.operation === 'compare' && p.entity === 'listing' && p.scopes.length > 1 && p.scopes.every(function (s) { return s.kind === 'place'; });
    if (compareCities) {
      if (p.threshold || p.benchmarkFilter || p.statuses.length || p.type || p.changeSign) return clarify('Compare city averages without filters, or ask a separate filtered calculation for each city.');
      records = p.scopes.map(function (s) {
        var items = L.filter(function (l) { return clean(l.city) === clean(s.name); }).map(function (l) { return listingMetric(l, p.metric); }).filter(finite);
        return { name: s.name, value: items.length ? items.reduce(function (sum, v) { return sum + v; }, 0) / items.length : null, weight: 1, sample: items.length, href: '#/listings/city:' + encodeURIComponent(s.name) };
      });
    }
    if (p.entity === 'team') {
      if (p.operation === 'count') return clarify('Ask for tracked listings in a named team, or average a metric by team. Team counts are not listing counts.');
      var groups = Object.create(null);
      records.forEach(function (r) { (groups[r.team] = groups[r.team] || []).push(r); });
      records = Object.keys(groups).map(function (name) { var valid = groups[name].filter(function (r) { return finite(r.value); }); return { name: name, value: valid.length ? valid.reduce(function (s, r) { return s + r.value; }, 0) / valid.length : null, weight: 1, href: '#/listings/team:' + encodeURIComponent(name), sample: valid.length }; });
    }
    var metricName = { occupancy: 'occupancy', revpar: 'RevPAR', revparChange: 'reported RevPAR change (%)', benchmark: 'benchmark', gap: 'benchmark gap', change: 'occupancy change', active: 'active listings' }[p.metric] || 'tracked listings';
    var label = (p.metric === 'change' || p.metric === 'revparChange' ? 'Next 30D vs Past 30D' : p.metric === 'active' || !p.metric ? 'Current snapshot' : per.label) + ' ' + metricName;
    var scope = p.scopes.length ? p.scopes.map(function (s) { return s.name; }).join(', ') : 'whole portfolio';
    var explanation = 'Scope: ' + scope + '. ' + (p.type ? 'Type: ' + p.type + '. ' : '') + (p.statuses.length ? 'Status filter: ' + p.statuses.join(', ') + '. ' : '') + (p.benchmarkFilter ? 'Benchmark filter: ' + p.benchmarkFilter + '. ' : '') + (p.threshold ? 'Filter: ' + p.threshold.op + ' ' + p.threshold.value + '. ' : '');
    var extra = { source: source, plan: p, interpretation: label + ' | ' + p.operation + ' | ' + p.entity, method: explanation };
    var valid = records.filter(function (r) { return finite(r.value); });
    var countOnly = p.operation === 'count' && p.metric !== 'active';
    if (countOnly) return reply(records.length + ' matching ' + (p.entity === 'region' ? 'regions' : 'tracked listings') + '. ' + explanation + 'Counts use the loaded snapshot, not booking transactions.', [], extra);
    if (p.metric === 'active' && (p.operation === 'count' || p.operation === 'sum' || p.operation === 'list' && !p.scopes.length)) return reply('Active listings: ' + valid.reduce(function (sum, r) { return sum + r.value; }, 0) + '. ' + explanation + (valid.length < records.length ? 'Missing counts excluded.' : ''), [], extra);
    if (p.operation === 'average' || p.operation === 'median') {
      if (p.entity === 'region' && p.operation === 'average' && p.metric !== 'active') valid = valid.filter(function (r) { return finite(r.weight) && r.weight > 0; });
      if (!valid.length) return reply('No comparable numeric values for ' + label + '. Missing values and blocked RevPAR are not treated as zero.', [], extra);
      var value, method;
      if (p.operation === 'median') { var nums = valid.map(function (r) { return r.value; }).sort(function (a, b) { return a - b; }); var mid = Math.floor(nums.length / 2); value = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2; method = 'Median of'; }
      else { var weighted = p.entity === 'region' && p.metric !== 'active'; var denominator = valid.reduce(function (s, r) { return s + (weighted ? r.weight : 1); }, 0); value = valid.reduce(function (s, r) { return s + r.value * (weighted ? r.weight : 1); }, 0) / denominator; method = weighted ? 'Active-listing-weighted mean of' : 'Arithmetic mean of'; }
      return reply(label + ': ' + fmt(value, p.metric === 'revparChange' ? 'occupancy' : p.metric) + '. ' + explanation + method + ' ' + valid.length + ' ' + p.entity + ' values; ' + (records.length - valid.length) + ' missing or ineligible values excluded.', [], extra);
    }
    if (p.operation === 'rank') records = valid.slice().sort(function (a, b) { return (p.direction === 'asc' ? a.value - b.value : b.value - a.value) || a.name.localeCompare(b.name); });
    else records = records.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    if (!records.length) return reply('No matching comparable rows for ' + label + '. ' + explanation, [], extra);
    var rows = records.slice(0, p.limit).map(function (r) {
      var value = fmt(r.value, p.metric === 'revparChange' ? 'occupancy' : p.metric);
      if (p.metric === 'occupancy' && p.period !== 'past') value += ' | Benchmark: ' + fmt(r.benchmark, 'occupancy') + ' | Gap: ' + fmt(r.gap, 'gap');
      if (p.entity === 'team' || compareCities) value += ' | ' + r.sample + ' comparable listings';
      return { label: r.name, value: value, href: r.href };
    });
    return reply(label + '. ' + explanation + 'Showing ' + rows.length + ' of ' + records.length + ' matches' + (p.operation === 'rank' ? ', ' + (p.direction === 'asc' ? 'lowest' : 'highest') + ' first. ' + (before - valid.length) + ' filtered or non-comparable rows excluded.' : '.') + (p.entity === 'team' || compareCities ? ' Group values are arithmetic means of comparable listings.' : ''), rows, extra);
  }
  function coreAnswer(question, data, context) {
    var parsed = parse(question, data, context);
    if (!data.loaded && !(parsed.response && ['help', 'memory'].indexOf(parsed.response.kind) !== -1)) return reply(data.loading ? 'Spreadsheet data is still loading. Try again when the dashboard is ready.' : 'No spreadsheet data is loaded. Use Refresh data on the dashboard, then ask again.', [], { kind: 'unavailable' });
    return parsed.response || execute(parsed.plan, data);
  }
  var TYPO_WORDS = ['occupancy','revpar','benchmark','benchmarks','listings','listing','regions','region','properties','property','average','median','compare','highest','lowest','revenue','available','rental','definition','explain','updated','portfolio','blocked','attention','improving','underperforming','active','calculated','calculation','computed','formula'];
  var COMMON_TYPOS = {waht:'what',whta:'what',wat:'what',whne:'when',wehn:'when',wher:'where',wheer:'where',whtaever:'whatever',wyh:'why',whyy:'why',wich:'which',whch:'which',hw:'how',revapr:'revpar',revpr:'revpar',occpuancy:'occupancy',ocupancy:'occupancy',occupany:'occupancy',occupnacy:'occupancy'};
  function nearWord(a,b) {
    if(Math.abs(a.length-b.length)>1)return false;
    if(a.length===b.length){var mismatches=[];for(var i=0;i<a.length;i++)if(a[i]!==b[i])mismatches.push(i);return mismatches.length===1 || mismatches.length===2 && mismatches[1]===mismatches[0]+1 && a[mismatches[0]]===b[mismatches[1]] && a[mismatches[1]]===b[mismatches[0]];}
    var short=a.length<b.length?a:b,long=a.length<b.length?b:a,j=0,k=0,skips=0;
    while(j<short.length&&k<long.length){if(short[j]===long[k]){j++;k++;}else{skips++;k++;if(skips>1)return false;}}return true;
  }
  function correctQuestion(question,data,context) {
    var raw=String(question), changes=[], protectedWords=Object.create(null);
    if(/^(remember|learn|forget|remove alias)\b/i.test(raw.trim()))return {text:raw,changes:changes};
    catalog(data||{}).forEach(function(e){clean(e.name).split(' ').forEach(function(w){protectedWords[w]=true;});});
    Object.keys(context&&context.aliases||{}).forEach(function(key){clean(key).split(' ').forEach(function(w){protectedWords[w]=true;});});
    var text=raw.replace(/[a-zA-Z]+/g,function(word){var w=word.toLowerCase();if(protectedWords[w]||TYPO_WORDS.indexOf(w)!==-1)return word;var replacement=COMMON_TYPOS[w];
      if(!replacement&&w.length>=5){var candidates=TYPO_WORDS.filter(function(t){return nearWord(w,t);});if(candidates.length===1)replacement=candidates[0];}
      if(!replacement)return word;changes.push(word+' ? '+replacement);return replacement;
    });
    return {text:text,changes:changes};
  }
  // Read current source values for explanations; never equate report rows with active IDs.
  function readSnapshotFacts(data) {
    var regions=(data.wl||[]).map(function(r){return {region:r.region,active:finite(r.act)?r.act:null};});
    var known=regions.filter(function(r){return r.active!==null;});
    var snapshot=data.ov&&data.ov.snapshot||{};
    return {loaded:!!data.loaded,reportedActive:snapshot['ACTIVE LISTINGS'],regions:regions,
      regionalTotal:known.length?known.reduce(function(total,r){return total+r.active;},0):null,
      missingRegions:regions.length-known.length,trackedListings:(data.listings||[]).length};
  }
  function calculationExplanation(question,data,context) {
    var q=clean(question);
    if(!/\b(explain|calculated|calculate|calculation|computed|compute|counted|count|formula|defined|definition|what is|what are|how does|how do|how is|how are)\b/.test(q))return null;
    if(!has(q,'active')||!has(q,'listing'))return null;
    // Ordinary count/value requests still use the query engine.
    if(!/\b(explain|calculated|calculate|calculation|computed|compute|counted|formula|defined|definition|what is|what are|how does|how do|how is|how are)\b/.test(q))return null;
    var resolved=resolve(q,data,safeAliases(context&&context.aliases));
    var remaining=resolved.rest.replace(/\b(explain|active|eligible|listing|listings|property|properties|calculated|calculate|calculation|computed|compute|counted|count|formula|defined|definition|what|is|are|how|does|do|the|a|an|number|total|of|in|for|to|me|can|could|you|please|work|works|and|get|determined)\b/g,'').trim();
    if(remaining)return null;
    if(resolved.entities.some(function(e){return e.kind!=='place';}))return clarify('The loaded active-listing counts are regional totals. I cannot verify individual listing eligibility from this snapshot.');
    var facts=readSnapshotFacts(data);
    var text='The dashboard defines active listings as unique listing IDs that are synced, available and shown, with no inactive override. Each eligible ID is counted once.\n\nThe dashboard reads the Active Listings column from Weekly AM Worklist for each region; the overview card reads the reported total from Executive Overview. This is different from counting rows in Pricelabs Report.\n\nThe loaded JSON contains the resulting totals, not the underlying eligibility flags or spreadsheet formulas, so I can show those totals but cannot independently audit which IDs qualify.';
    var rows=[];
    if(facts.loaded){
      var selected=facts.regions.filter(function(r){return !resolved.entities.length||resolved.entities.some(function(e){return clean(e.name)===clean(r.region);});});
      if(!resolved.entities.length){
        rows.push({label:'Executive Overview active listings',value:facts.reportedActive==null||facts.reportedActive===''?'Unavailable':String(facts.reportedActive)});
        rows.push({label:'Sum of available regional active counts',value:facts.regionalTotal===null?'Unavailable':String(facts.regionalTotal)+(facts.missingRegions?' (incomplete: '+facts.missingRegions+' missing region counts)':'')});
        rows.push({label:'Tracked report rows (different measure)',value:String(facts.trackedListings)});
      }
      selected.slice(0,20).forEach(function(r){rows.push({label:r.region,value:r.active===null?'Active count unavailable':r.active+' active listings',href:'#/region/'+encodeURIComponent(r.region)});});
      if(resolved.entities.length&&!selected.length)text+='\n\nNo regional active count is available for that location.';
      if(selected.length>20)text+='\n\nShowing the first 20 regions; ask about a named region for its count.';
    }else text+='\n\nLoad or refresh the dashboard to include your current totals.';
    return reply(text,rows,{kind:'explanation',source:'Dashboard active-listing definition; Executive Overview; Weekly AM Worklist'});
  }
  function whAnswer(question,data,context) {
    var q=clean(question), resolved, rows;
    if(/^when\b/.test(q)) {
      if(/\b(updated|refreshed|refresh|update|fresh|loaded)\b/.test(q))return coreAnswer('When was this updated?',data,context);
      if(/\b(report|reporting)\b/.test(q)&&/\b(date|period)\b/.test(q))return coreAnswer('Report date',data,context);
      return reply('The loaded snapshot has past 30-day, next 15-day and next 30-day summaries. It does not include individual booking dates or enough history to say exactly when a change happened or predict when performance will improve.',[],{kind:'help'});
    }
    if(/^where\b/.test(q)&&/\b(located|location|situated)\b/.test(q)) {
      if(!data.loaded)return coreAnswer('Portfolio summary',data,context);
      resolved=resolve(q,data,safeAliases(context&&context.aliases));
      var unknown=resolved.rest.replace(/\b(where|is|are|the|listing|listings|property|properties|located|location|situated|of|can|i|find)\b/g,'').trim();
      if(unknown||!resolved.entities.length)return clarify('Name the listing exactly as shown on the dashboard so I can look up its region.');
      rows=(data.listings||[]).filter(function(l){return resolved.entities.some(function(e){return e.kind==='listing'&&clean(e.name)===clean(l.name);});}).map(function(l){return {label:l.name,value:l.city||'Region unavailable',href:'#/listing/'+encodeURIComponent(l.id)};});
      return rows.length?reply('These are the regions recorded for the matching listings, not street addresses.',rows,{source:'Pricelabs Report'}):clarify('Name a listing to look up its region.');
    }
    if(/^why\b/.test(q)) {
      var query=question.replace(/^why\s+(?:is|are|does|do|did|has|have)?\s*/i,'').replace(/\b(so|because|low|high)\b/gi,'').replace(/\b(falling|fallen|dropped|dropping|decreased)\b/gi,'change').replace(/\b(rising|risen|increased)\b/gi,'change');
      var result=coreAnswer(query,data,context);
      if(result.kind==='answer') result.text='The snapshot shows the following figures, but does not establish the cause. Pricing, demand, availability and booking timing would need separate evidence; I cannot confirm them as reasons.\n\n'+result.text;
      return result;
    }
    return coreAnswer(question,data,context);
  }
  function answer(question,data,context) {
    // Keep definitions independent of data availability, including common metric typos.
    var quick=String(question).replace(/[a-zA-Z]+/g,function(w){return COMMON_TYPOS[w.toLowerCase()]||w;});
    var explained=definition(quick);if(explained){if(quick!==question)explained.correction='Interpreted your question as: '+quick;return explained;}
    var corrected=correctQuestion(question,data,context);
    var result=calculationExplanation(corrected.text,data,context)||whAnswer(corrected.text,data,context);
    if(result.kind==='clarify') {
      var suggestions=[], names=catalog(data).filter(function(e){return clean(e.name).indexOf(' ')===-1;});
      corrected.text.replace(/[a-zA-Z]+/g,function(word){
        var w=clean(word);if(w.length<5||names.some(function(e){return clean(e.name)===w;}))return word;
        names.filter(function(e){return nearWord(w,clean(e.name));}).slice(0,3).forEach(function(e){var proposed=corrected.text.replace(new RegExp('\\b'+escapeRE(word)+'\\b','i'),e.name);if(suggestions.indexOf(proposed)===-1)suggestions.push(proposed);});return word;
      });
      if(suggestions.length){result.text='I could not confidently match the name in your question. Did you mean one of these?';result.choices=suggestions.slice(0,3);}
    }
    if(corrected.changes.length)result.correction='Interpreted your question as: '+corrected.text;
    return result;
  }
  function statusFor(question, data, context) {
    var parsed = parse(question, data, context), p = parsed.plan;
    return !p ? 'Reviewing the question and available fields' : p.operation === 'count' ? 'Quantifying matching records' : ['average', 'median', 'sum', 'compare', 'rank'].indexOf(p.operation) !== -1 || ['gap', 'change', 'revparChange'].indexOf(p.metric) !== -1 ? 'Calculating and checking comparisons' : 'Reading matching records';
  }
  // No artificial wait. Browser data queries run off the UI thread with a deadline.
  function createResponder(options) {
    var clock = options.clock || { setTimeout: function (fn, ms) { return setTimeout(fn, ms); }, clearTimeout: function (id) { clearTimeout(id); } };
    var timers = [], generation = 0, busy = false, worker = null;
    function cancel() { generation++; timers.forEach(function(t){clock.clearTimeout(t);}); timers=[]; if(worker) worker.terminate(); worker=null; busy=false; }
    function start(question, context) {
      if (busy) return false;
      busy=true; var token=++generation;
      function schedule(fn, ms) { timers.push(clock.setTimeout(function(){if(token===generation)fn();},ms)); }
      function complete(result, data) { if(token!==generation)return; cancel(); options.onComplete(result, data); }
      function failure(message) { complete(reply(message || 'I could not analyze this question. Try a simpler question or a specific region.', [], {kind:'unavailable'}), {}); }
      options.onStatus('Reading your question');
      schedule(function(){
        var explained=definition(question);
        if(explained){complete(explained, {});return;}
        var data, fellBack = false;
        function fallback() {
          if(token!==generation || fellBack)return;
          fellBack=true;
          if(worker)worker.terminate(); worker=null;
          timers.forEach(function(t){clock.clearTimeout(t);}); timers=[];
          schedule(function(){try{complete(answer(question,data,context),data);}catch(e){failure();}},0);
        }
        try { data=options.getData(); }
        catch(e) { failure('The dashboard snapshot is unavailable. Refresh the dashboard and try again.'); return; }
        try {
          options.onStatus('Checking dashboard data');
          if(options.createWorker){
            worker=options.createWorker();
            worker.onmessage=function(event){ if(token!==generation)return; if(event.data.error){fallback();return;} complete(event.data.reply,data); };
            worker.onerror=function(event){ if(event.preventDefault)event.preventDefault(); if(token===generation)fallback(); };
            schedule(function(){ complete(reply('This query took too long. Try a specific region or listing, or a simpler question.',[],{kind:'unavailable'}),data); },5000);
            worker.postMessage({question:question, data:data, context:context});
          } else complete(answer(question,data,context),data);
        } catch(e) { fallback(); }
      },0);
      return true;
    }
    return {start:start,cancel:cancel,isBusy:function(){return busy;}};
  }
  var api = { readSnapshotFacts: readSnapshotFacts, correctQuestion: correctQuestion, definition: definition, answer: answer, parse: parse, execute: execute, statusFor: statusFor, createResponder: createResponder, safeAliases: safeAliases, vocabulary: WORDS, examples: EXAMPLES, catalog: catalog, clean: clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PortfolioQuery = api;
})(typeof window !== 'undefined' ? window : this);
