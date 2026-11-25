import {LEVELS, visibleCountries, validateCountry, validatePlan, parseImport, changedFields, offlineBrief} from './model.mjs';
const $ = id => document.getElementById(id);
const KEY = 'coolcode:tripbrief:trip';
let data, selected = '', stops = [], savedCheck = '';
for(const id of ['save','load','download-json','download-brief','import'])document.getElementById(id).disabled=true;
function node(tag, value, cls) { const el=document.createElement(tag); if(value !== undefined)el.textContent=value; if(cls)el.className=cls; return el; }
function button(label, run, cls) { const b=node('button',label,cls);b.type='button';b.addEventListener('click',run);return b; }
function status(message) { $('trip-status').textContent=message; }
function readable(value) { const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Unknown'; }
function badge(c) { return node('span',LEVELS[c.level],'level level-'+c.level); }
function official(c) { const a=node('a','Read the full official destination advice ↗');a.href=c.url;a.target='_blank';a.rel='noopener';return a; }
function tab(name) { for(const value of ['explore','trip','changes']){$(value).hidden=value!==name;$('tab-'+value).setAttribute('aria-selected',String(value===name));} }
for(const name of ['explore','trip','changes'])$('tab-'+name).addEventListener('click',()=>tab(name));
$('back-explore').addEventListener('click',()=>tab('explore'));
function country(code){return data?.countries.find(c=>c.code===code);}
function filters() {
  const rows=visibleCountries(data.countries,{query:$('search').value,level:$('level').value,regional:$('regional').checked});
  $('result-count').textContent=rows.length+' of '+data.countries.length+' destinations';
  const fragment=document.createDocumentFragment();
  for(const c of rows){const b=button('',()=>{selected=c.code;filters();detail();},'country');b.setAttribute('aria-pressed',String(selected===c.code));const title=node('span');title.append(node('span',c.name,'country-name'),node('small',c.code+(c.regional?' · Regional advice':'')));b.append(title,badge(c));fragment.append(b);}
  $('countries').replaceChildren(fragment);
  if(!rows.length)$('countries').append(node('p','No matching destinations. Try another name or clear the filters.','empty'));
}
function detail() {
  const c=country(selected);if(!c)return;
  const root=$('detail');root.replaceChildren(badge(c),node('h2',c.name),node('p',c.advisory));
  if(c.regional)root.append(node('p','Regional advisories apply. Open the official page to see which areas are affected.','regional-note'));
  root.append(node('h3','Latest published change'),node('p',c.update),node('p',c.change_type+' · '+readable(c.updated_at),'subtle'),official(c));
  const actions=node('div',undefined,'actions');const exists=stops.some(s=>s.code===c.code);
  const add=button(exists?'Already in your trip':'Add to my trip',()=>{if(stops.length>=60){status('A trip can contain up to 60 destinations.');tab('trip');return;}stops.push({code:c.code,start:'',end:'',notes:'',snapshot:{...c}});renderTrip();detail();status(c.name+' added. Choose dates or continue exploring.');},'primary');add.disabled=exists;actions.append(add,button('View my trip',()=>tab('trip')));root.append(actions);
}
function renderTrip() {
  $('trip-count').textContent=stops.length;
  const fragment=document.createDocumentFragment();
  stops.forEach((s,index)=>{
    const current=country(s.code), c=current||s.snapshot;
    const article=node('article',undefined,'stop'), head=node('div',undefined,'stop-head'), heading=node('div');
    heading.append(node('h3',(index+1)+'. '+c.name),badge(c));head.append(heading,button('Remove',()=>{stops.splice(index,1);renderTrip();detail();status('Destination removed from this tab. Save again to update your device copy.');}));
    article.append(head);
    const changed=changedFields(s.snapshot,current);
    if(changed.length)article.append(node('p','Changed since this destination was added or saved: '+changed.join(', ')+'.'+(savedCheck?' Earlier capture: '+readable(savedCheck)+'.':''),'changed'));
    if(!current)article.append(node('p','This destination is absent from the current index. The saved summary is retained for reference; remove it before exporting a current brief.','warning'));
    article.append(node('p',c.advisory),node('p',c.update),node('p','Official update: '+readable(c.updated_at),'subtle'));
    if(c.regional)article.append(node('p','Regional advisories exist. Check the official page for affected areas.','regional-note'));
    const dates=node('div',undefined,'dates');
    for(const [key,label] of [['start','Arrival date'],['end','Departure date']]){const l=node('label',label),input=node('input');input.type='date';input.value=s[key];input.setAttribute('aria-label',label+' for '+c.name);input.addEventListener('input',()=>{s[key]=input.value;status('Unsaved changes stay in this tab.');});l.append(input);dates.append(l);}
    const notes=node('label','Your notes'), textarea=node('textarea');textarea.rows=3;textarea.maxLength=2000;textarea.value=s.notes;textarea.placeholder='Booking reminders, places to check, contact details…';textarea.setAttribute('aria-label','Notes for '+c.name);textarea.addEventListener('input',()=>{s.notes=textarea.value;status('Unsaved changes stay in this tab.');});notes.append(textarea);
    article.append(dates,notes,official(c));fragment.append(article);
  });
  $('stops').replaceChildren(fragment);
  if(!stops.length)$('stops').append(node('p','Your trip is empty. Explore destinations and add the places you plan to visit.','empty'));
}
function plan() {
  if(!stops.length)throw new Error('Add at least one destination first.');
  if(stops.some(s=>!country(s.code)))throw new Error('Remove destinations absent from the current index before saving or exporting a current brief.');
  return validatePlan({schema:1,title:$('trip-title').value,checked_at:data.checked_at,stops:stops.map(s=>({...s,snapshot:{...country(s.code)}}))});
}
function run(action){try{action();}catch(error){status(error.message);}}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function applyPlan(p){stops=p.stops;$('trip-title').value=p.title;savedCheck=p.checked_at;renderTrip();detail();tab('trip');}
$('save').addEventListener('click',()=>run(()=>{const p=plan();localStorage.setItem(KEY,JSON.stringify(p));applyPlan(p);status('Saved on this device. Nothing was uploaded.');}));
$('load').addEventListener('click',()=>run(()=>{const value=localStorage.getItem(KEY);if(!value)throw new Error('No saved trip on this device.');const p=parseImport(value);applyPlan(p);status('Loaded your saved trip. Current advice is shown; changes from the saved evidence are marked.');}));
$('download-json').addEventListener('click',()=>run(()=>{download('tripbrief.json',JSON.stringify(plan(),null,2),'application/json');status('Exported your trip and dated source evidence.');}));
$('download-brief').addEventListener('click',()=>run(()=>{download('tripbrief-offline.html',offlineBrief(plan(),new Date().toISOString()),'text/html');status('Downloaded a self-contained brief. Open it offline or print it to PDF.');}));
$('clear').addEventListener('click',()=>{stops=[];$('trip-title').value='';savedCheck='';renderTrip();detail();status('Cleared this tab. Your device save remains until you replace or delete it.');});
$('forget').addEventListener('click',()=>run(()=>{localStorage.removeItem(KEY);status('Deleted the saved device copy. The current tab remains open.');}));
$('import').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>1_000_000)throw new Error('Choose a JSON file smaller than 1 MB.');const p=parseImport(await file.text());applyPlan(p);status('Imported '+p.stops.length+' destinations. The file was not uploaded or automatically saved.');}catch(error){status(error.message);}finally{event.target.value='';}});
$('trip-title').addEventListener('input',()=>status('Unsaved changes stay in this tab.'));
function history() {
  $('history-note').textContent='Observation began '+readable(data.baseline_at)+'. This records differences between captured advisory summaries, not every edit to the full official pages. Up to '+data.changes.length+' recent recorded changes are shown.';
  const fragment=document.createDocumentFragment();
  for(const change of data.changes){const a=node('article',undefined,'change-card');a.append(node('h3',change.name),node('p',change.kind+' · detected '+readable(change.detected_at),'subtle'));if(change.after)a.append(node('p',change.after.advisory),node('p',change.after.update));if(country(change.code))a.append(button('View destination',()=>{selected=change.code;detail();filters();tab('explore');$('detail').scrollIntoView({behavior:'smooth',block:'nearest'});}));fragment.append(a);}
  $('change-list').replaceChildren(fragment);if(!data.changes.length)$('change-list').append(node('p','No changes have been observed since the first capture. Official update dates are still shown for every destination.','empty'));
}
async function init(){try{
  const response=await fetch('./data/index.json',{cache:'no-cache'});if(!response.ok)throw new Error('HTTP '+response.status);const capture=await response.json();
  if(capture.schema!==1||!Array.isArray(capture.countries)||!capture.countries.length||!Number.isFinite(Date.parse(capture.checked_at)))throw new Error('Invalid capture');
  capture.countries=capture.countries.map(validateCountry);data=capture;
  for(const id of ['save','load','download-json','download-brief','import'])$(id).disabled=false;
  $('source-status').textContent=data.countries.length+' official destinations · checked '+readable(data.checked_at)+' · source edition '+readable(data.source_generated_at);
  if(Date.now()-Date.parse(data.checked_at)>6*3600000){$('stale').hidden=false;$('stale').textContent='This capture is more than six hours old. Check the official destination pages for current advice.';}
  for(const name of ['search','level','regional'])$(name).addEventListener('input',filters);
  filters();renderTrip();history();status('Nothing has been saved on this device by this session.');
}catch(error){$('source-status').textContent='The advisory capture could not be loaded. Open the official advice link above.';$('countries').replaceChildren(node('p','Please reload when the snapshot is available. No current advice can be shown.','empty'));for(const id of ['save','download-json','download-brief'])$(id).disabled=true;}}
init();
