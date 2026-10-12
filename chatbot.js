/* Chat presentation and explicit, browser-local alias memory. */
(function (root) {
  'use strict';
  var engine = typeof module !== 'undefined' && module.exports ? require('./chat-engine.js') : root.PortfolioQuery;
  function init(getData) {
    var panel = document.getElementById('portfolio-chat'), launch = document.getElementById('chat-launch');
    var log = document.getElementById('chat-log'), input = document.getElementById('chat-input');
    var form = document.getElementById('chat-form');
    var progress = document.getElementById('chat-progress'), status = document.getElementById('chat-status');
    var cancel = document.getElementById('chat-cancel'), memoryKey = 'pd-chat-aliases-v1';
    var context = { aliases: Object.create(null), lastPlan: null, pending: null }, storageAvailable = true;
    try { context.aliases = engine.safeAliases(JSON.parse(localStorage.getItem(memoryKey) || '{}')); } catch (e) { storageAvailable = false; }
    var thinkingAt = 0, replyTimer = null, greeted = false;
    function isBusy() { return responder.isBusy() || replyTimer !== null; }
    function present(reply, data) {
      // Keep the thinking state visible for at least 2.5 seconds, including computation time.
      var delay = Math.max(0, 2500 - (Date.now() - thinkingAt));
      if (!delay) { render(reply, data); return; }
      replyTimer = root.setTimeout(function () { replyTimer = null; render(reply, data); }, delay);
    }
    function save() {
      try { localStorage.setItem(memoryKey, JSON.stringify(context.aliases)); storageAvailable = true; }
      catch (e) { storageAvailable = false; }
    }
    function open(show) { panel.hidden = !show; launch.setAttribute('aria-expanded', String(show)); if (show) { if (!greeted) welcome(); input.focus(); } else launch.focus(); }
    function scroll() { log.scrollTop = log.scrollHeight; }
    function message(text, user) {
      var row = document.createElement('div'); row.className = 'chat-row' + (user ? ' chat-row-user' : '');
      var avatar = document.createElement('span'); avatar.className = 'chat-avatar'; avatar.setAttribute('aria-hidden', 'true');
      var icon = document.createElement('i'); icon.className = user ? 'fa-solid fa-user' : 'fa-solid fa-robot'; avatar.appendChild(icon); row.appendChild(avatar);
      var item = document.createElement('div'); item.className = 'chat-message' + (user ? ' chat-user' : '');
      var label = document.createElement('strong'); label.textContent = user ? 'You' : 'Portfolio Desk'; item.appendChild(label);
      var p = document.createElement('p'); p.textContent = text; item.appendChild(p); row.appendChild(item); log.appendChild(row);
      while (log.children.length > 40) log.removeChild(log.firstChild);
      scroll(); return item;
    }
    function busy(on) {
      progress.hidden = !on; input.readOnly = on;
      if (on) thinkingAt = Date.now();
      form.querySelector('button[type="submit"]').disabled = on;
      Array.prototype.forEach.call(log.querySelectorAll('button'), function (b) { b.disabled = on || b.dataset.decided === 'true'; });
      document.getElementById('chat-memory').disabled = on;
    }
    function action(item, label, callback) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chat-choice'; b.textContent = label;
      b.addEventListener('click', callback); item.appendChild(b); return b;
    }
    function render(reply, data) {
      busy(false);
      if (reply.plan) { context.lastPlan = reply.plan; context.lastKnowledge = null; context.lastRecommendations = null; context.pending = null; }
      else if (reply.kind === 'clarify') context.pending = reply.pending || null;
      else if (reply.knowledge && reply.knowledge.length) { context.lastKnowledge = reply.knowledge[0]; context.pending = null; }
      if (reply.recommendationIds) { context.lastRecommendations = reply.recommendationIds; context.lastPlan = null; context.lastKnowledge = null; context.pending = null; }
      var item = message(reply.text, false);
      if (reply.recommendations && root.PortfolioChatReport) { root.PortfolioChatReport.renderRecommendations(item, reply.recommendations); panel.classList.add('chat-report-mode'); }
      if (reply.report && root.PortfolioChatReport) { root.PortfolioChatReport.render(item, reply.report, reply.source); panel.classList.add('chat-report-mode'); }
      if (reply.correction) { var correction = document.createElement('small'); correction.textContent = reply.correction; item.appendChild(correction); }
      if (reply.interpretation) {
        var interpreted = document.createElement('small'); interpreted.className = 'chat-interpretation'; interpreted.textContent = 'Understood as: ' + reply.interpretation; item.appendChild(interpreted);
      }
      if (reply.rows.length) {
        var list = document.createElement('ul');
        reply.rows.forEach(function (row) {
          var li = document.createElement('li'), title = document.createElement(row.href ? 'a' : 'b');
          title.textContent = row.label; if (row.href) title.setAttribute('href', row.href);
          li.appendChild(title); var value = document.createElement('span'); value.textContent = row.value; li.appendChild(value); list.appendChild(li);
        }); item.appendChild(list);
      }
      (reply.choices || []).slice(0, 11).forEach(function (choice) { action(item, choice, function () { ask(choice); }); });
      if (reply.kind === 'confirm' && reply.memory) {
        var decision = reply.memory, decided = false;
        function disableActions() { Array.prototype.forEach.call(item.querySelectorAll('button'), function (b) { b.disabled = true; b.dataset.decided = 'true'; }); }
        action(item, 'Confirm', function () {
          if (decided || isBusy()) return;
          decided = true; disableActions();
          if (decision.remove) {
            delete context.aliases[decision.remove]; save();
            message('Forgot "' + decision.remove + '".' + (!storageAvailable ? ' Browser storage is unavailable; this change lasts for this tab only.' : ''), false);
          } else {
            // Revalidate confirmed targets against the current snapshot before persisting.
            var current = engine.catalog(getData());
            if (!decision.targets.every(function (t) { return current.some(function (c) { return c.kind === t.kind && engine.clean(c.name) === engine.clean(t.name); }); })) { message('The data changed and one of those names is no longer available. Please teach the alias again.', false); return; }
            context.aliases[decision.key] = decision.targets; save();
            message('Remembered "' + decision.key + '" as ' + decision.targets.map(function (t) { return t.name; }).join(', ') + '.' + (!storageAvailable ? ' Browser storage is unavailable; I can remember it only for this tab.' : ' Saved on this browser. Use “Forget ' + decision.key + '” to remove it.'), false);
          }
          if (!panel.hidden) input.focus();
        });
        action(item, 'Cancel', function () { if (decided || isBusy()) return; decided = true; disableActions(); message('No remembered names were changed.', false); });
      }
      if (reply.reference) {
        var reference = document.createElement('a'); reference.href = reply.reference; reference.textContent = 'PriceLabs metric definitions'; reference.target = '_blank'; reference.rel = 'noopener noreferrer'; item.appendChild(reference);
      }
      if (reply.source) {
        var source = document.createElement('small'); source.textContent = 'Source: ' + reply.source + (data.loaded && reply.kind !== 'help' ? ' | Updated: ' + (data.updated || 'Unknown') : '') + (data.reportDate ? ' | Report: ' + data.reportDate : '') + (data.loading ? ' | Refresh in progress; using last loaded values' : '') + (data.notice ? ' | ' + data.notice : ''); item.appendChild(source);
      }
      item.classList.add('chat-answer-enter');
      Array.prototype.forEach.call(item.children, function (child, i) { child.style.setProperty('--chat-reveal-delay', Math.min(i * 45, 180) + 'ms'); });
      if ((reply.report || reply.recommendations) && item.parentNode) {
        log.scrollTop += item.parentNode.getBoundingClientRect().top - log.getBoundingClientRect().top - 12;
      } else scroll();
      if (!panel.hidden && (document.activeElement === input || panel.contains(document.activeElement))) input.focus();
    }
    var responder = engine.createResponder({ createWorker: typeof Worker === 'function' ? function () { return new Worker('chat-worker.js?v=20261012-property-advice'); } : null, getData: getData, onStatus: function (text) { status.textContent = text; }, onComplete: present });
    function ask(question) {
      question = String(question).trim().slice(0, 300); if (!question || isBusy()) return;
      message(question, true); input.value = '';
      if (/^(?:(?:i want|i need|i would like) to |please )?(?:file |submit |send )?(?:a )?report (?:a |an )?(?:data issue|data inaccuracy|data error|inaccurate data|incorrect data|problem|issue)[.!?]*$/i.test(question)) {
        var reportButton = document.getElementById('chat-report');
        if (reportButton && window.PortfolioReports) { message('Use this form to describe the issue and attach a screenshot. Enter your name and email for replies. No sign-in is needed.', false); reportButton.click(); return; }
      }
      busy(true);
      responder.start(question, { aliases: engine.safeAliases(context.aliases), lastPlan: context.lastPlan, pending: context.pending, lastKnowledge: context.lastKnowledge, lastRecommendations: context.lastRecommendations });
    }
    function stop(announce) { if (!isBusy()) return; responder.cancel(); if (replyTimer !== null) { root.clearTimeout(replyTimer); replyTimer = null; } busy(false); if (announce) message('Request cancelled. You can ask a different question.', false); }
    launch.addEventListener('click', function () { open(panel.hidden); });
    document.getElementById('chat-close').addEventListener('click', function () { open(false); });
    panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); open(false); } });
    form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
    cancel.addEventListener('click', function () { stop(true); input.focus(); });
    document.getElementById('chat-memory').addEventListener('click', function () { ask('Show aliases'); });
    document.getElementById('chat-clear').addEventListener('click', function () { stop(false); context.lastPlan = null; context.pending = null; context.lastKnowledge = null; context.lastRecommendations = null; log.textContent = ''; welcome(); input.focus(); });
    log.addEventListener('click', function (e) { if (e.target.closest('a')) open(false); });
    window.addEventListener('pagehide', function () { stop(false); });
    function welcome() {
      greeted = true;
      busy(true);
      status.textContent = 'Preparing your welcome';
      present({text:'Hi! how can I help you?', rows:[], kind:'help'}, {});
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = engine;
  else root.PortfolioChat = { init: init };
})(typeof window !== 'undefined' ? window : this);
