/* Safe DOM report rendering. No chart library, remote requests or generated HTML inputs. */
(function (root) {
  'use strict';
  var EXPORT_CSS = 'body{font:15px/1.6 system-ui,sans-serif;color:#193b30;margin:32px;max-width:1100px}h3,h4{line-height:1.3}.chat-report-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px}.chat-report-stats div{border-bottom:1px solid #cbd8d1;padding:10px}dt{font-size:12px}dd{margin:0;font-size:19px;font-weight:700}.chat-report-chart{margin:20px 0}.chat-chart-row{margin:12px 0}.chat-chart-label{display:flex;justify-content:space-between;gap:16px;font-size:13px}.chat-chart-track{position:relative;height:12px;background:#edf2ef;border-radius:3px;margin-top:5px}.chat-chart-bar{position:absolute;top:0;height:100%;background:#24876a;border-radius:3px}.chat-chart-negative{background:#b84e3b}.chat-chart-zero{position:absolute;top:0;height:100%;border-left:1px solid #7b8c84}.chat-chart-marker{position:absolute;top:-3px;height:18px;border-left:2px solid #173e30}table{border-collapse:collapse;width:100%;font-size:13px}th,td{padding:8px;text-align:left;border-bottom:1px solid #cbd8d1}small{display:block;color:#53685d}.chat-report-note{color:#53685d;font-size:13px}.chat-report-tools{display:none}details{margin:16px 0}';
  function append(parent, tag, text, className) {
    var el = document.createElement(tag); if (text != null) el.textContent = text;
    if (className) el.className = className; parent.appendChild(el); return el;
  }
  function number(value, unit) { return typeof value !== 'number' || !isFinite(value) ? 'Unavailable' : (unit === '$' ? '$' : '') + (Math.round(value * 10) / 10).toLocaleString('en-US') + (unit === '%' || unit === 'pp' ? ' ' + unit : ''); }
  function renderRecommendations(parent, recommendations) {
    var section = append(parent,'section',null,'chat-recommendations');
    (recommendations || []).forEach(function (advice) {
      var article = append(section,'article',null,'chat-property-advice');
      append(article,'h3',advice.name);
      append(article,'h4','Evidence from this snapshot');
      var evidence = append(article,'ul'); advice.evidence.forEach(function(text){append(evidence,'li',text);});
      [['Do first','first'],['Improve','improve'],['Avoid','avoid'],['Keep','keep']].forEach(function (group) {
        append(article,'h4',group[0]); var list = append(article,'ul'); advice[group[1]].forEach(function(text){append(list,'li',text);});
      });
      append(article,'h4','When to reassess'); append(article,'p',advice.review);
    });
    return section;
  }
  function render(parent, report, source) {
    var section = append(parent, 'section', null, 'chat-report');
    append(section, 'h3', report.title);
    append(section, 'p', report.summary);
    var stats = append(section, 'dl', null, 'chat-report-stats');
    (report.stats || []).forEach(function (stat) { var cell = append(stats,'div'); append(cell,'dt',stat.label); append(cell,'dd',stat.value); });
    (report.charts || [{title:'Comparison chart',unit:report.unit,points:report.points}]).forEach(function (spec) {
    var points = spec.points || [], values = [];
    points.forEach(function (p) { if (typeof p.value === 'number' && isFinite(p.value)) values.push(p.value); if (typeof p.benchmark === 'number' && isFinite(p.benchmark)) values.push(p.benchmark); });
    var low = Math.min.apply(null,[0].concat(values)), high = Math.max.apply(null,[spec.unit === '%' ? 100 : 1].concat(values));
    var position = function (v) { return (v-low)/(high-low)*100; };
    var chart = append(section, 'figure', null, 'chat-report-chart');
    append(chart,'figcaption',spec.title);
    append(chart,'p','Scale: '+number(low,spec.unit)+' to '+number(high,spec.unit)+'. Bars start at zero. Vertical markers show benchmarks when available.','chat-report-note');
    if (!points.length) append(chart,'p','No matching values to chart.');
    points.forEach(function (p) {
      var row = append(chart,'div',null,'chat-chart-row'), label = append(row,'div',null,'chat-chart-label');
      append(label,'span',p.label); append(label,'strong',number(p.value,spec.unit));
      if (typeof p.value !== 'number' || !isFinite(p.value)) return;
      var track = append(row,'div',null,'chat-chart-track'); track.setAttribute('aria-hidden','true');
      var zero = append(track,'span',null,'chat-chart-zero'); zero.style.left = position(0)+'%';
      var bar = append(track,'span',null,'chat-chart-bar'+(p.value < 0 ? ' chat-chart-negative' : ''));
      bar.style.left = position(Math.min(0,p.value))+'%'; bar.style.width = Math.abs(p.value)/(high-low)*100+'%';
      if (typeof p.benchmark === 'number' && isFinite(p.benchmark)) {
        var mark = append(track,'span',null,'chat-chart-marker'); mark.style.left = position(p.benchmark)+'%';
        append(row,'small','Benchmark: '+number(p.benchmark,spec.unit));
      }
    });
    });
    var details = append(section,'details'); append(details,'summary','View all underlying values ('+(report.table || report.points || []).length+')');
    var wrap = append(details,'div',null,'chat-report-table'), table = append(wrap,'table'), head = append(append(table,'thead'),'tr');
    ['Record','Value','Benchmark'].forEach(function (title) { var th = append(head,'th',title); th.setAttribute('scope','col'); });
    var body = append(table,'tbody');
    (report.table || report.points || []).forEach(function (p) { var row = append(body,'tr'); append(row,'td',p.label); append(row,'td',number(p.value,report.unit)); append(row,'td',number(p.benchmark,report.unit)); });
    append(section,'h4','How this was calculated'); append(section,'p',report.method);
    if (report.recommendations && report.recommendations.length) renderRecommendations(section, report.recommendations);
    append(section,'h4','Suggested next steps'); var suggestions = append(section,'ul'); (report.suggestions || []).forEach(function (s) { append(suggestions,'li',s); });
    append(section,'h4','Coverage and limits'); var limits = append(section,'ul'); (report.limitations || []).forEach(function (s) { append(limits,'li',s); });
    append(section,'small','Source: '+source+' | Snapshot: '+report.updated);
    var tools = append(section,'div',null,'chat-report-tools');
    var download = append(tools,'button','Download report','chat-choice'); download.type = 'button';
    download.addEventListener('click',function () {
      var copy = section.cloneNode(true); copy.querySelector('.chat-report-tools').remove();
      Array.prototype.forEach.call(copy.querySelectorAll('details'),function (el) { el.open = true; });
      var html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Portfolio Desk report</title><style>'+EXPORT_CSS+'</style></head><body>'+copy.outerHTML+'</body></html>';
      var url = URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
      var link = document.createElement('a'); link.href = url; link.download = 'portfolio-desk-report.html'; link.click();
      root.setTimeout(function () { URL.revokeObjectURL(url); },1000);
    });
    return section;
  }
  root.PortfolioChatReport = {render:render,renderRecommendations:renderRecommendations};
})(window);
