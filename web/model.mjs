export const LEVELS = ['Normal precautions', 'High degree of caution', 'Avoid non-essential travel', 'Avoid all travel'];
const CODE = /^[A-Z]{2}(?:-[A-Z0-9]{1,4})?$/;
export function dateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + 'T12:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
export function visibleCountries(countries, {query = '', level = '', regional = false} = {}) {
  const q = query.trim().toLocaleLowerCase();
  return countries.filter(c => (!q || [c.name, c.name_fr, c.code].join(' ').toLocaleLowerCase().includes(q))
    && (level === '' || c.level === Number(level)) && (!regional || c.regional));
}
export function validateCountry(c) {
  if (!c || typeof c !== 'object' || !CODE.test(c.code) || !Number.isInteger(c.level) || c.level < 0 || c.level > 3
      || typeof c.regional !== 'boolean' || !Number.isFinite(Date.parse(c.updated_at))
      || !/^https:\/\/travel\.gc\.ca\/destinations\/[a-z0-9-]+$/.test(c.url)) throw new Error('Invalid saved destination evidence.');
  for (const key of ['name', 'name_fr', 'advisory', 'update', 'change_type']) {
    if (typeof c[key] !== 'string' || c[key].length > 4000) throw new Error('Invalid saved destination text.');
  }
  return Object.fromEntries(['code', 'name', 'name_fr', 'level', 'regional', 'advisory', 'updated_at', 'update', 'change_type', 'url'].map(k => [k, c[k]]));
}
export function validatePlan(raw) {
  if (!raw || raw.schema !== 1 || !Array.isArray(raw.stops) || raw.stops.length > 60) throw new Error('Use a Trip Brief export with at most 60 stops.');
  if (typeof raw.title !== 'string' || raw.title.length > 120) throw new Error('Trip title must be 120 characters or fewer.');
  const used = new Set();
  const stops = raw.stops.map(s => {
    if (!s || !CODE.test(s.code) || used.has(s.code)) throw new Error('Each destination can appear once in a trip.');
    used.add(s.code);
    if (typeof s.notes !== 'string' || s.notes.length > 2000) throw new Error('Keep each note within 2,000 characters.');
    if (typeof s.start !== 'string' || typeof s.end !== 'string' || (s.start && !dateOnly(s.start)) || (s.end && !dateOnly(s.end))) throw new Error('Enter real calendar dates.');
    if (Boolean(s.start) !== Boolean(s.end) || (s.start && s.end < s.start)) throw new Error('Choose both travel dates, with the end on or after the start.');
    if (!s.snapshot || s.snapshot.code !== s.code) throw new Error('Saved destination evidence is missing.');
    return {code:s.code, start:s.start, end:s.end, notes:s.notes, snapshot:validateCountry(s.snapshot)};
  });
  if (!Number.isFinite(Date.parse(raw.checked_at))) throw new Error('The saved source-check date is invalid.');
  return {schema:1, title:raw.title, checked_at:raw.checked_at, stops};
}
export function changedFields(before, after) {
  if (!after) return ['Destination is no longer in the current index'];
  return [['level','Advisory level'],['regional','Regional flag'],['advisory','Advisory text'],['updated_at','Official update date'],['update','Update summary']]
    .filter(([key]) => before[key] !== after[key]).map(([,name]) => name);
}
export function parseImport(value) {
  if (typeof value !== 'string' || value.length > 1_000_000) throw new Error('Choose a Trip Brief JSON file smaller than 1 MB.');
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error('The file is not valid JSON.'); }
  return validatePlan(parsed);
}
export function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
export function offlineBrief(plan, now) {
  const p = validatePlan(plan);
  const rows = p.stops.map(s => '<section><h2>'+escapeHTML(s.snapshot.name)+'</h2><p><strong>'+escapeHTML(s.snapshot.advisory)+'</strong></p>'
    +'<p>Trip dates: '+escapeHTML(s.start ? s.start+' to '+s.end : 'Not entered')+'</p><p>Official update: '+escapeHTML(s.snapshot.updated_at)+'</p>'
    +'<p>'+escapeHTML(s.snapshot.update)+'</p>'+(s.snapshot.regional?'<p>Regional advisories exist. Read the official page for affected locations.</p>':'')
    +'<p>Notes: '+escapeHTML(s.notes || 'None')+'</p><p><a href="'+escapeHTML(s.snapshot.url)+'">Official destination advice</a></p></section>').join('');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+escapeHTML(p.title||'Trip Brief')+'</title>'
    +'<style>body{font:17px/1.6 system-ui;max-width:900px;margin:40px auto;padding:0 20px;color:#182d35}section{border-top:1px solid #aab9bf;padding:15px 0;break-inside:avoid}a{color:#075a70}p{white-space:pre-wrap}@media print{body{margin:0;font-size:11pt}}</style>'
    +'<h1>'+escapeHTML(p.title||'Trip Brief')+'</h1><p>Exported '+escapeHTML(now)+'. Source last successfully checked '+escapeHTML(p.checked_at)+'.</p>'
    +'<p>This is a saved summary of Global Affairs Canada advisories, not live advice, an entry eligibility decision, or a forecast for your travel dates. Open the official links before departure.</p>'
    +rows+'<footer>Source: Global Affairs Canada • Open Government Licence–Canada. Built with Trip Brief at coolcode.ca/tripbrief/.</footer></html>';
}
