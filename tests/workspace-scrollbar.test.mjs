import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const workspace=fs.readFileSync(new URL('workspace.js',root),'utf8');
const css=fs.readFileSync(new URL('workspace.css',root),'utf8');

test('source lists expose an accessible custom scrollbar that works with overlay scrollbars',()=>{
  for(const source of ["className='asset-scrollbar'","setAttribute('role','scrollbar')","setAttribute('aria-controls',ul.id)","list.scrollHeight>list.clientHeight+1","thumb.style.transform='translateY('","rail.setAttribute('aria-valuenow'","list.addEventListener('scroll',onScroll","function onKey(event)","function move(event)","rail.addEventListener('pointerdown',down)","observer.observe(list)","observer.disconnect()","mutations.observe(list,{childList:true,subtree:true})","mutations.disconnect()","view.addEventListener('resize',update)","view.removeEventListener('resize',update)","for(const dispose of scrollbarDisposers)dispose()"]){assert.ok(workspace.includes(source),source)}
  for(const rule of ['.asset-scrollbar[hidden]{display:none}','.asset-scrollbar-thumb{','.asset-list{min-width:0;scrollbar-width:none}','.asset-list::-webkit-scrollbar{display:none}'])assert.ok(css.includes(rule),rule);
  assert.ok(css.includes('background:#526b8b'));
});

console.log('workspace-scrollbar.test.mjs: all tests passed');
