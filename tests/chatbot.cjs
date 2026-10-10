const assert = require('node:assert/strict');
const engine = require('../chatbot.js');
const { answer, parse, createResponder, safeAliases } = engine;
const data = {
  loaded: true, updated: 'Synthetic snapshot', reportDate: 'Synthetic period',
  ov: { snapshot: { 'PAST 30D OCCUPANCY': '0%', 'NEXT 30D OCCUPANCY': '50%', 'ACTIVE LISTINGS': 3 } },
  wl: [
    { region: 'Toronto', act: 2, past: 20, n14: 50, b14: 50, next: 30, b30: 40, s14: 'Green', s30: 'Yellow' },
    { region: 'Montreal', act: 1, past: 60, n14: 0, b14: 60, next: 90, b30: 80, s14: 'Red', s30: 'Green' },
    { region: 'Inactive', act: 0, past: null, n14: null, b14: 50, next: 0, b30: 50, s30: '' }
  ],
  listings: [
    { id: 'a/b', name: 'Lake House', city: 'Toronto', group: 'Team A', type: 'entire', status: 'Needs Attention', occ: 0, occ15: 60, occN: 20, mk15: 50, mkN: 40, rev: 100, revN: 50, chg: -50 },
    { id: '2', name: 'City Loft', city: 'Toronto', group: 'Team A', type: 'room', status: 'Stable', occ: 40, occ15: 40, occN: 60, mk15: 50, mkN: 40, rev: 100, revN: 150, chg: 50 },
    { id: '3', name: '7 River Road', city: 'Montreal', group: 'Team B', type: 'entire', status: 'Improving', occ: 60, occ15: null, occN: 90, mk15: 60, mkN: 80, rev: 0, revN: 0, chg: null },
    { id: '4', name: '<img src=x onerror=alert(1)>', city: 'Montreal', group: 'Team B', type: 'room', status: 'Stable', occ: 10, occ15: null, occN: null, mk15: null, mkN: null, rev: null, revN: null, chg: null, blocked: true, blockedN: true }
  ]
};
const original = JSON.stringify(data);
let count = 0;
function ask(q, context, snapshot = data) { count++; return answer(q, snapshot, context); }
function good(q, context) { const r = ask(q, context); assert.equal(r.kind, 'answer', q + ': ' + r.text); return r; }
function unclear(q, context) { const r = ask(q, context); assert.equal(r.kind, 'clarify', q + ': ' + r.text); return r; }
function median(values) { const v = [...values].sort((a,b) => a-b), i = Math.floor(v.length/2); return v.length%2 ? v[i] : (v[i-1]+v[i])/2; }
const metrics = ['occupancy', 'occupancy rate', 'booking rate', 'booking rates', 'booked percentage', 'percent booked', 'percentage booked', 'bookings', 'occ', 'utilization', 'utilisation'];
const periods = [['next 30 days','occN'], ['next 15 days','occ15'], ['past 30 days','occ']];
const scopes = ['', ' in Toronto', ' in Montreal'];
const operations = ['average', 'mean', 'avg', 'median'];
const templates = [(op,m,p,s)=>`${op} ${m} for listings ${p}${s}`, (op,m,p,s)=>`Please show me the ${op} ${m} of properties ${p}${s}`, (op,m,p,s)=>`${op} ${m}${s} for rentals ${p}`];
for (const metric of metrics) for (const [period,key] of periods) for (const scope of scopes) for (const op of operations) for (const template of templates) {
  const q = template(op,metric,period,scope);
  const rows = data.listings.filter(l=>!scope || l.city===scope.slice(4));
  const values = rows.map(l=>l[key]).filter(v=>typeof v==='number');
  const expected = values.length ? Math.round((op==='median' ? median(values) : values.reduce((a,b)=>a+b,0)/values.length)*10)/10+'%' : null;
  const r = good(q);
  assert.equal(r.plan.entity,'listing',q);
  assert.equal(r.plan.metric,'occupancy',q);
  if (expected) assert.ok(r.text.includes(': '+expected+'.'),q+' => '+r.text);
  else assert.match(r.text,/No comparable numeric/);
}
for (const metric of ['RevPAR','revenue per available room','revenue per available rental','revenue per available night','revenue per available property']) {
  for (const op of ['average','mean','median']) for (const scope of scopes) for (const [period,key] of [['next 30 days','revN'],['past 30 days','rev']]) {
    const q=`${op} ${metric} for listings ${period}${scope}`, r=good(q);
    const values=data.listings.filter(l=>(!scope || l.city===scope.slice(4)) && !(key==='rev' ? l.blocked:l.blockedN)).map(l=>l[key]).filter(v=>typeof v==='number');
    const expected=Math.round((op==='median'?median(values):values.reduce((a,b)=>a+b,0)/values.length)*10)/10;
    assert.ok(r.text.includes('$'+expected),q+' => '+r.text);
  }
}
for (const noun of ['listings','properties','rentals','homes','units']) for(const wording of ['How many','Count','Number of','Total number of']) for(const scope of scopes) {
  const r=good(`${wording} ${noun}${scope}`);
  assert.match(r.text,new RegExp('^'+(scope?2:4)+' matching tracked listings'));
}
for (const metric of metrics) for (const rank of ['Top','Highest','Best','Bottom','Lowest','Worst']) {
  const r=good(`${rank} 2 listings by ${metric} next 30 days`);
  assert.equal(r.rows.length,2);
  assert.equal(r.rows[0].label,['Bottom','Lowest','Worst'].includes(rank)?'Lake House':'7 River Road');
}
for(const [op,expected] of [['below',1],['under',1],['less than',1],['at most',2],['at least',2],['above',1],['over',1],['exactly',1]]) {
  const r=good(`How many listings have occupancy ${op} 60%?`);
  assert.match(r.text,new RegExp('^'+expected+' matching'));
}
assert.match(good('How many listings have occupancy <= 60%?').text,/^2 matching/);
assert.match(good('How many listings have occupancy above 59.5%?').text,/^2 matching/);
assert.match(good('Average occupancy for regions').text,/: 50%\./); // (30*2 + 90*1)/3
assert.match(good('Median occupancy for regions').text,/: 30%\./); // unweighted, includes valid zero
assert.equal(good('Which regions are below benchmark?').rows[0].label,'Toronto');
assert.equal(good('Regions below target next 15 days').rows[0].label,'Montreal');
assert.equal(good('Properties underperforming').rows[0].label,'Lake House');
assert.equal(good('Biggest RevPAR drops').rows[0].href,'#/listing/a%2Fb');
assert.equal(good('Largest RevPAR gains').rows[0].label,'City Loft');
assert.equal(good('Top listings by occupancy change').rows[0].value,'30 pp');
assert.match(good('How many active listings?').text,/Active listings: 3/);
assert.match(good('How many listings in Team A?').text,/^2 matching/);
assert.equal(good('Top teams by occupancy').rows[0].label,'Team B');
assert.match(good('Median occupancy for entire units').text,/: 55%/);
assert.match(good('Average occupancy for private rooms').text,/: 60%/);
assert.match(good('Count flagged properties').text,/^1 matching/);
assert.match(good('How many stable listings?').text,/^2 matching/);
assert.match(good('How many improving rentals?').text,/^1 matching/);
assert.match(good('How many fully blocked listings past 30 days?').text,/^1 matching/);
assert.match(good('Count yellow regions').text,/^1 matching/);
unclear('How many bookings in Toronto?');
unclear('How many booked properties?');
assert.equal(good('Largest benchmark shortfalls for listings').rows[0].label,'Lake House');
assert.match(good('7 River Road occupancy').rows[0].value,/90%/);
assert.match(good('Lake House past 30 days occupancy').rows[0].value,/^0%/);
assert.match(good('Lake House previous 30 days occupancy').rows[0].value,/^0%/);
assert.match(good('Lake House upcoming 15 days occupancy').rows[0].value,/^60%/);
let r=good('Compare Toronto and Montréal next 15 days');
assert.equal(r.rows.length,2); assert.match(r.rows.find(x=>x.label==='Montreal').value,/^0%/);
r=good('Compare RevPAR in Toronto and Montreal');
assert.equal(r.rows.length,2);assert.match(r.rows.find(x=>x.label==='Toronto').value,/^\$100/);
assert.match(r.rows.find(x=>x.label==='Montreal').value,/^\$0/);
const more={...data,wl:[...data.wl,{region:'York',act:1,next:10,b30:20},{region:'New York',act:1,next:90,b30:80}]};
r=ask('New York occupancy',null,more);assert.equal(r.rows.length,1);assert.equal(r.rows[0].label,'New York');
// Follow-ups retain calculations while replacing the requested scope or horizon.
r=good('Average occupancy for listings in Toronto');
r=good('What about Montreal?',{lastPlan:r.plan});assert.match(r.text,/: 90%/);
r=good('And past 30 days?',{lastPlan:r.plan});assert.match(r.text,/: 35%/);
r=good('And the whole portfolio?',{lastPlan:r.plan});assert.match(r.text,/: 27.5%/);
r=unclear('Average RevPAR in Toronto next month');
assert.equal(r.pending.metric,'revpar');
r=good('Next 30 days',{pending:r.pending});assert.match(r.text,/: \$100/);
r=unclear('How many listings are below 50?');
r=good('Occupancy',{pending:r.pending});assert.match(r.text,/^1 matching/);
// Explicit memory proposals do not alter data or aliases until confirmation.
const aliases=safeAliases({});
r=ask('Remember "GTA" means Toronto and Montreal',{aliases});
assert.equal(r.kind,'confirm');assert.equal(Object.keys(aliases).length,0);
aliases[r.memory.key]=r.memory.targets;
r=good('How many properties in GTA?',{aliases});assert.match(r.text,/^4 matching/);
const reloaded=safeAliases(JSON.parse(JSON.stringify(aliases)));
assert.equal(good('Average RevPAR for listings in GTA',{aliases:reloaded}).plan.scopes.length,2);
assert.equal(ask('Show aliases',{aliases}).rows.length,1);
assert.equal(ask('Forget GTA',{aliases}).memory.remove,'gta');
for(const q of ['Remember occupancy means Toronto','Remember next month means Montreal','Remember constructor means Toronto','Remember Toronto means Montreal','Remember x means Toronto','Remember GTA means Atlantis','Remember GTA means Toronto and Team A']) unclear(q);
assert.equal(Object.keys(safeAliases(JSON.parse('{"__proto__":[{"kind":"place","name":"Toronto"}]}'))).length,0);
assert.equal(Object.keys(safeAliases({broken:[{kind:'script',name:'bad'}]})).length,0);
unclear('Average occupancy in GTA',{aliases:{gta:[{kind:'place',name:'Atlantis'}]}});
// Unsupported qualifiers must not become silently broadened numeric answers.
for(const q of ['How many listings in Atlantis?','Compare Toronto and Atlantis','How many listings in Toronto and Atlantis?','What will revenue be next year?','How many listings earn over 100?','Count listings not in Toronto','Listings excluding Team A','Occupancy between 20 and 80 percent','Average occupancy and RevPAR','Toronto next 60d occupancy','Toronto past 15 days occupancy','Average RevPAR next 15 days','Total RevPAR','Sum occupancy','Occupancy below $50','RevPAR above 50%','Compare Toronto','Compare Team A and Toronto','Active listings in Team A','Red regions past 30 days','Blocked listings next 15 days','What about Montreal?']) unclear(q);
assert.equal(ask('How many listings?',null,{loaded:false,loading:true}).kind,'unavailable');
assert.equal(ask('How many listings?',null,{loaded:false}).kind,'unavailable');
assert.equal(ask('How many active listings?',null,{loaded:true,wl:[],listings:[]}).kind,'unavailable');
assert.match(ask('Average occupancy for listings',null,{loaded:true,listings:[{name:'Missing',occN:null}]}).text,/No comparable/);
assert.equal(good('Portfolio summary').rows[0].value,'0%');
assert.match(good('When was this updated?').text,/Synthetic snapshot/);
const dup={...data,listings:[...data.listings,{...data.listings[0],id:'duplicate'}]};
assert.equal(ask('Lake House occupancy',null,dup).kind,'clarify');
assert.equal(JSON.stringify(data),original,'Never mutate the dashboard snapshot');

// WH intents and conservative typo handling.
for(const q of ['WHAT IS REVPAR?','what is revpar?','Waht is revapr?','Can you explian ocupancy?']) assert.equal(ask(q).kind,'help',q);
assert.match(ask('When was the data last updated?').text,/Synthetic snapshot/);
assert.match(ask('Whne was the data updated?').text,/Synthetic snapshot/);
assert.match(ask('When will occupancy improve?').text,/does not include/);
assert.match(ask('Where is Lake House located?').rows[0].value,/Toronto/);
assert.equal(ask('Where is Unknown House located?').kind,'clarify');
assert.equal(good('Where is occupancy below benchmark?').plan.entity,'region');
assert.match(good('Why is occupancy in Toronto low?').text,/does not establish the cause/);
assert.match(good('Why is Lake House RevPAR dropping?').text,/does not establish the cause/);
assert.equal(ask('Why is Atlantis occupancy low?').kind,'clarify');
assert.equal(good('What is average RevPAR in Toronto?').plan.operation,'average');
assert.equal(good('What is average RevPAR?').plan.metric,'revpar');
for(const q of ['Whch regoins are below benchmark?','Where is occupnacy below benchmark?','Average occupany in Toronto','Highest revapr listings'])assert.ok(good(q).correction,q);
assert.equal(good('Average occupancy in Toronto below 40%').plan.threshold.value,40);
assert.deepEqual(engine.correctQuestion('Remember ocupancy means Toronto',data,{}).changes,[]);
assert.equal(engine.correctQuestion('Average occupancy in Occpancy',{listings:[{name:'Occpancy'}]},{}).text,'Average occupancy in Occpancy');
const misspelled=ask('Average occupancy in Tornto');assert.equal(misspelled.kind,'clarify');assert.ok(misspelled.choices.includes('Average occupancy in Toronto'));
assert.equal(ask('What is occupancy?',null,{loaded:false}).kind,'help');
assert.equal(ask('Why is occupancy in Toronto low?',null,{loaded:false}).kind,'unavailable');
assert.equal(JSON.stringify(data),original);

for(const q of ['how does active listings calculated?','How are active listings calculated?','Explain the active listing count','What are active listings?','How is the active listings total computed?','How are actve listings caluclated?']){
 const r=ask(q);assert.equal(r.kind,'explanation',q);assert.match(r.text,/unique listing IDs/);assert.match(r.text,/cannot independently audit/);assert.equal(r.rows[1].value,'3');
}
const activeRegional=ask('How are active listings calculated in Toronto?');assert.equal(activeRegional.rows.length,1);assert.equal(activeRegional.rows[0].value,'2 active listings');
const changed=structuredClone(data);changed.wl[0].act=9;changed.ov.snapshot['ACTIVE LISTINGS']=15;
const refreshed=ask('How are active listings calculated?',null,changed);assert.equal(refreshed.rows[0].value,'15');assert.equal(refreshed.rows[1].value,'10');
assert.equal(ask('How are active listings calculated?',null,{loaded:false}).rows.length,0);
assert.equal(ask('How are active listings calculated in Atlantis?').kind,'clarify');
assert.equal(good('How many active listings?').rows.length,0);
const missing=engine.readSnapshotFacts({loaded:true,wl:[{region:'A',act:null},{region:'B',act:0}]});assert.equal(missing.regionalTotal,0);assert.equal(missing.missingRegions,1);
// A controllable clock verifies the 3-second lifecycle (within the 5-second maximum) without sleeping.
function fakeClock() {
  let now=0,sequence=0;const jobs=new Map();
  return {now:()=>now,setTimeout(fn,ms){jobs.set(++sequence,{at:now+ms,fn});return sequence;},clearTimeout(id){jobs.delete(id);},
    advance(ms){const until=now+ms;while(true){const next=[...jobs.entries()].filter(([,j])=>j.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;jobs.delete(next[0]);next[1].fn();}now=until;},jobs};
}

let clock=fakeClock(),done=[],reads=0,current=data;
let responder=createResponder({clock,getData(){reads++;return current;},onStatus(){},onComplete:(r,d)=>done.push({r,d})});
responder.start('Can you explain to me what is RevPar?',{});
assert.equal(responder.start('Portfolio summary',{}),false);
clock.advance(0);
assert.match(done[0].r.text,/Revenue per Available Room/);assert.match(done[0].r.text,/\$150/);
assert.equal(reads,0,'Definitions bypass the spreadsheet entirely');assert.equal(responder.isBusy(),false);
for(const q of ['What does RevPAR mean?','Explain RevPAR in simple terms','How is RevPAR calculated?','Define occupancy','What is ADR?','What is a benchmark?']) assert.equal(engine.definition(q).kind,'help',q);
assert.equal(engine.definition('What is RevPAR in Toronto?'),null);
assert.equal(engine.definition('What is average RevPAR next 30 days?'),null);
responder.start('How many listings?',{});current={...data,listings:[]};clock.advance(0);
assert.match(done[1].r.text,/^0 matching/);assert.equal(done[1].d,current);
responder.start('Average occupancy',{});responder.cancel();clock.advance(5000);assert.equal(done.length,2);
responder=createResponder({clock,getData(){throw Error('unavailable');},onStatus(){},onComplete:r=>done.push(r)});
responder.start('How many listings?',{});clock.advance(0);assert.equal(done.at(-1).kind,'unavailable');
// Worker completion, failure, deadline, cancellation, and stale callbacks.
let fakeWorker, terminated=0;
function makeWorker(){return fakeWorker={postMessage(request){this.request=request;},terminate(){terminated++;}};}
done=[];responder=createResponder({clock,createWorker:makeWorker,getData:()=>data,onStatus(){},onComplete:r=>done.push(r)});
responder.start('How many listings?',{});clock.advance(0);let oldWorker=fakeWorker;
fakeWorker.onmessage({data:{reply:answer(fakeWorker.request.question,fakeWorker.request.data,{})}});
assert.equal(done.length,1);assert.equal(terminated,1);assert.equal(clock.jobs.size,0);
responder.start('Average occupancy',{});clock.advance(0);oldWorker.onmessage({data:{reply:{text:'stale'}}});assert.equal(done.length,1);
clock.advance(4999);assert.equal(done.length,1);clock.advance(1);assert.match(done[1].text,/too long/);assert.equal(responder.isBusy(),false);
responder.start('Average occupancy',{});clock.advance(0);fakeWorker.onerror({preventDefault(){}});clock.advance(0);assert.equal(done[2].kind,'answer','Worker loading failure falls back to the loaded snapshot');
responder.start('Average occupancy',{});clock.advance(0);responder.cancel();clock.advance(6000);assert.equal(done.length,3);assert.equal(clock.jobs.size,0);
// Construction/security failures and worker-side errors must also recover.
responder=createResponder({clock,createWorker(){throw Error('Worker blocked');},getData:()=>data,onStatus(){},onComplete:r=>done.push(r)});
responder.start('How many listings?',{});clock.advance(0);assert.equal(done.at(-1).kind,'answer');
responder=createResponder({clock,createWorker:makeWorker,getData:()=>data,onStatus(){},onComplete:r=>done.push(r)});
responder.start('How many listings?',{});clock.advance(0);fakeWorker.onmessage({data:{error:true}});clock.advance(0);assert.equal(done.at(-1).kind,'answer');
// The exact reported question must not inspect large or unavailable listing data.
const guarded={loaded:false,get listings(){throw Error('Definition scanned listings');},get wl(){throw Error('Definition scanned worklist');}};
assert.match(answer('Can you explain to me what is RevPar?',guarded,{}).text,/Revenue per Available Room/);
// Model the browser's receiver-sensitive timer API, which a fake clock misses.
const vm=require('node:vm');const browserTimers=vm.createContext({});
vm.runInContext('var pending=[]; function setTimeout(fn){if(this!==globalThis)throw Error("Illegal invocation");pending.push(fn);return pending.length;} function clearTimeout(){if(this!==globalThis)throw Error("Illegal invocation");}',browserTimers);
vm.runInContext(require('node:fs').readFileSync(require.resolve('../chat-engine.js'),'utf8'),browserTimers);
vm.runInContext('var result; var responder=PortfolioQuery.createResponder({getData:function(){throw Error("Should not read data")},onStatus:function(){},onComplete:function(r){result=r;}});responder.start("Can you explain to me what is RevPar?",{});pending.shift()();',browserTimers);
assert.match(browserTimers.result.text,/Revenue per Available Room/);
console.log('PASS: '+count+' query cases plus instant definitions, worker completion, timeout, cancellation and errors.');
module.exports={data};
