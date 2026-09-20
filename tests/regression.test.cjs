const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const prefix = 'pilgrim-star-path-reimagined-';
const context = { window: {}, TextEncoder };
vm.createContext(context);
for (const name of ['calculations.js', 'backup.js']) vm.runInContext(read(name), context);
const math = context.window.PilgrimMath;
const backup = context.window.PilgrimBackup;
const snapshot = window => Object.fromEntries(Object.keys(window.localStorage).map(key => [key, window.localStorage.getItem(key)]));
const store = (window, key) => JSON.parse(window.localStorage.getItem(prefix + key));
async function app(seed = {}, compact = false) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', error => errors.push(error));
  const dom = new JSDOM(read('index.html'), { url: 'https://pilgrim.test/', runScripts: 'outside-only', virtualConsole: console, pretendToBeVisual: true });
  const w = dom.window;
  await new Promise(resolve => w.addEventListener('load', resolve, { once: true }));
  let mediaListener;
  const media = { matches: compact, addEventListener: (_, fn) => { mediaListener = fn; } };
  w.matchMedia = () => media;
  w.TextEncoder = TextEncoder;
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.confirm = () => false;
  w.URL.createObjectURL = () => 'blob:test';
  w.URL.revokeObjectURL = () => {};
  for (const [key, value] of Object.entries(seed)) w.localStorage.setItem(key, value);
  for (const name of ['calculations.js', 'map3d.js', 'backup.js', 'app.js']) w.eval(read(name));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const result = {
    w, errors,
    el: id => w.document.getElementById(id),
    click(id) { this.el(id).click(); },
    input(id, value) { this.el(id).value = value; this.el(id).dispatchEvent(new w.Event('input', { bubbles: true })); },
    origin(value) { this.input('locationInput', value); this.click('updateLocationButton'); },
    select(index) { this.el('destinationSelect').value = String(index); this.el('destinationSelect').dispatchEvent(new w.Event('change', { bubbles: true })); },
    submit(id) { this.el(id).dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); },
    add(name, address) { this.click('homeAddWaypointButton'); this.input('waypointNameInput', name); this.input('waypointCoordinateInput', address); this.submit('waypointForm'); },
    resize(value) { media.matches = value; mediaListener(); },
    async import(json) {
      Object.defineProperty(this.el('backupFileInput'), 'files', { configurable: true, value: [{ size: Buffer.byteLength(json), text: async () => json }] });
      this.el('backupFileInput').dispatchEvent(new w.Event('change'));
      await new Promise(resolve => setImmediate(resolve));
    },
    close() { w.close(); assert.deepEqual(errors.map(e => e.message), []); },
  };
  return result;
}
function rawBackup(w) {
  return backup.encode({ settings: store(w, 'settings'), session: store(w, 'session'), waypoints: store(w, 'waypoints'), journeys: store(w, 'journeys') });
}

test('distance scale matches original source: 1 region=400 LY and a 3-4-5 route=2000 LY', () => {
  assert.equal(math.distanceInLy({x:0,y:0,z:0},{x:1,y:0,z:0}), 400);
  assert.equal(math.distanceInLy({x:0,y:0,z:0},{x:3,y:4,z:0}), 2000);
  assert.equal(math.calculateRoute({x:0,y:0,z:0},{x:3,y:4,z:0},{hyperdrive:1600}).estimatedJumps, 2);
});
test('integer addresses round-trip at boundaries; invalid decimals and hex bounds are rejected', () => {
  for (const input of ['0,0,0', '4095,255,4095', '0432:0076:0D66:0172']) {
    const first = math.parseLocation(input); const next = math.parseLocation(first.address);
    assert.deepEqual([first.x,first.y,first.z], [next.x,next.y,next.z]);
  }
  for (const input of ['-1,2,3','1,2.5,3','4096,0,0','0,256,0','FFFF:0000:0000:0172','0000:0100:0000:0172']) assert.throws(() => math.parseLocation(input));
});
test('origin, destination, settings and notes survive reload, including former demo address', async () => {
  const a = await app();
  a.origin('0432:0076:0D66:0172'); a.select(0);
  a.input('checkpointNoteInput', 'Remember this stop'); a.click('saveCheckpointNoteButton');
  const saved = snapshot(a.w); a.close();
  const b = await app(saved);
  assert.equal(b.el('locationInput').value, '0432:0076:0D66:0172');
  assert.equal(b.el('destinationSelect').value, '0');
  assert.equal(store(b.w,'journeys').journeys[0].points[0].notes, 'Remember this stop');
  b.close();
});
test('custom Pilgrim Star address survives reload', async () => {
  const a = await app(); a.origin('1,2,3'); a.add('My Pilgrim stop', '064A:0082:01B9:009A');
  const saved = snapshot(a.w); a.close();
  const b = await app(saved);
  assert.ok(b.el('destinationSelect').textContent.includes('My Pilgrim stop'));
  assert.equal(store(b.w,'waypoints').custom.length, 1); b.close();
});
test('completion and starting a new journey never append an unvisited target', async () => {
  const a = await app(); a.origin('1,2,3'); a.select(0); a.click('completeJourneyButton');
  assert.equal(store(a.w,'journeys').journeys[0].points.length, 1);
  a.origin('2,2,3'); a.input('journeyNameInput','Next voyage'); a.submit('journeyForm');
  const journeys = store(a.w,'journeys').journeys;
  assert.equal(journeys[1].status,'completed'); assert.equal(journeys[1].points.length,1);
  assert.equal(journeys[2].points.length,0); a.close();
});
test('different systems in one region are separate checkpoints; repeated same address is not', async () => {
  const a = await app(); a.origin('0001:0002:0003:0001'); a.origin('0001:0002:0003:0002'); a.origin('0001:0002:0003:0002');
  assert.equal(store(a.w,'journeys').journeys[0].points.length, 2); a.close();
});
test('arrived state has zero jumps and no arbitrary compass direction', async () => {
  const a = await app(); a.origin('041C:004F:0D89:0205'); a.select(0);
  assert.equal(a.el('jumpsValue').textContent, '0'); assert.equal(a.el('advisoryState').textContent, 'ARRIVED');
  assert.equal(a.el('compassBearing').textContent, '—'); assert.equal(a.el('shipPointer').hidden, true);
  a.origin('041C:004F:0D89:0001');
  assert.equal(a.el('advisoryState').textContent, 'SAME REGION'); a.close();
});
test('invalid origin leaves saved state intact and exposes an inline error', async () => {
  const a = await app(); a.origin('1,2,3'); const previous = snapshot(a.w); a.origin('-1,2,3');
  assert.deepEqual(snapshot(a.w),previous); assert.ok(a.el('locationError').textContent.includes('whole number'));
  assert.equal(a.el('locationInput').getAttribute('aria-invalid'),'true'); a.close();
});
test('compact DOM puts map before full guidance and returns panels correctly at desktop width', async () => {
  const a = await app({},true);
  assert.equal(a.el('advisoryPanel').parentElement.id,'belowMapDetails');
  assert.ok(a.el('starMap').compareDocumentPosition(a.el('advisoryPanel')) & a.w.Node.DOCUMENT_POSITION_FOLLOWING);
  a.resize(false); assert.equal(a.el('advisoryPanel').parentElement.id,'summaryGrid');
  a.resize(true); assert.equal(a.el('advisoryPanel').parentElement.id,'belowMapDetails');
  for (const name of ['locationPanel','destinationProfilePanel']) assert.equal(a.el(name).querySelector('details').open,false);
  const ids = [...a.w.document.querySelectorAll('[id]')].map(e=>e.id); assert.equal(ids.length,new Set(ids).size); a.close();
});
test('reset requires confirmation and retains completed journeys', async () => {
  const a = await app(); a.origin('1,2,3'); a.click('completeJourneyButton'); a.origin('2,2,3');
  const previous = snapshot(a.w); a.click('resetSessionButton'); assert.deepEqual(snapshot(a.w),previous);
  let prompt = ''; a.w.confirm = text => { prompt = text; return true; }; a.click('resetSessionButton');
  assert.ok(prompt.includes('1 checkpoint')); assert.equal(store(a.w,'journeys').journeys.length,1);
  assert.equal(store(a.w,'journeys').journeys[0].status,'completed'); assert.equal(store(a.w,'session').location,null); a.close();
});
test('backup validates, previews, cancels without changes and restores notes and waypoints', async () => {
  const a = await app(); a.origin('1,2,3'); a.add('Backup target','0004:0005:0006:0172');
  a.input('checkpointNoteInput','Backup note'); a.click('saveCheckpointNoteButton');
  const json = rawBackup(a.w); const expected = backup.parse(json); a.close();
  const b = await app(); b.origin('8,9,10'); const previous = snapshot(b.w);
  await b.import(json); assert.equal(b.el('backupImportDialog').open,true); assert.ok(b.el('backupPreview').textContent.includes('1 checkpoint(s)'));
  assert.deepEqual(snapshot(b.w),previous); b.click('cancelBackupButton'); assert.deepEqual(snapshot(b.w),previous);
  await b.import(json); b.click('confirmBackupButton');
  assert.equal(b.el('locationInput').value,'0001:0002:0003:0172');
  assert.deepEqual(store(b.w,'journeys'),JSON.parse(JSON.stringify(expected.journeys)));
  assert.equal(b.el('backupImportDialog').open,false);
  assert.ok(b.el('destinationSelect').textContent.includes('Backup target'));
  const restored = snapshot(b.w); b.close(); const c = await app(restored); assert.equal(c.el('locationInput').value,'0001:0002:0003:0172'); c.close();
});
test('malformed/unsupported/oversize backups do not mutate stored data', async () => {
  const a = await app(); a.origin('1,2,3'); const previous = snapshot(a.w);
  for (const json of ['{bad', '{"format":"other","version":1}', JSON.stringify({format:'pilgrim-star-path-backup',version:99,data:{}}), ' '.repeat(backup.MAX_BYTES+1)]) {
    await a.import(json); assert.equal(a.el('backupImportDialog').open,false); assert.deepEqual(snapshot(a.w),previous);
  }
  const raw = JSON.parse(rawBackup(a.w)); raw.data.journeys.journeys[0].points[0].coords.x='bad';
  await a.import(JSON.stringify(raw)); assert.deepEqual(snapshot(a.w),previous); a.close();
});
test('failed multi-key storage write rolls back all prior values', () => {
  const values = new Map([['a','old a'],['b','old b']]); let failed = false;
  const storage = { getItem:key=>values.get(key)??null, removeItem:key=>values.delete(key), setItem(key,value) { if (key==='b' && !failed) {failed=true;throw new Error('Quota');} values.set(key,value); } };
  const result=backup.commit(storage,[['a','new a'],['b','new b']]);
  assert.equal(result.ok,false); assert.equal(result.rollbackFailed,false); assert.deepEqual([...values],[['a','old a'],['b','old b']]);
});
test('failed saves are visible and a later retry saves all changes', async () => {
  const a = await app(); a.origin('1,2,3'); const original = a.w.Storage.prototype.setItem;
  a.w.Storage.prototype.setItem = () => {throw new Error('Quota');}; a.origin('2,2,3');
  assert.equal(a.el('storageWarning').hidden,false); assert.match(a.el('toast').textContent,/temporary/);
  assert.equal(store(a.w,'session').location.coords.x,1);
  a.w.Storage.prototype.setItem = original; a.click('retrySaveButton');
  assert.equal(a.el('storageWarning').hidden,true); assert.equal(store(a.w,'session').location.coords.x,2); a.close();
});
test('failed backup restore keeps current records and reports failure', async () => {
  const a = await app(); a.origin('1,2,3'); const json = rawBackup(a.w); a.origin('8,9,10'); const previous = snapshot(a.w);
  await a.import(json);
  const original = a.w.Storage.prototype.setItem; let failed = false;
  a.w.Storage.prototype.setItem = function(key,value) {
    if (key.endsWith('-journeys') && !failed) { failed=true; throw new Error('Quota'); }
    return original.call(this,key,value);
  };
  a.click('confirmBackupButton');
  assert.deepEqual(snapshot(a.w),previous); assert.match(a.el('backupStatus').textContent,/Existing data was kept/);
  assert.equal(a.el('locationInput').value,'0008:0009:000A:0172'); a.close();
});
test('active journeys can resume from their latest checkpoint without 3D support', async () => {
  const a = await app(); a.origin('1,2,3'); a.origin('4,5,6'); const saved=snapshot(a.w); a.close();
  const session=JSON.parse(saved[prefix+'session']); session.location={address:'0008:0009:000A:0172',coords:{x:8,y:9,z:10},planet:'0172'};
  saved[prefix+'session']=JSON.stringify(session);
  const b=await app(saved); b.click('restoreJourneyButton');
  assert.equal(b.el('locationInput').value,'0004:0005:0006:0172');
  assert.equal(store(b.w,'journeys').journeys[0].points.length,2); b.close();
});
test('backup export includes current data even while browser storage is full', async () => {
  const a=await app(); a.origin('1,2,3');
  a.w.Storage.prototype.setItem=()=>{throw new Error('Quota');}; a.origin('4,5,6');
  let downloaded; a.w.URL.createObjectURL=blob=>{downloaded=blob;return 'blob:test';};
  a.w.HTMLAnchorElement.prototype.click=function(){};
  a.click('exportBackupButton'); assert.ok(downloaded); assert.match(a.el('backupStatus').textContent,/download started/);
  const json=await new Promise((resolve,reject)=>{const reader=new a.w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(downloaded);});
  assert.equal(backup.parse(json).session.location.coords.x,4); a.close();
});
test('choosing a destination before an origin survives reload and backup restore', async () => {
  const a=await app(); a.select(1); const saved=snapshot(a.w); const json=rawBackup(a.w); a.close();
  const b=await app(saved); assert.equal(b.el('destinationSelect').value,'1'); assert.equal(b.el('locationInput').value,''); b.close();
  const c=await app(); c.origin('1,2,3'); await c.import(json); c.click('confirmBackupButton');
  assert.equal(c.el('destinationSelect').value,'1'); assert.equal(c.el('locationInput').value,''); c.close();
});
test('origin status shows awaiting input, red invalid state and accepted valid input', async () => {
  const a=await app();
  assert.equal(a.el('hexInputStatus').textContent,'Awaiting hex input');
  assert.equal(a.w.document.getElementById('coordinateHint'),null);
  a.input('locationInput','XYZ'); a.click('updateLocationButton');
  assert.equal(a.el('hexInputStatus').textContent,'Invalid hex input');
  assert.equal(a.el('hexInputIndicator').classList.contains('is-invalid'),true);
  a.input('locationInput','0432:0076:0D66:0172');
  assert.equal(a.el('hexInputStatus').textContent,'Hex address accepted');
  assert.equal(a.el('hexInputIndicator').classList.contains('is-invalid'),false);
  a.input('locationInput',''); assert.equal(a.el('hexInputStatus').textContent,'Awaiting hex input');
  a.close();
});
test('no destination has a pulsing NO LOCK state; selecting and clearing switches it', async () => {
  const a=await app();
  assert.equal(a.el('advisoryState').textContent,'NO LOCK');
  assert.equal(a.el('advisoryState').classList.contains('state-waiting'),true);
  a.select(0); assert.equal(a.el('advisoryState').textContent,'DESTINATION LOCK');
  assert.equal(a.el('advisoryState').classList.contains('state-waiting'),false);
  a.select(''); assert.equal(a.el('advisoryState').textContent,'NO LOCK'); a.close();
});
test('note popup edits the clicked checkpoint, cancels drafts, clears and persists notes', async () => {
  const a=await app(); a.origin('1,2,3'); a.input('checkpointNoteInput','First note'); a.click('saveCheckpointNoteButton');
  a.origin('4,5,6'); a.input('checkpointNoteInput','Second note'); a.click('saveCheckpointNoteButton');
  a.el('originJourneyPoints').querySelector('.note-preview-button').click();
  assert.equal(a.el('checkpointNoteDialog').open,true); assert.equal(a.el('checkpointNoteEditor').value,'First note');
  a.input('checkpointNoteEditor','Do not save'); a.click('cancelNoteDialogButton');
  assert.equal(store(a.w,'journeys').journeys[0].points[0].notes,'First note');
  a.el('originJourneyPoints').querySelector('.note-preview-button').click(); a.input('checkpointNoteEditor','Larger editor note\nSecond line'); a.submit('checkpointNoteForm');
  assert.equal(a.el('checkpointNoteDialog').open,false);
  const points=store(a.w,'journeys').journeys[0].points;
  assert.equal(points[0].notes,'Larger editor note\nSecond line'); assert.equal(points[1].notes,'Second note');
  const saved=snapshot(a.w); a.close(); const b=await app(saved);
  b.el('activeJourneyPoints').querySelector('.note-preview-button').click();
  assert.equal(b.el('checkpointNoteEditor').value,'Larger editor note\nSecond line');
  b.input('checkpointNoteEditor',''); b.submit('checkpointNoteForm');
  assert.equal(store(b.w,'journeys').journeys[0].points[0].notes,''); b.close();
});



test('v0.40 migrates saved capital selection and deletions without changing custom destinations', async () => {
  const oldAmino = '064A:0082:01B9:0051';
  const oldAgt = '0971:0081:0EDD:0118';
  const a = await app({
    [prefix+'session']: JSON.stringify({ location: null, selectedDestinationAddress: oldAmino }),
    [prefix+'waypoints']: JSON.stringify({ custom: [], removedCommunity: [oldAgt], deletedCustom: [] }),
  });
  assert.equal(a.el('targetAddress').textContent, '064A:0082:01B9:0022');
  assert.ok(!a.el('destinationSelect').textContent.includes('AGT Embassy'));
  a.click('restoreWaypointsButton');
  assert.ok(a.el('destinationSelect').textContent.includes('AGT Embassy'));
  a.select(2);
  assert.equal(a.el('targetAddress').textContent, '043D:0072:0D44:005F');
  a.origin('043D:0072:0D44:005F');
  assert.equal(Number(a.el('destinationDistanceValue').textContent), 0);
  a.add('My old capital stop', oldAgt);
  const saved = snapshot(a.w); a.close();
  const b = await app(saved);
  assert.equal(b.el('targetAddress').textContent, oldAgt);
  assert.ok(b.el('destinationSelect').selectedOptions[0].textContent.includes('My old capital stop'));
  b.close();
});
