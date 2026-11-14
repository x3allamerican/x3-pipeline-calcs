import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classLocation, designFactor, jointFactor, temperatureDerating, designPressure, percentSmys, testPressureFactor, maop, potentialImpactRadius, hcaByPirOver660 } from '../src/index.ts';

test('class location (192.5)', () => {
  assert.equal(classLocation({ buildings: 10 }).classLocation, 1);
  assert.equal(classLocation({ buildings: 11 }).classLocation, 2);
  assert.equal(classLocation({ buildings: 46 }).classLocation, 3);
  assert.equal(classLocation({ buildings: 3, assemblyWithin100Yards: true }).citation, '49 CFR 192.5(b)(3)(ii)');
  assert.equal(classLocation({ buildings: 200, fourStoryPrevalent: true }).classLocation, 4);
});

test('design factor and its lower limits (192.111)', () => {
  assert.deepEqual([1, 2, 3, 4].map((c) => designFactor(c as 1).F), [0.72, 0.6, 0.5, 0.4]);
  assert.equal(designFactor(1, 'class1-on-bridge').F, 0.6);
  assert.equal(designFactor(2, 'class2-uncased-road-or-railroad').F, 0.5);
  assert.equal(designFactor(1, 'station').F, 0.5);
  assert.equal(designFactor(3, 'station').F, 0.5);
});

test('joint factor and temperature derating (192.113, 192.115)', () => {
  assert.equal(jointFactor({ spec: 'API 5L', seam: 'erw', od: 12.75 }).E, 1);
  assert.equal(jointFactor({ spec: 'ASTM A53', seam: 'furnace-butt', od: 2.375 }).E, 0.6);
  assert.equal(jointFactor({ spec: 'other', od: 6.625 }).E, 0.8);
  assert.equal(temperatureDerating(200).T, 1);
  assert.equal(temperatureDerating(325).T, 0.95);
  assert.throws(() => temperatureDerating(500), /450/);
});

test('design pressure: 12.75 x 0.250 X52, Class 1 (192.105)', () => {
  const r = designPressure({ smys: 52000, wall: 0.25, od: 12.75, classLocation: 1, spec: 'API 5L', seam: 'erw' });
  // 2 x 52000 x 0.25 / 12.75 = 2039.2; x 0.72 = 1468.2
  assert.equal(r.psig, 1468);
  assert.deepEqual(r.factors, { F: 0.72, E: 1, T: 1 });
  assert.equal(designPressure({ smys: 52000, wall: 0.25, od: 12.75, classLocation: 3, spec: 'API 5L' }).psig, 1019);
  assert.equal(designPressure({ smys: 52000, wall: 0.25, od: 12.75, classLocation: 1, spec: 'API 5L', coldExpandedThenHeated: true }).psig, 1101);
  assert.throws(() => designPressure({ smys: 52000, wall: 7, od: 12.75, classLocation: 1 }), /half/);
});

test('percent SMYS', () => {
  assert.equal(percentSmys(1468, { smys: 52000, wall: 0.25, od: 12.75 }), 71.99);
});

test('test pressure factors (192.619(a)(2), Table 1)', () => {
  assert.equal(testPressureFactor({ material: 'steel', classLocation: 1, installed: '1965-05-01' }).factor, 1.1);
  assert.equal(testPressureFactor({ material: 'steel', classLocation: 1, installed: '2021-03-01' }).factor, 1.25);
  assert.equal(testPressureFactor({ material: 'steel', classLocation: 3, installed: '1965-05-01' }).factor, 1.4);
  assert.equal(testPressureFactor({ material: 'steel', classLocation: 3, installed: '1999-05-01' }).factor, 1.5);
  assert.equal(testPressureFactor({ material: 'plastic', classLocation: 2, installed: '1999-05-01' }).factor, 1.5);
  assert.equal(testPressureFactor({ material: 'steel', classLocation: 1, installed: '2010-01-01', offshore: 'platform-or-riser' }).factor, 1.5);
  assert.equal(testPressureFactor({ material: 'steel', classLocation: 1, installed: '2010-01-01', component192153: true }).factor, 1.3);
});

test('MAOP is the lowest limit (192.619(a))', () => {
  const r = maop({ designPsig: 1468, testPsig: 1800, testFactor: 1.25, historicalPsig: 1500 });
  assert.equal(r.psig, 1440);
  assert.equal(r.controlling.citation, '49 CFR 192.619(a)(2)');
});

test('potential impact radius and the 660-ft HCA test (192.903)', () => {
  // 0.69 x sqrt(1000 x 30^2) = 0.69 x 948.68 = 654.6 ft
  assert.equal(potentialImpactRadius(1000, 30).feet, 654.6);
  const pir = potentialImpactRadius(1200, 36).feet;
  assert.equal(pir, 860.5);
  assert.equal(hcaByPirOver660({ classLocation: 1, pirFeet: pir, buildingsInCircle: 25 }).highConsequenceArea, true);
  assert.equal(hcaByPirOver660({ classLocation: 1, pirFeet: 654.6, buildingsInCircle: 25 }).highConsequenceArea, false);
});
