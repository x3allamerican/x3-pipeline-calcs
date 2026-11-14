/**
 * X3 Pipeline Calcs: the gas pipeline design and MAOP arithmetic in 49 CFR Part 192, with the citation for every
 * factor: design pressure (192.105), design factor (192.111), longitudinal joint factor (192.113), temperature
 * derating (192.115), class location (192.5), test-pressure factors for MAOP (192.619(a)(2)), hoop stress as a
 * percent of SMYS, and the potential impact radius used to find high consequence areas (192.903).
 */

export type ClassLocation = 1 | 2 | 3 | 4;
const cfr = (s: string) => `49 CFR ${s}`;
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

// ---------------------------------------------------------------------------------------------
// Class location (192.5)
// ---------------------------------------------------------------------------------------------

export function classLocation(unit: {
  /** Buildings intended for human occupancy in the class location unit (220 yards either side of any continuous mile). Each dwelling unit counts separately. */
  buildings: number;
  /** Buildings with four or more stories above ground are prevalent. */
  fourStoryPrevalent?: boolean;
  /** Within 100 yards of a building or small, well-defined outside area occupied by 20 or more people at least 5 days a week for 10 weeks in any 12-month period. */
  assemblyWithin100Yards?: boolean;
  offshore?: boolean;
}): { classLocation: ClassLocation; reason: string; citation: string } {
  if (unit.fourStoryPrevalent) return { classLocation: 4, reason: 'Buildings with four or more stories are prevalent.', citation: cfr('192.5(b)(4)') };
  if (unit.buildings >= 46) return { classLocation: 3, reason: `${unit.buildings} buildings intended for human occupancy (46 or more).`, citation: cfr('192.5(b)(3)(i)') };
  if (unit.assemblyWithin100Yards) return { classLocation: 3, reason: 'Within 100 yards of a building or outside area occupied by 20 or more people.', citation: cfr('192.5(b)(3)(ii)') };
  if (unit.offshore) return { classLocation: 1, reason: 'Offshore area.', citation: cfr('192.5(b)(1)(i)') };
  if (unit.buildings > 10) return { classLocation: 2, reason: `${unit.buildings} buildings (more than 10, fewer than 46).`, citation: cfr('192.5(b)(2)') };
  return { classLocation: 1, reason: `${unit.buildings} buildings (10 or fewer).`, citation: cfr('192.5(b)(1)(ii)') };
}

// ---------------------------------------------------------------------------------------------
// Factors
// ---------------------------------------------------------------------------------------------

export const DESIGN_FACTOR: Record<ClassLocation, number> = { 1: 0.72, 2: 0.6, 3: 0.5, 4: 0.4 };

/** Situations that require a lower design factor (192.111(b)-(d)). */
export type DesignFactorCondition =
  | 'class1-uncased-unimproved-road' | 'class1-uncased-or-parallel-road-or-railroad' | 'class1-on-bridge' | 'class1-fabricated-assembly'
  | 'class2-uncased-road-or-railroad' | 'station' | 'offshore-platform';

export function designFactor(cls: ClassLocation, condition?: DesignFactorCondition): { F: number; citation: string } {
  let F = DESIGN_FACTOR[cls];
  let citation = cfr('192.111(a)');
  if (condition?.startsWith('class1-') && cls === 1) { F = Math.min(F, 0.6); citation = cfr('192.111(b)'); }
  if (condition === 'class2-uncased-road-or-railroad' && cls === 2) { F = Math.min(F, 0.5); citation = cfr('192.111(c)'); }
  if ((condition === 'station' || condition === 'offshore-platform') && cls <= 2) { F = Math.min(F, 0.5); citation = cfr('192.111(d)'); }
  return { F, citation };
}

/** Longitudinal joint factor E (192.113). Common specs; "other" uses 0.80 over 4 inches and 0.60 at 4 inches or less. */
export function jointFactor(pipe: { spec?: 'API 5L' | 'ASTM A53' | 'ASTM A106' | 'ASTM A333' | 'ASTM A381' | 'ASTM A671' | 'ASTM A672' | 'ASTM A691' | 'other'; seam?: 'seamless' | 'erw' | 'efw' | 'flash' | 'saw' | 'dsaw' | 'furnace-butt'; od: number }): { E: number; citation: string } {
  const citation = cfr('192.113');
  if (pipe.seam === 'furnace-butt') return { E: 0.6, citation };
  if (!pipe.spec || pipe.spec === 'other') return { E: pipe.od > 4 ? 0.8 : 0.6, citation };
  return { E: 1.0, citation };
}

/** Temperature derating factor T (192.115), interpolated between table points; above 450 °F is not covered. */
export function temperatureDerating(gasTempF: number): { T: number; citation: string } {
  const pts: Array<[number, number]> = [[250, 1.0], [300, 0.967], [350, 0.933], [400, 0.9], [450, 0.867]];
  if (gasTempF <= 250) return { T: 1, citation: cfr('192.115') };
  if (gasTempF > 450) throw new Error('192.115 gives derating factors only up to 450 °F.');
  for (let i = 1; i < pts.length; i++) {
    const [t1, f1] = pts[i - 1]; const [t2, f2] = pts[i];
    if (gasTempF <= t2) return { T: round(f1 + ((gasTempF - t1) / (t2 - t1)) * (f2 - f1), 4), citation: cfr('192.115') };
  }
  return { T: 0.867, citation: cfr('192.115') };
}

// ---------------------------------------------------------------------------------------------
// Design pressure and stress
// ---------------------------------------------------------------------------------------------

export interface DesignInput {
  /** Specified minimum yield strength, psi (e.g. 52000 for X52). */
  smys: number;
  /** Nominal wall thickness, inches. */
  wall: number;
  /** Nominal outside diameter, inches. */
  od: number;
  classLocation: ClassLocation;
  condition?: DesignFactorCondition;
  /** Joint factor E, or the pipe spec and seam to look it up. */
  E?: number;
  spec?: Parameters<typeof jointFactor>[0]['spec'];
  seam?: Parameters<typeof jointFactor>[0]['seam'];
  gasTempF?: number;
  /** Cold-expanded pipe later heated above 900 °F, or above 600 °F for over an hour (192.105(b)). */
  coldExpandedThenHeated?: boolean;
}

/** P = (2 S t / D) x F x E x T (192.105). */
export function designPressure(i: DesignInput) {
  if (!(i.smys > 0 && i.wall > 0 && i.od > 0)) throw new Error('SMYS, wall thickness and outside diameter must be positive.');
  if (i.wall >= i.od / 2) throw new Error('Wall thickness must be less than half the outside diameter.');
  const f = designFactor(i.classLocation, i.condition);
  const e = i.E !== undefined ? { E: i.E, citation: cfr('192.113') } : jointFactor({ spec: i.spec, seam: i.seam, od: i.od });
  const t = temperatureDerating(i.gasTempF ?? 60);
  let P = ((2 * i.smys * i.wall) / i.od) * f.F * e.E * t.T;
  if (i.coldExpandedThenHeated) P *= 0.75;
  return {
    psig: Math.floor(P),
    factors: { F: f.F, E: e.E, T: t.T },
    formula: `(2 x ${i.smys} x ${i.wall} / ${i.od}) x ${f.F} x ${e.E} x ${t.T}${i.coldExpandedThenHeated ? ' x 0.75' : ''}`,
    citations: [cfr('192.105'), f.citation, e.citation, t.citation],
  };
}

/** Hoop stress as a percent of SMYS (Barlow, S = PD / 2t). Transmission lines include those operating at 20% SMYS or more (192.3). */
export function percentSmys(psig: number, pipe: { smys: number; wall: number; od: number }): number {
  return round(((psig * pipe.od) / (2 * pipe.wall) / pipe.smys) * 100, 2);
}

// ---------------------------------------------------------------------------------------------
// MAOP from test pressure (192.619(a)(2))
// ---------------------------------------------------------------------------------------------

/** Divide the post-construction test pressure by this factor (192.619(a)(2), Table 1). */
export function testPressureFactor(seg: {
  material: 'steel' | 'plastic';
  classLocation: ClassLocation;
  /** Date the segment was installed, uprated or converted (YYYY-MM-DD). */
  installed: string;
  convertedUnder19214?: boolean;
  /** Offshore segments installed, uprated or converted after July 31, 1977. */
  offshore?: 'pipeline' | 'platform-or-riser';
  /** Component with design pressure under 192.153(a) or (b) installed after July 14, 2004. */
  component192153?: boolean;
  /** Steel operated below 100 psig uses (a)(2)(iii) instead; flag it. */
  operatingPsig?: number;
}): { factor: number; citation: string; note?: string } {
  if (seg.material === 'plastic') return { factor: 1.5, citation: cfr('192.619(a)(2)(i)') };
  if (seg.operatingPsig !== undefined && seg.operatingPsig < 100) return { factor: NaN, citation: cfr('192.619(a)(2)(iii)'), note: 'Steel operated below 100 psig: see 192.619(a)(2)(iii).' };
  const c = cfr('192.619(a)(2)(ii), Table 1');
  if (seg.component192153 && seg.installed > '2004-07-14') return { factor: 1.3, citation: `${c}, note 2` };
  if (seg.offshore && seg.installed > '1977-07-31') return { factor: seg.offshore === 'pipeline' ? 1.25 : 1.5, citation: `${c}, note 1` };
  const col = seg.convertedUnder19214 ? 3 : seg.installed < '1970-11-12' ? 0 : seg.installed < '2020-07-01' ? 1 : 2;
  const table: Record<ClassLocation, number[]> = { 1: [1.1, 1.1, 1.25, 1.25], 2: [1.25, 1.25, 1.25, 1.25], 3: [1.4, 1.5, 1.5, 1.5], 4: [1.4, 1.5, 1.5, 1.5] };
  return { factor: table[seg.classLocation][col], citation: c };
}

/** The lowest of the design pressure, test pressure / factor and any other limit you give (192.619(a)). */
export function maop(input: { designPsig?: number; testPsig?: number; testFactor?: number; historicalPsig?: number; otherLimits?: Array<{ psig: number; why: string }> }) {
  const limits: Array<{ psig: number; why: string; citation: string }> = [];
  if (input.designPsig !== undefined) limits.push({ psig: input.designPsig, why: 'Design pressure of the weakest element', citation: cfr('192.619(a)(1)') });
  if (input.testPsig !== undefined && input.testFactor) limits.push({ psig: Math.floor(input.testPsig / input.testFactor), why: `Test pressure ${input.testPsig} / ${input.testFactor}`, citation: cfr('192.619(a)(2)') });
  if (input.historicalPsig !== undefined) limits.push({ psig: input.historicalPsig, why: 'Highest actual operating pressure in the look-back period', citation: cfr('192.619(a)(3)') });
  for (const o of input.otherLimits ?? []) limits.push({ ...o, citation: cfr('192.619(a)') });
  if (!limits.length) throw new Error('Give at least one limit.');
  const low = limits.reduce((a, b) => (b.psig < a.psig ? b : a));
  return { psig: low.psig, controlling: low, limits };
}

// ---------------------------------------------------------------------------------------------
// Potential impact radius (192.903)
// ---------------------------------------------------------------------------------------------

/** PIR in feet for natural gas: r = 0.69 x sqrt(p x d^2), p = MAOP psig, d = nominal diameter inches (192.903). */
export function potentialImpactRadius(maopPsig: number, diameterIn: number, factor = 0.69): { feet: number; citation: string } {
  if (!(maopPsig > 0 && diameterIn > 0)) throw new Error('MAOP and diameter must be positive.');
  return { feet: round(factor * Math.sqrt(maopPsig * diameterIn * diameterIn), 1), citation: cfr('192.903 (potential impact radius)') };
}

/** Method 1 (iii): in a Class 1 or 2 location, a PIR over 660 ft with 20 or more buildings inside the circle is an HCA (192.903). */
export function hcaByPirOver660(input: { classLocation: ClassLocation; pirFeet: number; buildingsInCircle: number }) {
  const is = (input.classLocation === 1 || input.classLocation === 2) && input.pirFeet > 660 && input.buildingsInCircle >= 20;
  return { highConsequenceArea: is, citation: cfr('192.903 (high consequence area, paragraph (1)(iii))'), note: 'Other HCA tests (Class 3 and 4 locations, identified sites, the 300/660/1000-ft circles in Method 2) are not checked here.' };
}
