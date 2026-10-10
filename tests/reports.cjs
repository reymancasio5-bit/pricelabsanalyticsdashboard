const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const props=new Map([['REPORT_MODE','public-tickets-v1'],['REPORT_SPREADSHEET_ID','sheet'],['REPORT_FOLDER_ID','folder'],['REPORT_RECIPIENT','owner@example.com']]);
let rows=[],sends=[],files=[],mailFails=false,driveFails=false,locked=false,quota=10,appendFails=false;
function literal(v){return typeof v==='string'&&v.startsWith("'")?v.slice(1):v;}
const sheet={getLastRow:()=>rows.length,appendRow(values){rows.push(values.map(literal));if(appendFails)throw Error('uncertain write');},setFrozenRows(){},getSheetId:()=>7,
 getRange(row,col,height=1,width=1){return {getValues:()=>Array.from({length:height},(_,i)=>Array.from({length:width},(_,j)=>rows[row-1+i]?.[col-1+j]??'')),setValue(v){rows[row-1][col-1]=literal(v);},createTextFinder(text){return {matchEntireCell(){return this;},findNext(){let idx=rows.findIndex((r,i)=>i>=row-1&&i<row-1+height&&r[col-1]===text);return idx<0?null:{getRow:()=>idx+1};}};}};}};
const ss={getSheetByName:()=>rows.length?sheet:null,insertSheet:()=>sheet,getUrl:()=> 'https://docs.google.com/spreadsheets/d/example/edit',getId:()=> 'sheet'};
const folder={getFilesByName:name=>({hasNext:()=>files.some(f=>f.name===name),next:()=>files.find(f=>f.name===name)}),createFile(blob){if(driveFails)throw Error('drive denied');const file={name:blob.name,getUrl:()=> 'https://drive.google.com/file/d/'+files.length};files.push(file);return file;}};
const context={json_:v=>v,SpreadsheetApp:{openById:()=>ss,flush(){}},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v)})},LockService:{getScriptLock:()=>({tryLock:()=>!locked,releaseLock(){}})},DriveApp:{getFolderById:()=>folder},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,s)=>[...crypto.createHash('sha256').update(s).digest()],base64Decode:s=>[...Buffer.from(s,'base64')],newBlob:(bytes,type,name)=>({bytes,type,name,setName(n){this.name=n;return this;}})},MailApp:{getRemainingDailyQuota:()=>quota,sendEmail(mail){if(mailFails)throw Error('mail failure');sends.push(mail);}}};
vm.createContext(context);vm.runInContext(fs.readFileSync('apps-script/Reports.gs','utf8'),context);
let seq=0;const base={action:'submitReport',requestId:'test-ticket-0000001',name:'Sample Reporter',email:'reporter@example.com',title:'Incorrect count',description:'The sheet and dashboard counts differ.',page:'#/overview',updated:'Sample snapshot'};
function submit(extra={}){return context.doPost({postData:{contents:JSON.stringify({...base,...extra})}});}
function next(extra={}){return submit({requestId:'ticket-new-'+String(++seq).padStart(8,'0'),...extra});}
const png=Buffer.from([137,80,78,71,13,10,26,10,0]).toString('base64');const image={type:'image/png',base64:png};
assert.equal(context.reportConfig_().enabled,true);assert.equal(submit({recipient:'evil@example.com'}).ok,true);assert.equal(rows.length,2);assert.equal(rows[1][5],'Self-reported (not verified)');assert.equal(rows[1][2],'Open');assert.equal(sends[0].to,'owner@example.com');assert.equal(sends[0].replyTo,base.email);
assert.equal(submit().ok,true);assert.equal(rows.length,2);assert.equal(sends.length,1);assert.equal(submit({description:'Different report content'}).ok,false);
assert.equal(next({attachment:image}).ok,true);assert.equal(files.length,1);assert.match(rows.at(-1)[10],/^https:\/\/drive/);assert.equal(sends.at(-1).attachments.length,1);
mailFails=true;assert.equal(next().saved,true);assert.match(rows.at(-1)[11],/Not confirmed/);mailFails=false;
quota=0;assert.equal(next().saved,true);assert.match(rows.at(-1)[11],/quota/);quota=10;
props.delete('REPORT_RECIPIENT');assert.equal(next().emailStatus,'Disabled');props.set('REPORT_RECIPIENT','owner@example.com');
const formula="=IMPORTXML(\"https://example.invalid\",\"x\")";assert.equal(next({name:formula,title:formula,description:formula}).ok,true);assert.equal(rows.at(-1)[3],formula);assert.equal(context.reportCell_(formula),"'"+formula);
for(const extra of [{email:'bad'},{name:''},{website:'spam'},{description:'bad'},{page:'https://bad.example'},{attachment:{type:'image/svg+xml',base64:png}},{attachment:{type:'image/jpeg',base64:png}},{attachment:{type:'image/png',base64:'A'.repeat(2800001)}}])assert.equal(next(extra).ok,false);
const retryId='retry-attachment-0001';driveFails=true;let r=submit({requestId:retryId,attachment:image});assert.equal(r.uncertain,true);assert.equal(rows.at(-1)[2],'Attachment failed');const rowCount=rows.length;driveFails=false;r=submit({requestId:retryId,attachment:image});assert.equal(r.ok,true);assert.equal(rows.length,rowCount);assert.equal(rows.at(-1)[2],'Open');
const uncertainId='uncertain-write-0001';appendFails=true;r=submit({requestId:uncertainId});assert.equal(r.ok,false);appendFails=false;assert.equal(submit({requestId:uncertainId}).ok,true);assert.equal(rows.filter(r=>r[0]===uncertainId).length,1);
locked=true;assert.equal(next().ok,false);locked=false;
props.set('REPORT_PUBLIC_HOUR',JSON.stringify({time:Date.now(),count:20}));assert.match(next().error,/limit/);assert.equal(submit().ok,true,'Retries allowed even at capacity');props.delete('REPORT_PUBLIC_HOUR');
props.set('REPORT_PUBLIC_DAY',JSON.stringify({time:Date.now(),count:100}));assert.match(next().error,/limit/);props.delete('REPORT_PUBLIC_DAY');
const previousHeader=rows[0][0];rows[0][0]='Other sheet content';assert.match(next().error,/different columns/);rows[0][0]=previousHeader;
assert.equal(context.doPost(null).ok,false);assert.equal(context.doPost({postData:{contents:'bad'}}).ok,false);props.delete('REPORT_MODE');assert.equal(context.reportConfig_().enabled,false);assert.equal(next().ok,false);
console.log('PASS: public tickets, Report rows, private screenshot links, unverified contacts, formula escaping, durable retries, email/Drive failures, limits and validation. No real emails or cloud changes.');
