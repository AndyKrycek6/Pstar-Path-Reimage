const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function renderer() {
  const frames = new Map(), events = {}, documentEvents = {}, labels = new Map();
  let nextId = 0;
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
    measureText: text => ({ width: text.length * 6 }),
    fillText: (text, x, y) => labels.set(text, { x, y }),
  }, { get: (obj, key) => obj[key] || (() => {}) });
  const canvas = {
    style: {}, classList: { add() {}, remove() {} },
    getContext: () => ctx, getBoundingClientRect: () => ({ width: 800, height: 600 }),
    addEventListener: (name, fn) => { events[name] = fn; },
    setPointerCapture() {}, releasePointerCapture() {},
  };
  const document = { hidden: false, addEventListener: (name, fn) => { documentEvents[name] = fn; } };
  const window = {
    document, addEventListener() {},
    requestAnimationFrame: fn => { frames.set(++nextId, fn); return nextId; },
    cancelAnimationFrame: id => frames.delete(id),
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../map3d.js'), 'utf8'), { window });
  const map = window.Pilgrim3D.create(canvas);
  map.setScene({ user: { x: 900, y: 100, z: 3000 }, originReady: true,
    target: { x: 3200, y: 210, z: 700 }, targetReady: true, targetName: 'TEST TARGET' });
  map.resize();
  return { map, frames, labels, document,
    tick(time) { const batch = [...frames.values()]; frames.clear(); batch.forEach(fn => fn(time)); },
    event(name, props = {}) { events[name]({ button: 0, clientX: 0, clientY: 0, pointerId: 1, preventDefault() {}, ...props }); },
    hide() { document.hidden = true; documentEvents.visibilitychange(); },
  };
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function centred(r, label) {
  near(r.labels.get(label).x, 414); near(r.labels.get(label).y, 297);
}

test('slow orbit makes a full revolution in 120 seconds and keeps either lock centred', () => {
  for (const [focus, label] of [['player','USER LOCATION'], ['destination','TEST TARGET']]) {
    const r = renderer();
    assert.equal(r.map.setOrbitFocus(focus), true);
    r.event('pointerdown'); r.event('pointermove', { clientY: 60 }); r.event('pointerup');
    r.map.startOrbit(); r.map.startOrbit();
    assert.equal(r.frames.size, 1);
    r.tick(0);
    for (let t = 100; t <= 120000; t += 100) {
      r.tick(t); centred(r, label);
      if (t === 30000) near(r.map.getCamera().yaw, Math.PI / 2);
    }
    near(Math.sin(r.map.getCamera().yaw), 0);
    near(Math.cos(r.map.getCamera().yaw), 1);
    r.map.pauseOrbit(); assert.equal(r.frames.size, 0);
  }
});

test('free orbit preserves a panned view when starting and drag pauses animation', () => {
  const r = renderer(); r.map.setOrbitFocus('player'); r.map.startOrbit();
  r.event('pointerdown', { shiftKey: true });
  r.event('pointermove', { clientX: 80, clientY: 40 }); r.event('pointerup');
  assert.equal(r.map.getOrbitState().focus, 'free');
  assert.equal(r.map.getOrbitState().running, false);
  const before = { ...r.labels.get('TEST TARGET') };
  r.map.startOrbit(); r.tick(0);
  near(r.labels.get('TEST TARGET').x, before.x); near(r.labels.get('TEST TARGET').y, before.y);
  r.tick(100); assert.ok(r.map.getCamera().yaw > 0);
});

test('locks track refreshed coordinates and local projection without resetting yaw or zoom', () => {
  const r = renderer(); r.map.setOrbitFocus('destination'); r.map.startOrbit();
  r.tick(0); r.tick(100);
  const before = r.map.getCamera();
  r.map.setScene({ target: { x: 2500, y: 140, z: 1500 }, localMode: true });
  near(r.map.getCamera().yaw, before.yaw); near(r.map.getCamera().distance, before.distance);
  centred(r, 'TEST TARGET'); assert.equal(r.map.getOrbitState().running, true);
  r.map.setScene({ targetReady: false });
  assert.equal(r.map.getOrbitState().running, false);
  assert.equal(r.map.getOrbitState().focus, 'free');
  assert.equal(r.map.setOrbitFocus('destination'), false);
});

test('reset, hidden tab and inactive map cancel orbit; resuming never jumps', () => {
  const r = renderer(); r.map.startOrbit(); r.tick(0); r.tick(100);
  r.map.setActive(false); assert.equal(r.frames.size, 0); assert.equal(r.map.startOrbit(), false);
  r.map.setActive(true); r.map.startOrbit(); const yaw = r.map.getCamera().yaw;
  r.tick(999999); near(r.map.getCamera().yaw, yaw);
  r.hide(); assert.equal(r.frames.size, 0); assert.equal(r.map.getOrbitState().running, false);
  r.document.hidden = false; r.map.startOrbit(); r.map.reset();
  assert.equal(r.frames.size, 0); near(r.map.getCamera().yaw, 0);
  assert.equal(r.map.getOrbitState().focus, 'free');
});
