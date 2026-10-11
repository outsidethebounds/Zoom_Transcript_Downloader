import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let clicks=0,control;
class Anchor { constructor(href){this.href=href;} click(){clicks++;} }
class XHR { open(){} addEventListener(){} }
const window={fetch:async()=>({}),XMLHttpRequest:XHR,postMessage(){},addEventListener(_,f){control=f}};
vm.runInNewContext(fs.readFileSync(new URL('../page-hook.js',import.meta.url),'utf8'),{window,HTMLAnchorElement:Anchor,TextDecoder,Promise});
new Anchor('blob:https://app.zoom.us/manual').click();assert.equal(clicks,1,'manual download outside worker remains');
control({source:window,data:{source:'ztd-recording-worker-control',active:true}});
new Anchor('blob:https://app.zoom.us/native').click();assert.equal(clicks,1,'worker native transcript anchor prevented');
new Anchor('https://example.com/report').click();assert.equal(clicks,2,'unrelated download untouched');
control({source:window,data:{source:'ztd-recording-worker-control',active:false}});
new Anchor('blob:https://app.zoom.us/manual').click();assert.equal(clicks,3,'worker completion restores manual downloads');
console.log('page-hook-worker.test.mjs: all tests passed');
