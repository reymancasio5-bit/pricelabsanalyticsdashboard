const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.style={};this.events={};}
 set textContent(v){this.text=String(v);this.children=[];}
 appendChild(c){this.children.push(c);return c;}
 setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,v){this.events[k]=v;}
 get outerHTML(){const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const attrs={...this.attrs,...(this.className?{class:this.className}:{}),...(Object.keys(this.style).length?{style:Object.entries(this.style).map(([k,v])=>k+':'+v).join(';')}: {})};return '<'+this.tag+Object.entries(attrs).map(([k,v])=>' '+k+'="'+esc(v)+'"').join('')+'>'+esc(this.text||'')+this.children.map(c=>c.outerHTML).join('')+'</'+this.tag+'>';}
}
const context={window:{},document:{createElement:tag=>new Node(tag)}};vm.runInNewContext(fs.readFileSync('chat-report-view.js','utf8'),context);
const root=new Node('div');context.window.PortfolioChatReport.render(root,{title:'Fixture <script>alert(1)</script>',summary:'Synthetic report',unit:'pp',points:[{label:'Below',value:-20},{label:'Above',value:10},{label:'Missing',value:null}],stats:[],method:'Difference',suggestions:['Review source values'],limitations:['Fixture only'],updated:'Synthetic'},'Synthetic source');
const html=root.outerHTML;assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('NaN'));assert.ok(html.includes('Unavailable'));assert.ok(html.includes('chat-chart-negative'));assert.ok(html.includes('scope="col"'));assert.ok(html.includes('Download report'));
const all=[];function walk(n){all.push(n);n.children.forEach(walk);}walk(root);assert.equal(all.filter(n=>n.className&&n.className.includes('chat-chart-bar')).length,2);assert.ok(all.filter(n=>n.style.width).every(n=>parseFloat(n.style.width)>=0&&parseFloat(n.style.width)<=100));
console.log('PASS: safe text rendering, signed chart bars, missing values, numeric geometry and accessible underlying table.');
