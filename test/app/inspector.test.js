// SignalForge — build SignalRGB effects from images, video, gradients and shapes.
// Copyright (C) 2026 Max Leopold Blumenschein
// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeInspector, widenToInclude, SECTION_TITLES } from '../../app/renderer/components/inspector.js';
import {
  normalizeDocument, FIT_MODES, MOTION_KINDS, SOLID_MOTION_KINDS, IMAGE_MOTION_KINDS
} from '../../src/engine/document.js';
import { getByPath, setByPath } from '../../src/engine/bind.js';
import { CONTROL_RANGES } from '../../src/export/effect-controls.js';

const docWith = (layer) => normalizeDocument({
  assets: { q: { kind: 'image', mime: 'image/png', data: 'AAAA' } },
  layers: [{ id: 'a1', type: 'image', asset: 'q', ...layer }]
}).doc;

test('an image layer offers fit, and one entry per active motion', () => {
  const doc = docWith({ motions: [{ kind: 'warp' }, { kind: 'breathe' }] });
  const fields = describeInspector(doc, 'a1');
  const paths = fields.map((f) => f.path);
  assert.ok(paths.includes('layers.0.fit'));
  assert.ok(paths.includes('layers.0.motions.0.speed'));
  assert.ok(paths.includes('layers.0.motions.1.amount'));
});

test('a layer with no motions offers no motion sliders', () => {
  const fields = describeInspector(docWith({ motions: [] }), 'a1');
  assert.equal(fields.filter((f) => f.path.includes('motions')).length, 0);
});

test('the document-wide fields are always present, exactly once each', () => {
  const fields = describeInspector(docWith({}), 'a1');
  for (const path of ['brightness', 'saturation', 'greenMagenta', 'blueYellow']) {
    assert.equal(fields.filter((f) => f.path === path).length, 1, path);
  }
});

test('every field carries the range and step the control needs', () => {
  for (const field of describeInspector(docWith({ motions: [{ kind: 'warp' }] }), 'a1')) {
    if (field.type !== 'number') continue;
    assert.equal(typeof field.min, 'number', field.path);
    assert.equal(typeof field.max, 'number', field.path);
    assert.ok(field.max > field.min, field.path);
  }
});

test('an unknown layer id yields the document fields only, not a crash', () => {
  const fields = describeInspector(docWith({}), 'ghost');
  assert.ok(fields.length > 0);
  assert.equal(fields.filter((f) => f.path.startsWith('layers.')).length, 0);
});

// The ranges are the part most easily got wrong by hand, so they are checked
// against the engine itself rather than against copied-out numbers: a slider
// that offers a value normalizeDocument clamps away would let someone drag to
// a setting the picture never takes.
test('no slider offers a value the engine would clamp away', () => {
  const doc = docWith({ motions: [{ kind: 'warp' }] });
  for (const field of describeInspector(doc, 'a1')) {
    if (field.type !== 'number') continue;
    for (const value of [field.min, field.max]) {
      const probe = docWith({ motions: [{ kind: 'warp' }] });
      assert.ok(setByPath(probe, field.path, value), `${field.path} is not a writable path`);
      const again = normalizeDocument(probe).doc;
      assert.equal(getByPath(again, field.path), value,
        `${field.path} = ${value} does not survive normalizeDocument`);
    }
  }
});

// The app and the finished effect must present the same choices. They now
// share one table (CONTROL_RANGES) instead of keeping a copy each, so what is
// left to get wrong is the mapping between the two sets of names — the
// exported control "tempo" steers a motion's `speed`, "strength" its
// `amount`. Crossing those two would leave speed offering 0..100 and strength
// 1..100, which no test of "the two tables are equal" would ever notice.
test('every slider offers exactly the range the matching exported control offers', () => {
  // Three documents, because no single layer type OR SHAPE has every slider:
  // the angle and the stop positions belong to a gradient, the band count only
  // to a gradient whose shape repeats, and everything else is on offer whatever
  // is loaded. Taken together they must account for every entry in the shared
  // table.
  const fields = [
    ...describeInspector(docWith({ motions: [{ kind: 'warp' }] }), 'a1'),
    ...describeInspector(normalizeDocument({
      layers: [{ id: 'g1', type: 'gradient', motions: [{ kind: 'warp' }] }]
    }).doc, 'g1'),
    ...describeInspector(normalizeDocument({
      layers: [{ id: 'g2', type: 'gradient', shape: 'stripes', motions: [{ kind: 'warp' }] }]
    }).doc, 'g2'),
    // ...and two figures, for the same reason there are two gradients: a ring
    // is the only figure offered a thickness and a star the only one offered a
    // point count, so one shape layer would leave two of the shared table's
    // entries unaccounted for and the closing assertion would go red for a
    // control that is perfectly well offered.
    ...describeInspector(normalizeDocument({
      layers: [{ id: 's1', type: 'shape', figure: 'ring', motions: [{ kind: 'drift' }] }]
    }).doc, 's1'),
    ...describeInspector(normalizeDocument({
      layers: [{ id: 's2', type: 'shape', figure: 'star', motions: [{ kind: 'spin' }] }]
    }).doc, 's2'),
    // ...and a swarm, which has to be the SECOND layer of its document and not
    // the first. Every document above puts its layer at index 0, so every path
    // above begins "layers.0." — and a particle layer has a `size` of its own,
    // clamped 1..25 against a figure's 1..200. Both would be "layers.0.size",
    // the `find` below takes the first match, and the pair would silently be
    // checking the figure's range twice instead of checking the particle's at
    // all. A layer in front of it moves its paths to "layers.1." and the two
    // stop colliding.
    ...describeInspector(normalizeDocument({
      layers: [
        { id: 'ahead', type: 'solid' },
        { id: 'p1', type: 'particles', motions: [{ kind: 'breathe' }] }
      ]
    }).doc, 'p1')
  ];
  const pairs = [
    ['layers.0.motions.0.speed', 'tempo'],
    ['layers.0.motions.0.amount', 'strength'],
    ['brightness', 'brightness'],
    ['saturation', 'saturation'],
    ['greenMagenta', 'greenMagenta'],
    ['blueYellow', 'blueYellow'],
    ['layers.0.angle', 'angle'],
    ['layers.0.bands', 'bands'],
    ['layers.0.stops.0.at', 'stop'],
    ['hueShift', 'hueShift'],
    ['hueCycle', 'hueCycle'],
    ['trail', 'trail'],
    ['aspect', 'aspect'],
    // The shape layer's five. Two of them are the crossing this whole test
    // exists to catch: the exported controls are called posX and posY (a
    // control's property becomes a global in the finished effect, and `x` is
    // not a name to claim there), while the document calls the same two things
    // position.x and position.y. Nothing but this pairing keeps those aligned.
    ['layers.0.size', 'size'],
    ['layers.0.position.x', 'posX'],
    ['layers.0.position.y', 'posY'],
    ['layers.0.thickness', 'thickness'],
    ['layers.0.points', 'points'],
    ['layers.0.rotation', 'rotation'],
    // The colour cycle's tempo, on the two shape documents (a figure carries
    // it; the exported control is called cycleTempo because `tempo` is a
    // motion's and the panel is flat).
    ['layers.0.cycleSpeed', 'cycleTempo'],
    // The particle layer's four, at layers.1 for the reason given above. Two of
    // them are the same crossing posX and posY are: the exported controls are
    // called particleCount and particleSize because a control's property
    // becomes a global in the finished effect and `size` is already the
    // figure's, while the document calls them count and size. `travelSpeed` is
    // the third of that kind and the one with real teeth — SignalRGB's panel is
    // flat, so a layer speed sharing `tempo` would put two sliders both
    // labelled "Tempo" next to each other in it.
    ['layers.1.count', 'particleCount'],
    ['layers.1.size', 'particleSize'],
    ['layers.1.tilt', 'tilt'],
    ['layers.1.speed', 'travelSpeed'],
    ['layers.1.seed', 'seed']
  ];

  // ------------------------------------------------------ and the background
  //
  // A LIST OF ITS OWN, AND IT HAS TO BE ONE. A background is a gradient like
  // any other, so its cards come out at "layers.0.angle" and "layers.0.bands"
  // — the very paths four of the documents above already produce for their own
  // gradients. Concatenating the two would leave `find` returning whichever
  // came first, and the four background pairs would silently be checking the
  // FOREGROUND's ranges: the exact failure the particle layer was moved to
  // index 1 to avoid, one layer down, where moving it is not an option because
  // being first is what makes it the background.
  //
  // `stripes` rather than a plain gradient so the band count is offered at all
  // (linear and radial are one traversal of the ramp and are given none), and a
  // motion on it so its tempo and strength are there to be paired.
  const backgroundFields = describeInspector(normalizeDocument({
    layers: [
      { id: 'bg', type: 'gradient', shape: 'stripes', motions: [{ kind: 'drift' }] },
      { id: 'front', type: 'particles' }
    ]
  }).doc, 'front');
  const backgroundPairs = [
    ['layers.0.angle', 'bgAngle'],
    ['layers.0.bands', 'bgBands'],
    ['layers.0.motions.0.speed', 'bgTempo'],
    ['layers.0.motions.0.amount', 'bgStrength']
  ];

  const check = (list, path, property) => {
    const field = list.find((f) => f.path === path);
    assert.ok(field, `${path} is not offered in the settings column at all`);
    assert.equal(field.min, CONTROL_RANGES[property].min, `${path} min differs from ${property}`);
    assert.equal(field.max, CONTROL_RANGES[property].max, `${path} max differs from ${property}`);
  };

  for (const [path, property] of pairs) check(fields, path, property);
  for (const [path, property] of backgroundPairs) check(backgroundFields, path, property);

  // And the background's four really are the background's: every one of them
  // has to sit under the background heading, or the pairing above would be
  // satisfied by the foreground's own sliders appearing at the same paths.
  for (const [path] of backgroundPairs) {
    assert.equal(backgroundFields.find((f) => f.path === path).section, 'background',
      `${path} was paired with a background range but is not in the background section`);
  }

  // And nothing the exported effect offers is left without a slider: a
  // seventh range added over there has to be answered here.
  assert.deepEqual(
    Object.keys(CONTROL_RANGES).sort(),
    [...pairs, ...backgroundPairs].map(([, property]) => property).sort(),
    'every exported control range must have a slider in the app, and the other way round'
  );
});

test('the dropdowns offer exactly the values the engine accepts', () => {
  const fields = describeInspector(docWith({ motions: [{ kind: 'warp' }] }), 'a1');
  assert.deepEqual(fields.find((f) => f.path === 'layers.0.fit').values, [...FIT_MODES]);
  // A picture layer: every motion but spin — see IMAGE_MOTION_KINDS.
  assert.deepEqual(fields.find((f) => f.type === 'motions').values, [...IMAGE_MOTION_KINDS]);
});

test('a solid layer is offered only the motions a flat colour can perform', () => {
  const doc = normalizeDocument({ layers: [{ id: 'a1', type: 'solid', motions: [{ kind: 'breathe' }] }] }).doc;
  const list = describeInspector(doc, 'a1').find((f) => f.type === 'motions');
  assert.deepEqual(list.values, [...SOLID_MOTION_KINDS]);
});

test('a solid layer that carries a drift anyway keeps it: the offer widens, the value stands', () => {
  // The same rule the sliders follow (widenToInclude) and the same one the
  // exported effect follows (src/export/effect-controls.js). Without it the
  // dropdown would be built from 'none'/'breathe', `select.value = 'drift'`
  // would match no option, and the control would render BLANK — and its first
  // touch would write some other kind into a document that said drift.
  const doc = normalizeDocument({
    layers: [{ id: 'a1', type: 'solid', motions: [{ kind: 'drift' }, { kind: 'breathe' }] }]
  }).doc;
  const list = describeInspector(doc, 'a1').find((f) => f.type === 'motions');
  assert.ok(list.values.includes('drift'), 'a value outside its own options is not a choice');
  // Widened, not replaced: what a solid can perform is still on offer.
  for (const kind of SOLID_MOTION_KINDS) assert.ok(list.values.includes(kind), kind);
  // And every kind the layer actually carries is named, not only the first —
  // field.js builds EVERY row's dropdown from this one array.
  for (const motion of doc.layers[0].motions) {
    assert.ok(list.values.includes(motion.kind), `motion ${motion.kind} has no option to select`);
  }
  assert.equal(new Set(list.values).size, list.values.length, 'no kind may be offered twice');
});

test('the motion list is offered even when there are none, so one can be added', () => {
  const lists = describeInspector(docWith({ motions: [] }), 'a1').filter((f) => f.type === 'motions');
  assert.equal(lists.length, 1);
  // It addresses the layer, not the layer's motions: "no motions" has to mean
  // no field mentioning motions at all (see the second test above).
  assert.equal(lists[0].path, 'layers.0');
});

test('the paths point at the layer that was asked for, not always the first', () => {
  const doc = normalizeDocument({
    layers: [{ id: 'a0', type: 'image' }, { id: 'a1', type: 'image', motions: [{ kind: 'drift' }] }]
  }).doc;
  const paths = describeInspector(doc, 'a1').map((f) => f.path);
  assert.ok(paths.includes('layers.1.fit'), 'the second layer must be addressed as layers.1');
  assert.ok(paths.includes('layers.1.motions.0.speed'));
});

test('a layer type nothing here knows about contributes nothing of its own', () => {
  // normalizeDocument gives a layer of an unknown type no fit, offset, colour
  // or motions at all, so offering those controls would write to paths that do
  // not exist. "shapes" is the next type in the plan and has no renderer, no
  // normalizer branch and no controls yet — which is exactly what makes it the
  // honest stand-in here. ("gradient" used to play this part, and cannot any
  // more: it is a real layer type with real controls of its own.)
  const doc = normalizeDocument({ layers: [{ id: 'a1', type: 'shapes' }] }).doc;
  const fields = describeInspector(doc, 'a1');
  assert.equal(fields.filter((f) => f.path.startsWith('layers.')).length, 0);
  assert.ok(fields.length > 0);
});

// The column is read in three headed sections rather than as one flat list of
// fifteen controls. Which section a field belongs to is arithmetic over the
// document like everything else here, so it is checked here and not in the
// browser.
test('every field says which section it belongs to, and every section has a heading', () => {
  const fields = describeInspector(docWith({ motions: [{ kind: 'warp' }] }), 'a1');
  for (const field of fields) {
    assert.ok(
      Object.hasOwn(SECTION_TITLES, field.section),
      `${field.path} is in the unknown section "${field.section}"`
    );
  }
  assert.equal(fields.find((f) => f.path === 'layers.0.fit').section, 'image');
  assert.equal(fields.find((f) => f.type === 'motions').section, 'motions');
  assert.equal(fields.find((f) => f.path === 'layers.0.motions.0.speed').section, 'motions');
  assert.equal(fields.find((f) => f.path === 'brightness').section, 'colour');
});

// The sections are drawn by walking the list once and starting a new one
// whenever the name changes (see mountInspector), so a field that came back
// to a section already left behind would silently open a second heading with
// the same words on it.
test('a section is never left and returned to', () => {
  const fields = describeInspector(docWith({ motions: [{ kind: 'warp' }, { kind: 'drift' }] }), 'a1');
  const runs = [];
  for (const field of fields) {
    if (runs[runs.length - 1] !== field.section) runs.push(field.section);
  }
  assert.deepEqual(runs, [...new Set(runs)], `a section is opened twice: ${runs.join(', ')}`);
});

// A saved project may legitimately carry a value the sliders do not offer:
// the engine clamps brightness to 0..100 while the slider deliberately stops
// at 5 (and speed at 1), to match the ranges the exported effect's own
// controls use. Without this, opening such a project would show 5 where the
// document says 3 and write 5 back the moment the slider was touched —
// silently changing the user's value.
test('a stored value below the slider range widens that one slider instead of misreporting it', () => {
  const field = { path: 'brightness', type: 'number', labelKey: 'inspector.brightness', min: 5, max: 100, step: 1 };
  const widened = widenToInclude(field, 3);
  assert.equal(widened.min, 3);
  assert.equal(widened.max, 100);
  // Everything else about the field is untouched.
  assert.equal(widened.path, 'brightness');
  assert.equal(widened.step, 1);
});

test('a stored value above the slider range widens it upwards', () => {
  const field = { path: 'saturation', type: 'number', labelKey: 'inspector.saturation', min: 0, max: 200, step: 1 };
  assert.equal(widenToInclude(field, 260).max, 260);
});

test('a value already inside the range hands back the very same field object', () => {
  const field = { path: 'brightness', type: 'number', labelKey: 'inspector.brightness', min: 5, max: 100, step: 1 };
  assert.equal(widenToInclude(field, 40), field);
});

test('only sliders are widened, and only by a real number', () => {
  const select = { path: 'layers.0.fit', type: 'select', labelKey: 'inspector.fit', values: ['cover'] };
  assert.equal(widenToInclude(select, 3), select);
  const field = { path: 'brightness', type: 'number', labelKey: 'inspector.brightness', min: 5, max: 100, step: 1 };
  assert.equal(widenToInclude(field, undefined), field);
  assert.equal(widenToInclude(field, NaN), field);
});
