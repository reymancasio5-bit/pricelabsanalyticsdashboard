const assert = require('node:assert/strict');
const engine = require('../chat-engine.js');
const data = {
  loaded:true, updated:'Fixture only',
  wl:[{region:'North',act:2,next:30,past:20,n14:50,b14:50,b30:40,s14:'Green',s30:'Yellow'}, {region:'South',act:1,next:90,past:60,b30:80}, {region:'Empty',act:0,next:0,b30:50}],
  listings:[{id:'one',name:'Sample Home',city:'North',occN:20,occ:0,mkN:40,rev:100,revN:50,chg:-50}, {id:'two',name:'Other Home',city:'South',occN:60,occ:40,mkN:40,rev:100,revN:150,chg:50}],
  setup:{north:{months:[68,70,72,75,78,82,85,84,80,77,74,73]}},
  propertyTargets:{one:[0,null,52,53,54,55,56,57,58,59,60,61]},
  details:{'sample home':{id:'unique',base:'$120',recommended:'$130',pickup:'4',lastBooked:'Fixture date'}}
};
const before=JSON.stringify(data);
const ask=(q,context)=>engine.answer(q,data,context||{});
for (const term of ['coverage','percentage points','median','weighted average','monthly targets','reporting month','blocked nights','tracked listings','base price','booking pickup','last booked','open tasks','retention','rank','data source','RAG']) {
  const r=ask('Define '+term); assert.ok(['help','explanation'].includes(r.kind),term+': '+r.text); assert.ok(r.source,term);
}
for (const q of ['Where can I find occupancy?','What is the reference for monthly targets?','What is the difference between ADR and RevPAR?']) {const r=ask(q);assert.ok(r.source);assert.ok(r.rows.some(row=>row.href));}
let r=ask('How is average occupancy for regions calculated?');
assert.match(r.text,/Weighted sum 150 \/ eligible active-listing total 3 = 50/);
assert.match(r.text,/1 missing or ineligible/);
assert.match(ask('How is average occupancy for listings calculated?').text,/Sum 80 \/ comparable value count 2 = 40/);
assert.match(ask('How is median occupancy for listings calculated?').text,/\(20 \+ 60\) \/ 2 = 40/);
r=ask('Average occupancy for listings in North');
assert.match(ask('How was that calculated?',{lastPlan:r.plan}).text,/value count 1 = 20/);
assert.match(ask('Where can I find the value?',{lastPlan:r.plan}).source,/Pricelabs Report/);
assert.equal(ask('How is this calculated?').kind,'clarify');
assert.match(ask('Explain that',{lastKnowledge:'coverage'}).text,/numerator, denominator/);
r=ask('Why is North yellow?');assert.match(r.rows[1].value,/30% - 40% = -10 pp\. Rule: Yellow/);
assert.match(ask('Why is Empty red?').rows[0].value,/No active listings/);
assert.match(ask('Why is North occupancy low?').text,/does not establish the cause/);
assert.equal(ask('Why is Atlantis occupancy low?').kind,'clarify');
assert.match(ask('How is occupancy gap in North calculated?').rows[0].value,/30% - 40% = -10 pp/);
assert.equal(ask('Show North monthly targets for October').rows[0].value,'77%');
assert.equal(ask('Show Sample Home monthly targets for October').rows[0].value,'59%');
assert.equal(ask('Show Sample Home monthly targets for January').rows[0].value,'0%');
assert.equal(ask('Show Sample Home monthly targets for February').rows[0].value,'Unavailable');
assert.equal(ask('Show Other Home monthly targets for October').rows[0].value,'Unavailable');
assert.equal(ask('Show North monthly targets for October 2025').kind,'clarify');
assert.match(ask('Where can I find Sample Home base price?').rows[0].value,/\$120/);
assert.match(ask('Why does it only show July?').text,/unmatched header/);
assert.equal(engine.answer('Define coverage',{loaded:false},{}).kind,'help');
assert.equal(engine.answer('How is North occupancy calculated?',{loaded:false},{}).kind,'unavailable');
assert.equal(engine.answer('Show North monthly targets',{...data,loaded:false},{}).kind,'unavailable');
assert.equal(ask('Predict revenue next year').kind,'clarify');
assert.equal(ask('Calculate profit from occupancy').kind,'clarify');
assert.equal(JSON.stringify(data),before,'Read-only explanations must not mutate data');
const worker=require('node:fs').readFileSync('chat-worker.js','utf8');
assert.match(worker,/20261012-property-advice/);
console.log('PASS: local definitions/sources, weighted arithmetic, filters/follow-ups, status boundaries, monthly target provenance, missing data, property details and unsupported questions.');
