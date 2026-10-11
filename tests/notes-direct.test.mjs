import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const ctx = vm.createContext({ URL, Date, console });
vm.runInContext(fs.readFileSync(new URL('../lib/notes-direct.js', import.meta.url), 'utf8'), ctx);
const api = ctx.ZTDNotesDirect;
const response = () => ({ signedUrl: 'https://file-paa.zoom.us/opaque?ephemeral=example', expiresAt: new Date(Date.now() + 45000).toISOString() });
function fixture(id = 'new-build-random-id') {
  const calls = [];
  const client = { post(url, options) { calls.push({url, options}); return response(); } };
  const regional = async kind => { assert.equal(kind, 'file'); return 'https://eu02docs.zoom.us'; };
  const fn = vm.runInNewContext('(function exportTranscript(data) { return (async()=>client.post((await regional("file"))+"/api/bridge/my_notes/transcript/export",{data}))(); })', {client, regional});
  const factory = { toString: () => 'function(module,exports,require){client.post("/api/bridge/my_notes/transcript/export",{data})}' };
  const runtime = name => { assert.equal(name,id); return {changedExportName:fn}; }; runtime.m = {[id]:factory};
  let scans = 0; const chunk = []; chunk.push = value => { scans++; return value[2](runtime); };
  return {root:{webpackChunkChangedBuild:chunk},calls,fn,runtime,scans:()=>scans};
}
for (const id of ['changed123','another456']) {
  const f=fixture(id); const fn=api.discover(f.root);assert.equal(fn,f.fn);assert.equal(api.discover(f.root),fn);assert.equal(f.scans(),1,'reuse capability without accumulating webpack probes');
  const result=await api.exportNote(fn,'list-note-id',()=>false,async()=>{});
  assert.equal(result.kind,'ready');assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{url:'https://eu02docs.zoom.us/api/bridge/my_notes/transcript/export',options:{data:{fileId:'list-note-id'}}}]);
}
assert.equal(api.discover({}),null);
const changed=fixture();changed.runtime.m['unsafe-ui']={toString:()=> 'client.post("/api/bridge/my_notes/transcript/export"); a.click()'};
assert.equal(api.discover(changed.root),changed.fn,'UI handlers are never invoked');
const delays=[];let requests=0;
const limited=async()=>{requests++;if(requests<3)throw {response:{status:429,headers:{'retry-after':'2'}}};return response();};
assert.equal((await api.exportNote(limited,'id',()=>false,async ms=>delays.push(ms))).kind,'ready');
assert.deepEqual(delays,[2000,2000]);assert.equal(requests,3);
requests=0;assert.equal((await api.exportNote(async()=>{requests++;throw {status:429,headers:{'Retry-After':'120'}}},'id',()=>false,async()=>{throw Error('must not wait/retry early')})).kind,'rateLimit');assert.equal(requests,1);
assert.equal(api.retryDelay(new Date(12000).toUTCString(),0,10000),2000);
for(const [status,kind] of [[401,'login'],[403,'inaccessible'],[404,'inaccessible'],[405,'unavailable'],[500,'failed'],[501,'unavailable'],[429,'rateLimit']]) {
 let count=0;const result=await api.exportNote(async()=>{count++;throw {response:{status}}},'id',()=>false,async()=>{});
 assert.equal(result.kind,kind);assert.equal(count,status===429?3:1);
}
assert.equal((await api.exportNote(async()=>({signedUrl:'https://attacker.invalid/',expiresAt:new Date().toISOString()}),'id',()=>false,async()=>{})).kind,'unavailable');
assert.equal((await api.exportNote(async()=>({data:response()}),'id',()=>false,async()=>{})).kind,'unavailable','do not guess a different app-client schema');
let cancelled=false,release;const late=api.exportNote(()=>new Promise(r=>release=r),'id',()=>cancelled,async()=>{});cancelled=true;release(response());assert.equal((await late).kind,'cancelled','late responses never produce signed URL/save after Stop');
cancelled=false;requests=0;assert.equal((await api.exportNote(async()=>{requests++;throw {status:429}},'id',()=>cancelled,async()=>{cancelled=true})).kind,'cancelled');assert.equal(requests,1);
console.log('notes-direct.test.mjs: all tests passed');
