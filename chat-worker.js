/* Same-origin computation only; no spreadsheet data is sent to another service. */
importScripts('chat-engine.js?v=20261010-source-explanations');
self.onmessage = function (event) {
  try {
    var request = event.data;
    self.postMessage({ reply: self.PortfolioQuery.answer(request.question, request.data, request.context) });
  } catch (error) {
    self.postMessage({ error: true });
  }
};
