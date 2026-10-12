export const SOURCES=['recordings','myNotes'];
const text=v=>typeof v==='string'?v.trim():'';
export function normalizeAsset(source,item={}){const id=text(item.sourceId||item.id||item.noteId||item.recordingId||item.key);const occurrenceId=text(item.occurrenceId);return {source,sourceId:id,occurrenceId,title:text(item.title)||'Untitled transcript',date:text(item.date||item.dateISO||item.dateText),available:item.available===true?true:item.available===false?false:null,availabilityReason:text(item.availabilityReason)||null};}
export function buildInventory(scans={}){
 const assets=[];const seen=new Set();
 for(const source of SOURCES)for(const raw of scans[source]?.assets||[]){const a=normalizeAsset(source,raw);const identity=a.sourceId?source+':'+a.sourceId:(a.occurrenceId?source+':occurrence:'+a.occurrenceId:source+':unknown-row:'+assets.length);if(seen.has(identity))continue;seen.add(identity);assets.push(a)}
 const ids=new Map();for(const a of assets){if(!a.occurrenceId)continue;const sources=ids.get(a.occurrenceId)||new Set();sources.add(a.source);ids.set(a.occurrenceId,sources)}
 const missingBySource=Object.fromEntries(SOURCES.map(s=>[s,assets.some(a=>a.source===s&&!a.occurrenceId)]));
 for(const a of assets){if(!a.occurrenceId){a.group='Unknown';continue}const sources=ids.get(a.occurrenceId);if(sources.size===2)a.group='Both';else{const other=a.source==='recordings'?'myNotes':'recordings';a.group=missingBySource[other]?'Unknown':a.source==='recordings'?'Recordings only':'My Notes only'}}
 const groups={recordings:{both:0,only:0,unknown:0},myNotes:{both:0,only:0,unknown:0}};for(const a of assets){const g=a.group==='Both'?'both':a.group==='Unknown'?'unknown':'only';groups[a.source][g]++}
 const accessibleSources=SOURCES.filter(s=>scans[s]?.ok===true);const complete=SOURCES.every(s=>scans[s]?.selected!==true||scans[s]?.ok===true);
 return {assets,groups,complete,scans:Object.fromEntries(SOURCES.map(s=>[s,{selected:scans[s]?.selected===true,ok:scans[s]?.ok===true,count:scans[s]?.assets?.length||0,error:text(scans[s]?.error),needsUserAction:scans[s]?.needsUserAction===true}])),accessibleSources,hasUnknown:assets.some(a=>a.group==='Unknown'),exactUniqueMeetingCount:null}
}
export function canSaveReviewed(inventory,selected){return Boolean(inventory?.complete&&Array.isArray(selected)&&selected.length>0&&selected.every(s=>SOURCES.includes(s)&&inventory.scans[s]?.ok===true))}
export function selectedAssets(inventory,selected){const chosen=new Set(selected||[]);return (inventory?.assets||[]).filter(a=>chosen.has(a.source))}
const canonicalSourceUrl=value=>{try{const u=new URL(value);if(u.protocol!=='https:')return null;return {origin:u.origin,path:u.pathname.replace(/\/+$/,'')||'/'}}catch{return null}};
export function reviewedTargetsMatch(reviewed,current,sources){
 if(!reviewed||!current||!Array.isArray(sources)||!sources.length)return false;
 const company=String(reviewed.company||'').toLowerCase();
 if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(company)||String(current.company||'').toLowerCase()!==company)return false;
 if(sources.includes('recordings')){
  const expected={origin:'https://'+company+'.zoom.us',path:'/recording/meeting/transcript'};
  for(const url of [reviewed.recordingTabUrl,reviewed.recordingListUrl,current.recordingTabUrl,current.recordingListUrl]){const parsed=canonicalSourceUrl(url);if(!parsed||parsed.origin!==expected.origin||parsed.path!==expected.path)return false}
 }
 if(sources.includes('myNotes')){
  const note=canonicalSourceUrl(reviewed.notesTabUrl);
  if(!note||note.path!=='/allNotes'||!new URL(reviewed.notesTabUrl).hostname.endsWith('.zoom.us'))return false;
  for(const url of [reviewed.notesListUrl,current.notesTabUrl,current.notesListUrl]){const parsed=canonicalSourceUrl(url);if(!parsed||parsed.origin!==note.origin||parsed.path!==note.path)return false}
 }
 return true;
}
