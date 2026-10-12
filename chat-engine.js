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
  var EXAMPLES = ['What should I improve for this property?', 'Suggestions for all properties', 'Analyze this page', 'Portfolio report', 'Report on listing occupancy and RevPAR', 'What does coverage mean?', 'How is average occupancy for regions calculated?', 'Where do monthly targets come from?', 'Portfolio summary', 'Which regions are below benchmark?', 'Top 5 listings by occupancy', 'Average RevPAR in Toronto', 'Compare Toronto and Montreal', 'How many properties need attention?', 'Median occupancy for entire units', 'Lowest occupancy next 15 days', 'Biggest RevPAR drops', 'When was this updated?', 'Remember "GTA" means Toronto and Markham'];
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
    extra.calculation = p.metric === 'gap' ? 'Each gap is occupancy minus benchmark, in percentage points.' : p.metric === 'change' ? 'Each occupancy change is Next 30D minus Past 30D, in percentage points.' : p.metric === 'revparChange' ? 'RevPAR change is reported by the source. Its conventional formula is (Next 30D - Past 30D) / Past 30D x 100; a zero past value has no defined relative change.' : 'Values are read from ' + source + '. Underlying nightly records and workbook formulas are not included.';
    extra.evidenceCount = records.length;
    extra.evidence = records.slice(0, 20).map(function (r) { return {label:r.name, value: p.metric === 'gap' ? fmt(r.occupancy,'occupancy') + ' - ' + fmt(r.benchmark,'benchmark') + ' = ' + fmt(r.value,'gap') : fmt(r.value,p.metric === 'revparChange' ? 'occupancy' : p.metric) + (p.entity === 'region' ? ' | Active listings: ' + r.weight : ''), href:r.href}; });
    if (p.report) extra.reportRecords = records;
    var valid = records.filter(function (r) { return finite(r.value); });
    var countOnly = p.operation === 'count' && p.metric !== 'active';
    if (countOnly) extra.calculation = 'Count of records remaining after the displayed scope, status and numeric filters: ' + records.length + '. These are tracked report rows, not booking transactions.';
    if (countOnly) return reply(records.length + ' matching ' + (p.entity === 'region' ? 'regions' : 'tracked listings') + '. ' + explanation + 'Counts use the loaded snapshot, not booking transactions.', [], extra);
    if (p.metric === 'active') extra.calculation = 'Sum the available Active Listings counts from the selected Weekly AM Worklist regions. Report rows are not counted as active IDs.';
    if (p.metric === 'active' && (p.operation === 'count' || p.operation === 'sum' || p.operation === 'list' && !p.scopes.length)) return reply('Active listings: ' + valid.reduce(function (sum, r) { return sum + r.value; }, 0) + '. ' + explanation + (valid.length < records.length ? 'Missing counts excluded.' : ''), [], extra);
    if (p.operation === 'average' || p.operation === 'median') {
      if (p.entity === 'region' && p.operation === 'average' && p.metric !== 'active') valid = valid.filter(function (r) { return finite(r.weight) && r.weight > 0; });
      if (!valid.length) return reply('No comparable numeric values for ' + label + '. Missing values and blocked RevPAR are not treated as zero.', [], extra);
      var value, method;
      if (p.operation === 'median') { var nums = valid.map(function (r) { return r.value; }).sort(function (a, b) { return a - b; }); var mid = Math.floor(nums.length / 2); value = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2; method = 'Median of'; }
      else { var weighted = p.entity === 'region' && p.metric !== 'active'; var denominator = valid.reduce(function (s, r) { return s + (weighted ? r.weight : 1); }, 0); value = valid.reduce(function (s, r) { return s + r.value * (weighted ? r.weight : 1); }, 0) / denominator; method = weighted ? 'Active-listing-weighted mean of' : 'Arithmetic mean of'; }
      extra.calculation += '\n\n' + (p.operation === 'median' ? 'Sort ' + valid.length + ' comparable values; use ' + (nums.length % 2 ? 'middle value ' + nums[mid] : '(' + nums[mid - 1] + ' + ' + nums[mid] + ') / 2') + ' = ' + round(value) + '.' : (weighted ? 'Weighted sum' : 'Sum') + ' ' + round(valid.reduce(function (sum, r) { return sum + r.value * (weighted ? r.weight : 1); }, 0)) + ' / ' + (weighted ? 'eligible active-listing total ' : 'comparable value count ') + denominator + ' = ' + round(value) + '.');
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
  // Curated local retrieval: exact term aliases rank documents; answers use reviewed text,
  // never generated claims or instructions found in workbook cells.
  var KNOWLEDGE = [
    ['occupancy', ['occupancy','occupancy rate','booking rate'], 'Occupancy is booked nights divided by available nights, multiplied by 100. A 15-night booking total across 20 available nights is 75%. The dashboard reads reported percentages; it does not have the nightly records needed to audit blocked-night treatment.', 'Pricelabs Report: Total Occupancy ( Past 30 Days ), Total Occupancy ( Next 15 Days ), Total Occupancy ( Next 30 Days ); Weekly AM Worklist for regions', '#/listings'],
    ['revpar', ['revpar','revenue per available room','revenue per available rental'], 'RevPAR is rental revenue divided by available nights, equivalently ADR multiplied by occupancy as a decimal. It is not total revenue or profit. The dashboard reads reported RevPAR; revenue and night-level inputs are not loaded.', 'Pricelabs Report: RevPAR ( Past 30 Days ), RevPAR ( Next 30 Days )', '#/listings'],
    ['adr', ['adr','average daily rate'], 'ADR is rental revenue divided by booked nights. Example only: $1,000 / 5 nights = $200. ADR excludes unbooked nights from its denominator. ADR inputs are not supplied in the dashboard snapshot.', 'Metric definition; nightly revenue and booked-night inputs are not loaded', '#/listings'],
    ['monthly', ['monthly target','monthly targets','monthly occupancy target','monthly occupancy targets'], 'Regional monthly targets come from the matching region in Property Setup, January through December. Property targets come from Management Inputs, matched by unique Listing ID. Missing property targets are not replaced with regional targets. These are calendar-month goals, not rolling 15/30-day actuals.', 'Property Setup: Jan-December; Management Inputs: January Target-December Target, Listing ID', '#/regions'],
    ['benchmark', ['benchmark','benchmarks','target','targets'], 'A benchmark is a spreadsheet-supplied comparison goal, not necessarily a market average. Regions use Weekly AM Worklist benchmarks with Property Setup as a fallback. Properties use the benchmark columns in Pricelabs Report. Monthly goals use Property Setup for regions and Management Inputs for properties. The snapshot contains results, not the workbook formulas that derive rolling benchmarks.', 'Weekly AM Worklist; Property Setup; Pricelabs Report; Management Inputs', '#/regions'],
    ['gap', ['gap','shortfall','variance','percentage points','percentage point','actual vs target','change vs target'], 'Benchmark gap = occupancy minus benchmark, in percentage points (pp). Example only: 60% - 70% = -10 pp. This differs from relative percentage change: (60 - 70) / 70 x 100 = -14.3%. The dashboard Change vs Target card describes Next 30D versus benchmark.', 'Dashboard comparison calculations; Executive Overview: CHANGE VS TARGET', '#/overview'],
    ['change', ['occupancy change','30d change','15d change'], 'Occupancy change = forward occupancy minus Past 30D occupancy, in percentage points. The chatbot change query uses Next 30D minus Past 30D. Example only: 60% - 45% = +15 pp. Different rolling windows are being compared; this is not a historical time series.', 'Weekly AM Worklist; Pricelabs Report occupancy fields', '#/regions'],
    ['revparChange', ['revpar change','revpar drop','revpar growth'], 'Relative RevPAR change is (Next 30D RevPAR - Past 30D RevPAR) / Past 30D RevPAR x 100. The chatbot displays the reported RevPAR Change field. If past RevPAR is zero, that relative calculation is undefined. Rounded displayed inputs may differ from source precision.', 'Pricelabs Report: RevPAR Change', '#/listings'],
    ['status', ['status','statuses','red','yellow','green','overall status','color','colour'], 'Regional comparison rules: Green at or above benchmark; Yellow below by no more than 10 percentage points; Red more than 10 points below. Regional overall status is the worse of Next 15D and Next 30D. Zero active listings has no active status. Listing labels are reported by Pricelabs Report and are not independently recalculated by the chatbot.', 'Weekly AM Worklist: 15D Status, 30D Status; Pricelabs Report: Status', '#/regions'],
    ['average', ['average','arithmetic mean','mean','weighted average','weighted mean'], 'Listing averages use the sum of comparable values divided by their count. Regional averages use active-listing weights: sum(value x active listings) / sum(active listings). Missing values and blocked RevPAR are excluded; valid zero values remain. Team values are arithmetic means of comparable listings. A weighted regional result can differ from a simple listing average.', 'Chatbot aggregation rules over the loaded Pricelabs Report and Weekly AM Worklist', '#/overview'],
    ['median', ['median'], 'Sort the comparable numbers. The median is the middle number for an odd count, or the average of the two middle numbers for an even count. Chatbot medians are unweighted, including regional medians. Missing values are excluded and valid zeros remain.', 'Chatbot aggregation rules', '#/listings'],
    ['active', ['active listings','active listing','eligible listings','active properties'], 'Active listings are unique listing IDs that are synced, available and shown, with no inactive override. The overview reads Executive Overview; regional totals read Weekly AM Worklist. These are different from counting displayed report rows. Eligibility flags and workbook formulas are not fully included in this snapshot.', 'Executive Overview; Weekly AM Worklist: Active Listings', '#/overview'],
    ['tracked', ['tracked listings','report rows','tracked properties','source match review'], 'Tracked listings are the eligible report rows shown by this dashboard. Blank names, Source match review rows, and rows with no occupancy data are excluded. A valid 0% occupancy is retained. Tracked report rows and active unique-ID totals measure different populations.', 'Pricelabs Report; dashboard normalization', '#/listings'],
    ['blocked', ['fully blocked','blocked nights','blocked'], 'A fully blocked RevPAR field is treated as unavailable, not zero. The chatbot excludes that field from RevPAR averages. A numeric 0 is a valid value. The snapshot does not contain a complete nightly availability calendar.', 'Pricelabs Report RevPAR fields; dashboard blocked flags', '#/listings'],
    ['chart', ['only shows july','only show july','chart stops','missing months'], 'Monthly charts should cover January through December. Blank months can result from empty source cells, an unmatched header or an older API response. The monthly reader supports both abbreviated and full month names. Check Property Setup for a region or Management Inputs for a property, then refresh. A snapshot alone cannot prove which of these caused a missing month.', 'Property Setup; Management Inputs; dashboard API month mapping', '#/regions'],
    ['missing', ['missing data','missing values','unavailable','n a','blank','blanks','not set'], 'Unavailable or blank means the required value is absent or cannot be parsed; it does not mean zero. Check the source row, header spelling, listing ID match, and last refresh. Monthly targets display a dash when unset. A blank chart alone does not prove poor performance.', 'Loaded snapshot; Data tables; source workbook', '#/data'],
    ['coverage', ['coverage','actuals coverage'], 'Actuals coverage is supplied by Monthly Performance alongside finalized monthly occupancy. It indicates how much actuals data is covered according to the workbook. The dashboard does not load its numerator, denominator or formula, so it cannot independently reconstruct coverage. 0% coverage should not be interpreted as 0% occupancy.', 'Monthly Performance: Actuals coverage, Finalized monthly occupancy', '#/regions'],
    ['monthlyPerformance', ['monthly performance','finalized monthly occupancy','monthly actuals'], 'Monthly Performance supplies the region, review month, finalized monthly occupancy and actuals coverage. The regional detail compares the actual with that calendar month target from Property Setup. An unavailable actual gives an unavailable gap and review result.', 'Monthly Performance; Property Setup monthly targets', '#/regions'],
    ['reporting', ['reporting month','reporting date','report date','rolling period','rolling window','next 15 days','next 30 days','past 30 days','next 60 days'], 'Rolling horizons and calendar months are different. Occupancy queries support Past 30D, Next 15D and Next 30D. RevPAR supports Past 30D and Next 30D. Property Setup supplies the reporting month and a Next 60D benchmark, but the chatbot has no general Next 60D actuals series.', 'Property Setup: Reporting Month; Executive Overview report date; Pricelabs Report', '#/overview'],
    ['freshness', ['refresh','last updated','cache','cached','freshness','stale data'], 'Answers use the dashboard snapshot, not a new spreadsheet read for each message. Automatic refresh is every five minutes while the page is visible. Manual Refresh forces a new read. Server cache lasts five minutes; a successful browser snapshot may be restored for up to 15 minutes while rechecking. A failed refresh can leave older values visible.', 'Dashboard refresh and cache rules; sidebar Last updated', '#/overview'],
    ['base', ['base price','recommended base price','pricing'], 'Base Price and Recommended Base Price are supplied by Detailed Listings. The dashboard joins details by an unambiguous property name; it does not recreate the pricing recommendation model. These are different from ADR and RevPAR.', 'Detailed Listings: Base Price, Recommended Base Price', '#/listings'],
    ['pickup', ['booking pickup','bookings pickup','pickup'], '30D Booking Pickup is the value reported in Detailed Listings under Bookings Pickup 30D. The dashboard does not receive its underlying booking events or source formula and cannot reconstruct its timing or units beyond the sheet label.', 'Detailed Listings: Bookings Pickup 30D', '#/listings'],
    ['lastBooked', ['last booked','last booking date'], 'Last booked is the Last Booked Date supplied by Detailed Listings. It is separate from the dashboard refresh time. Individual booking records are not loaded.', 'Detailed Listings: Last Booked Date', '#/listings'],
    ['tasks', ['open tasks','action regions','am actions','account manager'], 'Action regions are supplied by AM Actions, with Overall Status and Open Tasks. The dashboard links to AM Action Inputs for operational follow-up. Open task counts do not explain the cause of an occupancy change.', 'AM Actions: Region, Overall Status, Open Tasks; AM Action Inputs', '#/data'],
    ['retention', ['retention','client level','client tier','retention level','client level override','retention level override'], 'Client and retention tiers are kept in Management Inputs. Executive Overview reports retention exposure. The snapshot does not establish why a client may leave or independently verify the business judgment behind a tier.', 'Management Inputs; Executive Overview', '#/data'],
    ['rank', ['rank','ranking'], 'Listing Rank is supplied by Pricelabs Report and describes the dashboard forward RevPAR ranking. A chatbot Top/Bottom question creates a separate ordering from its requested metric, scope and period, excluding unavailable numeric values.', 'Pricelabs Report: Rank; chatbot query sort', '#/listings'],
    ['sources', ['data source','references','reference','source workbook','spreadsheet','where does the data come from'], 'The dashboard reads a bound Google workbook through its Apps Script API. Executive Overview supplies headline cards; Weekly AM Worklist supplies regional summaries; Pricelabs Report supplies listings; Detailed Listings supplies pricing/bookings; Property Setup supplies regional monthly goals; Management Inputs supplies property monthly goals and management fields.', 'Apps Script dashboard response; Data view', '#/data'],
    ['capabilities', ['rag','artificial intelligence','ai','chatbot','knowledge base'], 'This assistant uses a local searchable knowledge base, deterministic query parsing and calculations over the loaded snapshot. It needs no AI API or external model. It can explain supported dashboard terms and calculations, but cannot guarantee every possible question, invent missing facts, predict outcomes, or prove business causes from summary figures.', 'Portfolio Desk local chat engine', '#/overview']
  ];
  function retrieveKnowledge(question) {
    var q = clean(question);
    return KNOWLEDGE.map(function (doc) {
      var matches = doc[1].filter(function (alias) { return phrase(q, alias); });
      return { doc: doc, score: matches.reduce(function (best, alias) { return Math.max(best, clean(alias).split(' ').length * 10 + clean(alias).length); }, 0) };
    }).filter(function (hit) { return hit.score; }).sort(function (a, b) { return b.score - a.score; });
  }
  function knowledgeAnswer(question, data, context) {
    var q = clean(question), hits = retrieveKnowledge(q);
    if (/^what (is|are|s)\b/.test(q) && parse(question, data, context).plan) return null;
    if (/\bin\s+/.test(q) && !/\bin (simple|plain) (terms|english)\b/.test(q) && !resolve(q, data, safeAliases(context && context.aliases)).entities.length) return null;
    var explanatory = /\b(explain|definition|define|meaning|stand for|formula|calculated|calculation|computed|how|why|reference|source|what is|what are|what does|what s)\b/.test(q) || /^where.*\b(find|value|come|source|reference)\b/.test(q);
    if (/\bhow (many|much)\b/.test(q)) return null;
    var follow = /^(how (is|was|did you) (this|that|it)|why (is|does) (this|that|it|the result)|where (is|does) (this|that|it)|where can i find (this|that|it|the value)|explain (this|that|it|the result)|what does (this|that|it) mean)/.test(q);
    follow = follow || /^(how|why|where|explain)\b/.test(q) && /\b(this|that|it|the result|the value)\b/.test(q);
    if (follow && !hits.length && context && context.lastKnowledge) {
      var topic = KNOWLEDGE.filter(function (doc) { return doc[0] === context.lastKnowledge; })[0];
      if (topic) return reply(topic[2], [{label:'Find '+topic[1][0],value:topic[3],href:topic[4]}], {kind:'help',source:topic[3],knowledge:[topic[0]]});
    }
    if (follow && context && context.lastPlan) return explainPlan(context.lastPlan, data, q);
    if (follow && !hits.length || /^(how is this calculated|where can i find the value)$/.test(q)) return clarify('Which metric or result do you mean? Name it, or ask a data question first and then ask how it was calculated.', null, ['How is average occupancy calculated?', 'Where do monthly targets come from?', 'What does coverage mean?']);
    if (!explanatory && context && (context.pending || context.lastPlan)) return null;
    if (!explanatory && !(hits.length && hits[0].doc[1].some(function (alias) { return q === clean(alias); }))) return null;
    if (!hits.length) return null;
    var entities = resolve(q, data, safeAliases(context && context.aliases));
    // Values with a named scope go through a calculation, not a generic definition.
    if (entities.entities.length && !/\b(where|reference|source|definition|define|meaning|mean)\b/.test(q)) return null;
    var residual = entities.rest;
    hits.forEach(function (hit) { hit.doc[1].slice().sort(function (a,b) { return b.length-a.length; }).forEach(function (alias) { residual = residual.replace(new RegExp('(^| )' + escapeRE(clean(alias)) + '(?= |$)', 'g'), ' '); }); });
    residual = residual.replace(/\b(what|is|are|s|a|an|the|does|do|did|it|this|that|mean|means|explain|define|definition|meaning|stand|for|of|how|why|where|can|could|would|i|you|we|find|see|look|up|value|values|come|comes|from|source|reference|references|calculated|calculation|calculate|computed|compute|formula|in|on|to|me|please|simple|plain|english|terms|with|example|examples|and|or|versus|vs|difference|between|compare|different|be|only|shows|show|missing|zero|result|results|used|use|using|work|works|dashboard|data)\b/g, '').trim();
    if (residual) return null;
    var doc = hits[0].doc;
    if (doc[0] !== 'chart' && /\b(why|how many|how much)\b/.test(q) && !/\b(missing|blank|unavailable|zero|different|difference|calculated|computed|formula)\b/.test(q)) return null;
    var selected = [doc];
    if (/\b(difference|versus|vs|and|compare)\b/.test(q)) hits.slice(1).forEach(function (hit) {
      if (selected.length < 3 && !selected.some(function (d) { return d[0] === hit.doc[0]; })) selected.push(hit.doc);
    });
    return reply(selected.map(function (d) { return d[2]; }).join('\n\n'), selected.map(function (d) { return { label: 'Find ' + d[1][0], value: d[3], href: d[4] }; }), { kind: 'help', source: selected.map(function (d) { return d[3]; }).join('; '), knowledge: selected.map(function (d) { return d[0]; }), choices: ['How is average occupancy calculated?', 'Where do monthly targets come from?', 'Why can values be unavailable?'] });
  }
  function explainPlan(plan, data, question) {
    var result = execute(plan, data);
    if (result.kind !== 'answer') return result;
    result.explained = true;
    result.text += '\n\n' + (result.calculation || 'These are reported source values. The loaded snapshot does not include the underlying nightly records or workbook formulas.');
    if (/\bwhy\b/.test(question || '')) result.text += '\n\nThe snapshot does not establish the cause. This explains the numerical result. Pricing, demand and booking timing require separate evidence.';
    if (result.evidence && result.evidence.length) result.rows = result.evidence.slice(0, 20).concat(result.rows || []);
    if (result.evidenceCount > 20) result.text += '\n\nShowing 20 contributing rows; the calculation uses all eligible rows.';
    return result;
  }
  function analyticalAnswer(question, data, context) {
    var q = clean(question), entities = resolve(q, data, safeAliases(context && context.aliases));
    if (/\bmonthly\b/.test(q) && /\btarget|targets\b/.test(q)) {
      if (!entities.entities.length) return knowledgeAnswer(question, data, context) || clarify('Name a region or full property name for its monthly targets.');
      if (!data.loaded) return reply('Load or refresh the dashboard to read monthly targets.', [], {kind:'unavailable'});
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      var full = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      var requested = months.map(function (m,i) { return phrase(q,m) || phrase(q,full[i]) ? i : -1; }).filter(function (i) { return i >= 0; });
      if (/\b20\d{2}\b/.test(q)) return clarify('Monthly targets are calendar-month settings without year-specific history. Ask for a month without a year.');
      var rows = [];
      entities.entities.forEach(function (entity) {
        var values, href;
        if (entity.kind === 'place') {
          var entry = Object.keys(data.setup || {}).filter(function (key) { return clean(key) === clean(entity.name); })[0];
          values = entry ? data.setup[entry].months : []; href = '#/region/' + encodeURIComponent(entity.name);
        } else if (entity.kind === 'listing') {
          var matches = (data.listings || []).filter(function (l) { return clean(l.name) === clean(entity.name); });
          if (matches.length !== 1) { rows.push({label:entity.name,value:'Ambiguous property name; use its detail page.'}); return; }
          values = (data.propertyTargets || {})[matches[0].id] || []; href = '#/listing/' + encodeURIComponent(matches[0].id);
        } else { rows.push({label:entity.name,value:'Monthly targets are defined per region or property, not per team.'}); return; }
        (requested.length ? requested : months.map(function (_,i) { return i; })).forEach(function (i) { rows.push({label:entity.name + ' - ' + months[i],value:fmt((values || [])[i],'occupancy'),href:href}); });
      });
      return reply('Calendar-month targets from the loaded snapshot. Unavailable values are not zero and do not inherit another region or property target.', rows.slice(0,36), {source:'Property Setup for regions; Management Inputs matched by Listing ID for properties'});
    }
    var detailTerms = [ ['recommended base price','recommended'], ['base price','base'], ['bookings pickup','pickup'], ['booking pickup','pickup'], ['last booked','lastBooked'], ['bedrooms','bedrooms'] ];
    var detailTerm = detailTerms.filter(function (term) { return phrase(q,term[0]); })[0];
    if (detailTerm && entities.entities.some(function (e) { return e.kind === 'listing'; })) {
      if (!data.loaded) return reply('Load or refresh the dashboard to read property details.',[],{kind:'unavailable'});
      var detailRows = entities.entities.filter(function (e) { return e.kind === 'listing'; }).map(function (entity) {
        var matching = (data.listings || []).filter(function (l) { return clean(l.name) === clean(entity.name); });
        var detail = (data.details || {})[String(entity.name).trim().toLowerCase()];
        var value = matching.length === 1 && detail && !Array.isArray(detail) ? detail[detailTerm[1]] : null;
        return {label:entity.name,value:detailTerm[0] + ': ' + (value == null || value === '' ? 'Unavailable' : String(value)),href:matching.length === 1 ? '#/listing/'+encodeURIComponent(matching[0].id) : '#/listings'};
      });
      return reply('Reported property details. The snapshot supplies these values, not the source calculation or booking events.',detailRows,{source:'Detailed Listings: '+detailTerm[0]});
    }
    if (!/\b(explain|why|how|calculated|calculation|formula|computed)\b/.test(q) || /\bhow (many|much)\b/.test(q)) return null;
    if (/\b(status|red|yellow|green)\b/.test(q) && entities.entities.length === 1 && entities.entities[0].kind === 'place') {
      if (!data.loaded) return reply('Load or refresh the dashboard to explain this status.', [], {kind:'unavailable'});
      var region = (data.wl || []).filter(function (r) { return clean(r.region) === clean(entities.entities[0].name); })[0];
      if (!region) return clarify('That place has no regional summary in this snapshot.');
      var rows = [['15', 'n14','b14','s14'],['30','next','b30','s30']].map(function (keys) {
        var a = region[keys[1]], b = region[keys[2]], gap = finite(a) && finite(b) ? a-b : null;
        var computed = region.act === 0 ? 'No active listings' : gap === null ? 'Unavailable' : gap >= 0 ? 'Green' : gap >= -10 ? 'Yellow' : 'Red';
        return {label:'Next '+keys[0]+'D',value:fmt(a,'occupancy')+' - '+fmt(b,'benchmark')+' = '+fmt(gap,'gap')+'. Rule: '+computed+'. Reported: '+(region[keys[3]] || 'Unavailable'),href:'#/region/'+encodeURIComponent(region.region)};
      });
      return reply('Regional status uses occupancy minus benchmark: Green at or above 0 pp, Yellow from -10 pp to below 0 pp, Red below -10 pp. Overall uses the worse reported forward status. If the reported status differs from the rule, check the workbook and refresh; I show both rather than silently replacing it.',rows,{kind:'explanation',source:'Weekly AM Worklist; Property Setup benchmark fallback'});
    }
    var query = question.replace(/^(?:please\s+)?(?:explain\s+(?:how\s+)?|how\s+(?:is|are|was|were|do you|does the dashboard)\s+|why\s+(?:is|are|was|were)\s+)/i,'')
      .replace(/\b(calculated|computed|calculation|formula|so|low|high)\b/gi,'').replace(/\b(the result for|the value for)\b/gi,'');
    var parsed = parse(query, data, context);
    if (parsed.plan) return explainPlan(parsed.plan, data, q);
    return null;
  }

  // Recommendations are conditional reviews, not an automated pricing optimizer.
  function propertyRecommendations(listing, data) {
    var gap15 = finite(listing.occ15) && finite(listing.mk15) ? listing.occ15-listing.mk15 : null;
    var gap30 = finite(listing.occN) && finite(listing.mkN) ? listing.occN-listing.mkN : null;
    var revenueChange = !listing.blocked && !listing.blockedN && finite(listing.rev) && listing.rev > 0 && finite(listing.revN) ? (listing.revN-listing.rev)/listing.rev*100 : null;
    var blocked = !!listing.blockedN;
    var evidence = ['Next 15D occupancy: '+fmt(listing.occ15,'occupancy')+'; benchmark: '+fmt(listing.mk15,'benchmark')+'; gap: '+fmt(gap15,'gap')+'.',
      'Next 30D occupancy: '+fmt(listing.occN,'occupancy')+'; benchmark: '+fmt(listing.mkN,'benchmark')+'; gap: '+fmt(gap30,'gap')+'.',
      'RevPAR, Past 30D / Next 30D: '+fmt(listing.blocked ? null : listing.rev,'revpar')+' / '+fmt(blocked ? null : listing.revN,'revpar')+(revenueChange === null ? '. Relative change cannot be reconstructed from these inputs.' : '; change from these inputs: '+round(revenueChange)+'%.')];
    var first = [], improve = [], avoid = [], keep = [];
    var availableGaps = [gap15,gap30].filter(finite), worst = availableGaps.length ? Math.min.apply(null,availableGaps) : null;
    var priority = blocked ? 4 : worst !== null && worst < -10 ? 3 : worst !== null && worst < 0 || revenueChange !== null && revenueChange < 0 ? 2 : worst === null ? 1 : 0;
    if (blocked) {
      first.push('Verify whether the forward calendar is intentionally blocked. If blocks are accidental, correct availability and sync before evaluating pricing; retain owner stays and maintenance blocks.');
      improve.push('Once bookable nights are verified, refresh the dashboard and reassess occupancy against its benchmark.');
      avoid.push('Do not interpret blocked RevPAR as zero revenue or reduce prices to fix intentional calendar blocks.');
      keep.push('Keep intentional owner-use, safety and maintenance restrictions in place.');
    } else if (gap15 !== null && gap15 < 0) {
      first.push('Prioritize the next 15 days: occupancy is '+round(Math.abs(gap15))+' pp below benchmark. Inspect unbooked dates, bookability, minimum stays and arrival restrictions before considering a targeted rate test.');
      improve.push('For genuinely sellable gaps, compare current rates with suitable alternatives and check whether stay restrictions prevent bookings. Change one constraint or pricing setting at a time and record the result.');
    } else if (gap30 !== null && gap30 < 0) {
      first.push('Review the next 30 days, which are '+round(Math.abs(gap30))+' pp below benchmark. Identify the specific open dates and confirm listing availability, restrictions and rate positioning.');
      improve.push('Investigate forward booking pace before applying promotions; use date-specific tests only where the calendar and margin constraints support them.');
    } else if (worst !== null) {
      first.push('Available occupancy comparisons meet benchmark. Preserve the current setup while reviewing whether achieved revenue is also holding up.');
    } else {
      first.push('Complete the missing occupancy or benchmark fields before choosing a pricing intervention. The snapshot cannot establish whether this property is below target.');
    }
    if (!blocked && revenueChange !== null && revenueChange < 0) {
      improve.push('Forward RevPAR is '+round(Math.abs(revenueChange))+'% lower than Past 30D. Check rate mix, occupancy and available nights together; these different windows do not prove that a price cut caused the decline.');
      avoid.push('Avoid chasing occupancy with broad discounts while RevPAR is weaker. Check net-rate and margin limits before any date-specific test.');
    } else if (!blocked && revenueChange !== null && revenueChange >= 0) {
      keep.push('Forward RevPAR is '+round(revenueChange)+'% '+(revenueChange === 0 ? 'unchanged' : 'higher')+' versus Past 30D. Preserve the current revenue discipline while checking which dates still miss occupancy goals.');
    }
    if (!blocked && gap15 !== null && gap15 >= 0) keep.push('The Next 15D occupancy comparison meets benchmark. Avoid disturbing already performing near-term dates when testing changes elsewhere.');
    if (!blocked && gap30 !== null && gap30 >= 0) keep.push('The Next 30D occupancy comparison meets benchmark. Maintain routine monitoring rather than applying portfolio-wide discounts.');
    if (!blocked && (gap15 === null || gap30 === null || revenueChange === null)) improve.push('Fill missing horizon or RevPAR inputs and refresh before making a stronger recommendation. A zero past RevPAR does not support a percentage-growth calculation.');
    var detail = (data.details || {})[String(listing.name).trim().toLowerCase()];
    function numeric(value) { var text = String(value == null ? '' : value).replace(/[$,%\s]/g,''); return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : null; }
    var base = detail && !Array.isArray(detail) ? numeric(detail.base) : null, recommended = detail && !Array.isArray(detail) ? numeric(detail.recommended) : null;
    if (!blocked && finite(base) && base > 0 && finite(recommended) && recommended > 0 && base !== recommended) {
      evidence.push('Detailed Listings Base Price: $'+round(base)+'; Recommended Base Price: $'+round(recommended)+'.');
      improve.push('Review the source recommended base price of $'+round(recommended)+' against the current $'+round(base)+'. Treat it as a candidate to validate against date-level demand and your minimum acceptable net rate, not an instruction to apply it automatically.');
    }
    if (!improve.length) improve.push('Measure booking pickup, achieved rates and RevPAR after the next refresh; use date-level evidence to identify further opportunities.');
    if (!keep.length) keep.push('Keep deliberate operating constraints and a record of changes. The available figures do not establish which commercial tactics are working.');
    avoid.push('Avoid inferring weak photos, poor reviews, low demand or overpricing from these summary figures alone; those explanations need separate evidence.');
    if (!blocked && worst !== null && worst >= 0) avoid.push('Do not raise rates solely because occupancy meets benchmark; assess remaining availability, demand and revenue before testing a change.');
    return {id:listing.id,name:listing.name,priority:priority,gap:worst,evidence:evidence,first:first,improve:improve,avoid:avoid,keep:keep,
      review:'After any justified change, record its date and scope. Recheck forward occupancy, benchmark gaps, booking pickup and RevPAR at the next review. A refreshed rolling window is not proof that the change caused the result.'};
  }
  function recommendationAnswer(question, data, context) {
    var q = clean(question);
    if (/^(when|why)\b/.test(q)) return null;
    if (!/\b(suggest|suggestion|suggestions|recommend|recommendation|recommendations|advice|advise|improve|improvement|improvements|avoid|keep|best things?|best actions?|what should|what to do|what can i do|what can we do)\b/.test(q)) return null;
    if (/\b(report|analysis|analyze|analyse|chart|graph|definition|define|what does)\b/.test(q)) return null;
    if (!data.loaded) return reply('Load or refresh the dashboard before asking for property recommendations.',[],{kind:'unavailable'});
    var resolved = resolve(q,data,safeAliases(context && context.aliases)), selected = [], scope = '', page = data.page || {};
    var residual = resolved.rest.replace(/\b(suggest|suggestion|suggestions|recommend|recommendation|recommendations|advice|advise|improve|improvement|improvements|avoid|keep|best|things|thing|action|actions|what|are|is|tell|some|should|would|could|can|i|we|you|do|to|for|of|on|in|with|and|the|a|an|my|our|this|that|these|those|it|property|properties|listing|listings|region|regions|team|teams|page|current|performance|performace|perform|better|help|give|me|please|based|base|data|all|portfolio|first|next|steps|now|how|which|doing|keep|stop|doing|increase|boost|occupancy|revenue|revpar|booking|bookings|pricing|price|prices|rate|rates)\b/g,'').trim();
    if (residual || resolved.stale) return clarify('Name a property or region exactly as shown in the dashboard, or open its page and ask "What should I improve for this property?" I cannot apply an unrecognized name or filter safely.');
    if (resolved.entities.length) {
      var names = resolved.entities;
      if (names.some(function (e) { return e.kind === 'listing' && (data.listings || []).filter(function (l) { return clean(l.name) === clean(e.name); }).length > 1; })) return clarify('More than one property has that name. Open its listing detail page and ask for recommendations there.');
      selected = (data.listings || []).filter(function (l) { return ['place','team','listing'].every(function (kind) {
        var filters = names.filter(function(e){return e.kind===kind;});
        return !filters.length || filters.some(function(e){return clean(e.name)===clean(kind==='place'?l.city:kind==='team'?l.group:l.name);});
      }); }); scope = names.map(function(e){return e.name;}).join(', ');
    } else if (/\b(all|portfolio)\b/.test(q)) { selected = data.listings || []; scope = 'Portfolio'; }
    else if (page.kind === 'listing') { selected = (data.listings || []).filter(function(l){return String(l.id)===page.arg;}); scope = 'Current property'; }
    else if (page.kind === 'region') { selected = (data.listings || []).filter(function(l){return clean(l.city)===clean(page.arg);}); scope = page.arg; }
    else if (page.kind === 'listings') { selected = (data.listings || []).filter(function(l){return (page.listingIds || []).indexOf(l.id)!==-1;}); scope = 'Current Listings filters'; }
    else if (context && context.lastRecommendations && context.lastRecommendations.length) { selected = (data.listings || []).filter(function(l){return context.lastRecommendations.indexOf(l.id)!==-1;}); scope = 'Previously discussed properties, refreshed values'; }
    else if (context && context.lastPlan && context.lastPlan.entity === 'listing') {
      var previous = execute(Object.assign({},context.lastPlan,{report:true}),data);
      var links = (previous.reportRecords || []).map(function(r){return r.href;});
      selected = (data.listings || []).filter(function(l){return links.indexOf('#/listing/'+encodeURIComponent(l.id))!==-1;}); scope = 'Previous query filters, refreshed values';
    } else return clarify('Which property or region should I review? You can also ask "Suggestions for all properties" or open a listing and ask "What should I improve?"');
    if (!selected.length) return reply('No matching properties are available in this snapshot. Check the selected scope and refresh.',[],{kind:'unavailable'});
    var advice = selected.map(function(l){return propertyRecommendations(l,data);}).sort(function(a,b){return b.priority-a.priority || (a.gap == null ? 0 : a.gap)-(b.gap == null ? 0 : b.gap) || a.name.localeCompare(b.name);});
    return reply('Property improvement review: '+scope+'. Showing '+Math.min(5,advice.length)+' of '+advice.length+' matching properties, prioritized by blocked forward availability and benchmark shortfalls. These are suggested checks, not guaranteed improvements.',[],{
      kind:'recommendations',recommendations:advice.slice(0,5),recommendationIds:selected.map(function(l){return l.id;}),source:'Pricelabs Report occupancy, benchmarks and RevPAR; Detailed Listings base prices. Snapshot-based rules; no pricing changes are applied.'});
  }

  function reportAnswer(question, data, context) {
    var q = clean(question);
    if (!/\b(report|analysis|analyze|analyse|analyzation|analization|chart|charts|graph|graphs|visualize|visualise)\b/.test(q) || /\b(report date|reporting date|data issue|data error|source match|report rows)\b/.test(q)) return null;
    if (/\b(what is|define|meaning|definition)\b/.test(q)) return null;
    if (!data.loaded) return reply('Load or refresh the dashboard before generating a report.', [], {kind:'unavailable'});
    var query = question.replace(/\b(?:detailed|comprehensive|full|summary|performance|analytical|visual|bar|line|pie)\s+(?:report|analysis|chart|graph)\b/gi,' ')
      .replace(/\b(report|reports|analysis|analyze|analyse|analyzation|analization|chart|charts|graph|graphs|visualize|visualise|generate|create|prepare|provide|write|build|draw|detailed|comprehensive|suggestions|recommendations|explanations|explanation|insights)\b/gi,' ')
      .replace(/\b(with|include|including|about|regarding|give me|can you|please)\b/gi,' ').replace(/\s+/g,' ').trim();
    var working = data, pageNote = '', page = data.page || {}, plan;
    if (/\b(this|current) page\b/.test(clean(query))) {
      query = query.replace(/\b(this|current) page\b/gi,' ').trim();
      if (page.kind === 'listing') {
        var listing = (data.listings || []).filter(function (l) { return String(l.id) === page.arg; })[0];
        if (!listing) return clarify('The current listing is not in the loaded snapshot.');
        working = Object.assign({}, data, {listings:[listing]}); query += ' listings'; pageNote = 'Current listing: ' + listing.name + '.';
      } else if (page.kind === 'region') { query += ' ' + page.arg; pageNote = 'Current region: ' + page.arg + '.'; }
      else if (page.kind === 'listings') {
        working = Object.assign({}, data, {listings:(data.listings || []).filter(function (l) { return (page.listingIds || []).indexOf(l.id) !== -1; })});
        query += ' listings'; pageNote = 'Current Listings filters, across all result batches.';
      } else if (['overview','regions'].indexOf(page.kind) !== -1) { query += ' regions'; pageNote = 'Current ' + page.kind + ' page.'; }
      else return clarify('For this page, specify the region, listing or metric to report. I can analyze Dashboard, Regions, Listings and their detail pages directly.', null, ['Portfolio report', 'Report on occupancy by region', 'Report on listing RevPAR']);
    }
    query = query.replace(/\b(portfolio|dashboard)\b/gi, 'regions').replace(/\bper\b/gi,'by').replace(/\bpercentages?\b/gi,'occupancy');
    if (!clean(query).replace(/\b(for|on|of|and|the)\b/g,'').trim()) query = 'regions';
    var monthly = /\bmonthly\b/.test(clean(query)) && /\btargets?\b/.test(clean(query));
    if (monthly) {
      var targetReply = analyticalAnswer(query, working, context);
      if (!targetReply || targetReply.kind !== 'answer') return targetReply || clarify('Name a region or property for a monthly-target report.');
      var points = targetReply.rows.map(function (r) { return {label:r.label,value:r.value === 'Unavailable' ? null : Number(r.value.replace('%','')),href:r.href}; });
      return reply('Monthly occupancy target report. ' + pageNote, [], {kind:'report',source:targetReply.source,report:{title:'Monthly occupancy targets',summary:'Calendar-month goals from the loaded snapshot; these are targets, not historical actual occupancy.',unit:'%',points:points.slice(0,12),table:points,stats:[],method:'Region: Property Setup. Property: Management Inputs matched by unique Listing ID. Unavailable targets stay missing.',suggestions:['Review months with missing targets in the appropriate source tab before using them for decisions.','Compare finalized monthly actuals and coverage with the matching calendar-month goal.'],limitations:['Chart shows up to 12 values; table contains up to 36 requested region-month or property-month values. Narrow the request for larger comparisons.','No historical trend or forecast is implied by these monthly targets.'],updated:data.updated || 'Unknown'}});
    }
    var combined = has(clean(query),'occupancy') && has(clean(query),'revpar');
    if (combined) query = query.replace(/\b(and|revpar)\b/gi,' ');
    var parsed = parse(query, working, context);
    if (!parsed.plan) return parsed.response;
    plan = Object.assign({}, parsed.plan, {report:true});
    if (combined && (plan.entity !== 'listing' || plan.period === '15' || plan.threshold || plan.benchmarkFilter || plan.changeSign)) return clarify('For a combined occupancy and RevPAR report, use listings with Past 30D or Next 30D and no numeric filter. Otherwise request one metric at a time.');
    if (plan.operation === 'summary') { plan.operation = 'list'; plan.entity = 'region'; plan.metric = 'occupancy'; }
    var result = execute(plan, working);
    if (result.kind !== 'answer') return result;
    var records = result.reportRecords || [], metric = plan.metric || 'count', unit = metric === 'revpar' ? '$' : metric === 'active' || metric === 'count' ? 'count' : metric === 'gap' || metric === 'change' ? 'pp' : '%';
    var points;
    if (!plan.metric && plan.operation === 'count') {
      var groups = Object.create(null);
      records.forEach(function (r) { var name = plan.entity === 'region' ? 'Matching regions' : r.team || 'Other'; groups[name] = (groups[name] || 0) + 1; });
      points = Object.keys(groups).map(function (name) { return {label:name,value:groups[name]}; });
    } else points = records.map(function (r) { return {label:r.name,value:finite(r.value) ? r.value : null,benchmark:plan.metric === 'occupancy' && finite(r.benchmark) ? r.benchmark : null,href:r.href,weight:r.weight}; });
    if (plan.operation === 'rank') points.sort(function (a,b) { return (a.value == null) - (b.value == null) || (plan.direction === 'asc' ? a.value-b.value : b.value-a.value) || a.label.localeCompare(b.label); });
    var allPoints = points, chartPoints = points.slice(0,plan.operation === 'rank' ? Math.min(plan.limit,12) : 12);
    var valid = points.filter(function (p) { return finite(p.value); });
    var weighted = plan.entity === 'region' && metric !== 'active' && metric !== 'count';
    var eligible = valid.filter(function (p) { return !weighted || finite(p.weight) && p.weight > 0; });
    var denominator = eligible.reduce(function (sum,p) { return sum + (weighted ? p.weight : 1); },0);
    var mean = denominator ? eligible.reduce(function (sum,p) { return sum + p.value * (weighted ? p.weight : 1); },0)/denominator : null;
    var compared = records.filter(function (r) { return finite(r.gap) && (plan.entity !== 'region' || r.weight > 0); });
    var below = compared.filter(function (r) { return r.gap < 0; }), severe = compared.filter(function (r) { return r.gap < -10; });
    var stats = [{label:'Matching records',value:String(records.length)},{label:'Comparable values',value:String(valid.length)},{label:'Missing values',value:String(points.length-valid.length)}];
    if (metric === 'active' || metric === 'count') stats.push({label:'Total',value:String(round(valid.reduce(function (sum,p) { return sum+p.value; },0)))});
    else stats.push({label:weighted ? 'Active-listing-weighted mean' : 'Arithmetic mean',value:finite(mean) ? (unit === '$' ? '$' : '')+round(mean)+(unit === '$' ? '' : ' '+unit) : 'Unavailable'});
    if (compared.length) stats.push({label:'Occupancy below benchmark',value:below.length+' / '+compared.length+' ('+round(below.length/compared.length*100)+'%)'});
    var suggestions = [];
    if (severe.length) suggestions.push('Prioritize review of '+severe.slice().sort(function(a,b){return a.gap-b.gap;}).slice(0,3).map(function(r){return r.name+' ('+round(r.gap)+' pp)';}).join(', ')+'. Check availability, upcoming bookings and pricing before making a change.');
    else if (below.length) suggestions.push('Monitor the '+below.length+' below-benchmark record(s), starting with the largest shortfalls. Review booking pace and availability before changing prices.');
    else if (compared.length) suggestions.push('All '+compared.length+' comparable records meet their benchmark. Continue monitoring; this snapshot alone does not justify a price increase.');
    if (valid.length < points.length || !valid.length) suggestions.push('Resolve unavailable source values before drawing conclusions; missing values were not converted to zero.');
    if (/revpar/i.test(metric)) suggestions.push('Review RevPAR together with occupancy and rate data. The snapshot does not establish whether rate, demand or availability caused a change.');
    if (!suggestions.length) suggestions.push('Validate the source values and review comparable periods before changing operating or pricing decisions.');
    var period = plan.metric === 'change' || plan.metric === 'revparChange' ? 'Next 30D versus Past 30D' : PERIODS[plan.period].label;
    var charts = [{title:period+' comparison',unit:unit,points:chartPoints}];
    if (compared.length && (metric === 'occupancy' || metric === 'gap')) {
      var bands = [{label:'At or above benchmark',count:compared.length-below.length},{label:'Below by up to 10 pp',count:below.length-severe.length},{label:'Below by more than 10 pp',count:severe.length}];
      charts.push({title:'Benchmark distribution ('+compared.length+' comparable records)',unit:'%',points:bands.map(function (band) { return {label:band.label+' - '+band.count+' records',value:band.count/compared.length*100}; })});
    }
    if ((combined || metric === 'occupancy') && plan.entity === 'listing' && !plan.threshold && !plan.benchmarkFilter && !plan.changeSign && plan.period !== '15') {
      var revenue = execute(Object.assign({},plan,{metric:'revpar',operation:'list'}),working);
      if (revenue.reportRecords) charts.push({title:period+' RevPAR (same scope)',unit:'$',points:revenue.reportRecords.slice(0,12).map(function (r) { return {label:r.name,value:finite(r.value)?r.value:null}; })});
    }
    return reply('Detailed '+(metric === 'count' ? 'count' : metric)+' report. '+pageNote, [], {kind:'report',source:result.source,plan:plan,report:{
      title:period+' '+(plan.entity === 'region' ? 'regional' : plan.entity)+' '+metric,summary:result.text,unit:unit,points:chartPoints,charts:charts,table:allPoints,stats:stats,
      method:result.calculation+' '+result.method+' '+(finite(mean) ? (weighted ? 'Weighted value sum / eligible active-listing count: ' : 'Value sum / comparable record count: ')+round(mean*denominator)+' / '+denominator+' = '+round(mean)+'. ' : '')+' '+(weighted ? 'Regional means exclude zero or missing active-listing weights.' : 'Means exclude unavailable values; valid zero values remain.'),
      recommendations:plan.entity === 'listing' ? (working.listings || []).filter(function(l){return records.some(function(r){return r.href === '#/listing/'+encodeURIComponent(l.id);});}).map(function(l){return propertyRecommendations(l,working);}).sort(function(a,b){return b.priority-a.priority || (a.gap == null ? 0 : a.gap)-(b.gap == null ? 0 : b.gap) || a.name.localeCompare(b.name);}).slice(0,5) : [],suggestions:suggestions,limitations:['Charts show '+chartPoints.length+' of '+points.length+' matched values; statistics use the full matching set.', 'Rolling period snapshots are not a historical time series. Business causes and forecasts require additional evidence.'],updated:data.updated || 'Unknown'
    }});
  }

  function answer(question,data,context) {
    // Keep definitions independent of data availability, including common metric typos.
    var quick=String(question).replace(/[a-zA-Z]+/g,function(w){return COMMON_TYPOS[w.toLowerCase()]||w;});
    var explained=definition(quick);if(explained){if(quick!==question)explained.correction='Interpreted your question as: '+quick;return explained;}
    var corrected=correctQuestion(question,data,context);
    var result=recommendationAnswer(corrected.text,data,context)||reportAnswer(corrected.text,data,context)||calculationExplanation(corrected.text,data,context)||analyticalAnswer(corrected.text,data,context)||knowledgeAnswer(corrected.text,data,context)||whAnswer(corrected.text,data,context);
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
        if (!explained && !(context && (context.lastPlan || context.lastKnowledge || context.pending))) {
          var local = knowledgeAnswer(question, {loaded:false}, {});
          if (local && local.kind === 'help') explained = local;
        }
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
  var api = { propertyRecommendations: propertyRecommendations, retrieveKnowledge: retrieveKnowledge, knowledgeAnswer: knowledgeAnswer, readSnapshotFacts: readSnapshotFacts, correctQuestion: correctQuestion, definition: definition, answer: answer, parse: parse, execute: execute, statusFor: statusFor, createResponder: createResponder, safeAliases: safeAliases, vocabulary: WORDS, examples: EXAMPLES, catalog: catalog, clean: clean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PortfolioQuery = api;
})(typeof window !== 'undefined' ? window : this);
