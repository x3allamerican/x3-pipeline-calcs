/**
 * X3 Pipeline Calcs: the gas pipeline design and MAOP arithmetic in 49 CFR Part 192, with the citation for every
 * factor: design pressure (192.105), design factor (192.111), longitudinal joint factor (192.113), temperature
 * derating (192.115), class location (192.5), test-pressure factors for MAOP (192.619(a)(2)), hoop stress as a
 * percent of SMYS, and the potential impact radius used to find high consequence areas (192.903).
 */
const cfr = (s) => `49 CFR ${s}`;
const round = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
// ---------------------------------------------------------------------------------------------
// Class location (192.5)
// ---------------------------------------------------------------------------------------------
export function classLocation(unit) {
    if (unit.fourStoryPrevalent)
        return { classLocation: 4, reason: 'Buildings with four or more stories are prevalent.', citation: cfr('192.5(b)(4)') };
    if (unit.buildings >= 46)
        return { classLocation: 3, reason: `${unit.buildings} buildings intended for human occupancy (46 or more).`, citation: cfr('192.5(b)(3)(i)') };
    if (unit.assemblyWithin100Yards)
        return { classLocation: 3, reason: 'Within 100 yards of a building or outside area occupied by 20 or more people.', citation: cfr('192.5(b)(3)(ii)') };
    if (unit.offshore)
        return { classLocation: 1, reason: 'Offshore area.', citation: cfr('192.5(b)(1)(i)') };
    if (unit.buildings > 10)
        return { classLocation: 2, reason: `${unit.buildings} buildings (more than 10, fewer than 46).`, citation: cfr('192.5(b)(2)') };
    return { classLocation: 1, reason: `${unit.buildings} buildings (10 or fewer).`, citation: cfr('192.5(b)(1)(ii)') };
}
// ---------------------------------------------------------------------------------------------
// Factors
// ---------------------------------------------------------------------------------------------
export const DESIGN_FACTOR = { 1: 0.72, 2: 0.6, 3: 0.5, 4: 0.4 };
export function designFactor(cls, condition) {
    let F = DESIGN_FACTOR[cls];
    let citation = cfr('192.111(a)');
    if (condition?.startsWith('class1-') && cls === 1) {
        F = Math.min(F, 0.6);
        citation = cfr('192.111(b)');
    }
    if (condition === 'class2-uncased-road-or-railroad' && cls === 2) {
        F = Math.min(F, 0.5);
        citation = cfr('192.111(c)');
    }
    if ((condition === 'station' || condition === 'offshore-platform') && cls <= 2) {
        F = Math.min(F, 0.5);
        citation = cfr('192.111(d)');
    }
    return { F, citation };
}
/** Longitudinal joint factor E (192.113). Common specs; "other" uses 0.80 over 4 inches and 0.60 at 4 inches or less. */
export function jointFactor(pipe) {
    const citation = cfr('192.113');
    if (pipe.seam === 'furnace-butt')
        return { E: 0.6, citation };
    if (!pipe.spec || pipe.spec === 'other')
        return { E: pipe.od > 4 ? 0.8 : 0.6, citation };
    return { E: 1.0, citation };
}
/** Temperature derating factor T (192.115), interpolated between table points; above 450 °F is not covered. */
export function temperatureDerating(gasTempF) {
    const pts = [[250, 1.0], [300, 0.967], [350, 0.933], [400, 0.9], [450, 0.867]];
    if (gasTempF <= 250)
        return { T: 1, citation: cfr('192.115') };
    if (gasTempF > 450)
        throw new Error('192.115 gives derating factors only up to 450 °F.');
    for (let i = 1; i < pts.length; i++) {
        const [t1, f1] = pts[i - 1];
        const [t2, f2] = pts[i];
        if (gasTempF <= t2)
            return { T: round(f1 + ((gasTempF - t1) / (t2 - t1)) * (f2 - f1), 4), citation: cfr('192.115') };
    }
    return { T: 0.867, citation: cfr('192.115') };
}
/** P = (2 S t / D) x F x E x T (192.105). */
export function designPressure(i) {
    if (!(i.smys > 0 && i.wall > 0 && i.od > 0))
        throw new Error('SMYS, wall thickness and outside diameter must be positive.');
    if (i.wall >= i.od / 2)
        throw new Error('Wall thickness must be less than half the outside diameter.');
    const f = designFactor(i.classLocation, i.condition);
    const e = i.E !== undefined ? { E: i.E, citation: cfr('192.113') } : jointFactor({ spec: i.spec, seam: i.seam, od: i.od });
    const t = temperatureDerating(i.gasTempF ?? 60);
    let P = ((2 * i.smys * i.wall) / i.od) * f.F * e.E * t.T;
    if (i.coldExpandedThenHeated)
        P *= 0.75;
    return {
        psig: Math.floor(P),
        factors: { F: f.F, E: e.E, T: t.T },
        formula: `(2 x ${i.smys} x ${i.wall} / ${i.od}) x ${f.F} x ${e.E} x ${t.T}${i.coldExpandedThenHeated ? ' x 0.75' : ''}`,
        citations: [cfr('192.105'), f.citation, e.citation, t.citation],
    };
}
/** Hoop stress as a percent of SMYS (Barlow, S = PD / 2t). Transmission lines include those operating at 20% SMYS or more (192.3). */
export function percentSmys(psig, pipe) {
    return round(((psig * pipe.od) / (2 * pipe.wall) / pipe.smys) * 100, 2);
}
// ---------------------------------------------------------------------------------------------
// MAOP from test pressure (192.619(a)(2))
// ---------------------------------------------------------------------------------------------
/** Divide the post-construction test pressure by this factor (192.619(a)(2), Table 1). */
export function testPressureFactor(seg) {
    if (seg.material === 'plastic')
        return { factor: 1.5, citation: cfr('192.619(a)(2)(i)') };
    if (seg.operatingPsig !== undefined && seg.operatingPsig < 100)
        return { factor: NaN, citation: cfr('192.619(a)(2)(iii)'), note: 'Steel operated below 100 psig: see 192.619(a)(2)(iii).' };
    const c = cfr('192.619(a)(2)(ii), Table 1');
    if (seg.component192153 && seg.installed > '2004-07-14')
        return { factor: 1.3, citation: `${c}, note 2` };
    if (seg.offshore && seg.installed > '1977-07-31')
        return { factor: seg.offshore === 'pipeline' ? 1.25 : 1.5, citation: `${c}, note 1` };
    const col = seg.convertedUnder19214 ? 3 : seg.installed < '1970-11-12' ? 0 : seg.installed < '2020-07-01' ? 1 : 2;
    const table = { 1: [1.1, 1.1, 1.25, 1.25], 2: [1.25, 1.25, 1.25, 1.25], 3: [1.4, 1.5, 1.5, 1.5], 4: [1.4, 1.5, 1.5, 1.5] };
    return { factor: table[seg.classLocation][col], citation: c };
}
/** The lowest of the design pressure, test pressure / factor and any other limit you give (192.619(a)). */
export function maop(input) {
    const limits = [];
    if (input.designPsig !== undefined)
        limits.push({ psig: input.designPsig, why: 'Design pressure of the weakest element', citation: cfr('192.619(a)(1)') });
    if (input.testPsig !== undefined && input.testFactor)
        limits.push({ psig: Math.floor(input.testPsig / input.testFactor), why: `Test pressure ${input.testPsig} / ${input.testFactor}`, citation: cfr('192.619(a)(2)') });
    if (input.historicalPsig !== undefined)
        limits.push({ psig: input.historicalPsig, why: 'Highest actual operating pressure in the look-back period', citation: cfr('192.619(a)(3)') });
    for (const o of input.otherLimits ?? [])
        limits.push({ ...o, citation: cfr('192.619(a)') });
    if (!limits.length)
        throw new Error('Give at least one limit.');
    const low = limits.reduce((a, b) => (b.psig < a.psig ? b : a));
    return { psig: low.psig, controlling: low, limits };
}
// ---------------------------------------------------------------------------------------------
// Potential impact radius (192.903)
// ---------------------------------------------------------------------------------------------
/** PIR in feet for natural gas: r = 0.69 x sqrt(p x d^2), p = MAOP psig, d = nominal diameter inches (192.903). */
export function potentialImpactRadius(maopPsig, diameterIn, factor = 0.69) {
    if (!(maopPsig > 0 && diameterIn > 0))
        throw new Error('MAOP and diameter must be positive.');
    return { feet: round(factor * Math.sqrt(maopPsig * diameterIn * diameterIn), 1), citation: cfr('192.903 (potential impact radius)') };
}
/** Method 1 (iii): in a Class 1 or 2 location, a PIR over 660 ft with 20 or more buildings inside the circle is an HCA (192.903). */
export function hcaByPirOver660(input) {
    const is = (input.classLocation === 1 || input.classLocation === 2) && input.pirFeet > 660 && input.buildingsInCircle >= 20;
    return { highConsequenceArea: is, citation: cfr('192.903 (high consequence area, paragraph (1)(iii))'), note: 'Other HCA tests (Class 3 and 4 locations, identified sites, the 300/660/1000-ft circles in Method 2) are not checked here.' };
}
