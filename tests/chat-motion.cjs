const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function harness(reduced = false) {
  let now = 0, seq = 0, callbacks, starts = 0, workerBusy = false;
  const jobs = new Map();
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.events = {}; this.dataset = {}; this.hidden = false; this.value = ''; this.style = {setProperty(){}}; this.classList = {add(){}}; }
    set textContent(value) { this.text = value; this.children = []; }
    get textContent() { return this.text || ''; }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child),1); }
    setAttribute() {}
    addEventListener(name, fn) { this.events[name] = fn; }
    focus() {}
    contains() { return false; }
    querySelector() { return submit; }
    querySelectorAll() { return this.children.flatMap(c => (c.tagName === 'button' ? [c] : []).concat(c.querySelectorAll())); }
    get firstChild() { return this.children[0]; }
  }
  const elements = {}, submit = new Element('button');
  const get = id => elements[id] ||= new Element('div');
  const window = {matchMedia:()=>({matches:reduced}),addEventListener(){},setTimeout(fn,ms){jobs.set(++seq,{fn,at:now+ms});return seq;},clearTimeout(id){jobs.delete(id);},PortfolioQuery:{safeAliases:()=>({}),createResponder(options){callbacks=options;return {isBusy:()=>workerBusy,cancel(){workerBusy=false;},start(){starts++;workerBusy=true;options.onStatus('Thinking');}};}}};
  const context = {window,document:{getElementById:get,createElement:tag=>new Element(tag)},localStorage:{getItem:()=>null},Date:{now:()=>now}};
  vm.runInNewContext(fs.readFileSync('chatbot.js','utf8'),context);
  window.PortfolioChat.init(()=>({loaded:true}));
  return {get,jobs,submit,starts:()=>starts,
    ask(){get('chat-input').value='Define occupancy';get('chat-form').events.submit({preventDefault(){}});},
    finish(){workerBusy=false;callbacks.onComplete({text:'Prepared answer',rows:[]},{});},
    advance(ms){now+=ms;for(const [id,j] of jobs)if(j.at<=now){jobs.delete(id);j.fn();}},
    answers(){return get('chat-log').children.filter(r=>r.children[1].children.some(c=>c.textContent==='Prepared answer')).length;}};
}
let h = harness(); h.ask(); h.finish();
assert.equal(h.get('chat-progress').hidden,false);
assert.equal(h.submit.disabled,true);
assert.equal(h.answers(),0);
h.ask(); assert.equal(h.starts(),1,'New requests remain blocked during the presentation delay');
h.advance(649);assert.equal(h.answers(),0);
h.advance(1);assert.equal(h.answers(),1);assert.equal(h.get('chat-progress').hidden,true);assert.equal(h.submit.disabled,false);
h=harness();h.ask();h.finish();h.get('chat-cancel').events.click();h.advance(1000);assert.equal(h.answers(),0);assert.equal(h.jobs.size,0);
h=harness();h.ask();h.finish();h.get('chat-clear').events.click();h.advance(1000);assert.equal(h.answers(),0);assert.equal(h.get('chat-log').children.length,1);
h=harness(true);h.ask();h.finish();assert.equal(h.answers(),1);assert.equal(h.jobs.size,0,'Reduced motion does not wait');
h=harness();h.ask();h.advance(900);h.finish();assert.equal(h.answers(),1);assert.equal(h.jobs.size,0,'Slow computation adds no presentation delay');
console.log('PASS: visible thinking beat, duplicate submission prevention, cancellation, clear, reduced motion and slow-query timing.');
