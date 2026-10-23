const { test } = require('node:test'),
  assert = require('node:assert/strict');
test('Studio geometry: coordinates account for CSS scale and rotation', async () => {
  const { point, localPoint, area } = await import('../dist/studio/model.mjs');
  assert.deepEqual(
    point({ clientX: 100, clientY: 200 }, { left: 10, top: 20, width: 360, height: 450 }),
    { x: 180, y: 360 },
  );
  const local = localPoint(
    { x: 0.5, y: 0.5, rotation: 90 },
    { x: area.x + area.w / 2, y: area.y + area.h / 2 + 10 },
  );
  assert.ok(Math.abs(local.x - 10) < 1e-10);
  assert.ok(Math.abs(local.y) < 1e-10);
});
test('Studio geometry: move, unlocked resize and ratio lock preserve anchors', async () => {
  const { moveObject } = await import('../dist/studio/model.mjs');
  const original = { x: 0.5, y: 0.5, w: 0.4, h: 0.3, rotation: 0 };
  const moved = { ...original };
  moveObject(moved, { original, point: { x: 0, y: 0 }, handle: null }, { x: 22.8, y: 32 }, false);
  assert.ok(Math.abs(moved.x - 0.6) < 1e-10);
  assert.ok(Math.abs(moved.y - 0.6) < 1e-10);
  const resized = { ...original };
  moveObject(
    resized,
    { original, point: { x: 0, y: 0 }, handle: [1, 1] },
    { x: 22.8, y: 32 },
    false,
  );
  for (const [key, value] of Object.entries({ x: 0.55, y: 0.55, w: 0.5, h: 0.4 }))
    assert.ok(Math.abs(resized[key] - value) < 1e-10, key);
  const locked = { ...original };
  moveObject(locked, { original, point: { x: 0, y: 0 }, handle: [1, 1] }, { x: 22.8, y: 32 }, true);
  assert.ok(locked.w > original.w);
  assert.ok(Math.abs(locked.w / locked.h - original.w / original.h) < 1e-10);
  assert.ok(Math.abs(locked.x - locked.w / 2 - (original.x - original.w / 2)) < 1e-10);
});
test('Studio geometry: confines prints and fresh designs have independent layers', async () => {
  const { confine, fresh } = await import('../dist/studio/model.mjs');
  const object = { x: 1.5, y: -0.2, w: 0.4, h: 0.2, rotation: 0 };
  confine(object);
  assert.deepEqual(object, { x: 0.8, y: 0.1, w: 0.4, h: 0.2, rotation: 0 });
  const first = fresh(),
    second = fresh();
  first.front[0].x = 0.1;
  assert.equal(second.front[0].x, 0.5);
  assert.notEqual(first.front[0].id, second.front[0].id);
  assert.equal(second.back.length, 0);
});
