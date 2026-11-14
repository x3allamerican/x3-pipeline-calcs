/**
 * X3 Pipeline Calcs: the gas pipeline design and MAOP arithmetic in 49 CFR Part 192, with the citation for every
 * factor: design pressure (192.105), design factor (192.111), longitudinal joint factor (192.113), temperature
 * derating (192.115), class location (192.5), test-pressure factors for MAOP (192.619(a)(2)), hoop stress as a
 * percent of SMYS, and the potential impact radius used to find high consequence areas (192.903).
 */
export type ClassLocation = 1 | 2 | 3 | 4;
export declare function classLocation(unit: {
    /** Buildings intended for human occupancy in the class location unit (220 yards either side of any continuous mile). Each dwelling unit counts separately. */
    buildings: number;
    /** Buildings with four or more stories above ground are prevalent. */
    fourStoryPrevalent?: boolean;
    /** Within 100 yards of a building or small, well-defined outside area occupied by 20 or more people at least 5 days a week for 10 weeks in any 12-month period. */
    assemblyWithin100Yards?: boolean;
    offshore?: boolean;
}): {
    classLocation: ClassLocation;
    reason: string;
    citation: string;
};
export declare const DESIGN_FACTOR: Record<ClassLocation, number>;
/** Situations that require a lower design factor (192.111(b)-(d)). */
export type DesignFactorCondition = 'class1-uncased-unimproved-road' | 'class1-uncased-or-parallel-road-or-railroad' | 'class1-on-bridge' | 'class1-fabricated-assembly' | 'class2-uncased-road-or-railroad' | 'station' | 'offshore-platform';
export declare function designFactor(cls: ClassLocation, condition?: DesignFactorCondition): {
    F: number;
    citation: string;
};
/** Longitudinal joint factor E (192.113). Common specs; "other" uses 0.80 over 4 inches and 0.60 at 4 inches or less. */
export declare function jointFactor(pipe: {
    spec?: 'API 5L' | 'ASTM A53' | 'ASTM A106' | 'ASTM A333' | 'ASTM A381' | 'ASTM A671' | 'ASTM A672' | 'ASTM A691' | 'other';
    seam?: 'seamless' | 'erw' | 'efw' | 'flash' | 'saw' | 'dsaw' | 'furnace-butt';
    od: number;
}): {
    E: number;
    citation: string;
};
/** Temperature derating factor T (192.115), interpolated between table points; above 450 °F is not covered. */
export declare function temperatureDerating(gasTempF: number): {
    T: number;
    citation: string;
};
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
export declare function designPressure(i: DesignInput): {
    psig: number;
    factors: {
        F: number;
        E: number;
        T: number;
    };
    formula: string;
    citations: string[];
};
/** Hoop stress as a percent of SMYS (Barlow, S = PD / 2t). Transmission lines include those operating at 20% SMYS or more (192.3). */
export declare function percentSmys(psig: number, pipe: {
    smys: number;
    wall: number;
    od: number;
}): number;
/** Divide the post-construction test pressure by this factor (192.619(a)(2), Table 1). */
export declare function testPressureFactor(seg: {
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
}): {
    factor: number;
    citation: string;
    note?: string;
};
/** The lowest of the design pressure, test pressure / factor and any other limit you give (192.619(a)). */
export declare function maop(input: {
    designPsig?: number;
    testPsig?: number;
    testFactor?: number;
    historicalPsig?: number;
    otherLimits?: Array<{
        psig: number;
        why: string;
    }>;
}): {
    psig: number;
    controlling: {
        psig: number;
        why: string;
        citation: string;
    };
    limits: {
        psig: number;
        why: string;
        citation: string;
    }[];
};
/** PIR in feet for natural gas: r = 0.69 x sqrt(p x d^2), p = MAOP psig, d = nominal diameter inches (192.903). */
export declare function potentialImpactRadius(maopPsig: number, diameterIn: number, factor?: number): {
    feet: number;
    citation: string;
};
/** Method 1 (iii): in a Class 1 or 2 location, a PIR over 660 ft with 20 or more buildings inside the circle is an HCA (192.903). */
export declare function hcaByPirOver660(input: {
    classLocation: ClassLocation;
    pirFeet: number;
    buildingsInCircle: number;
}): {
    highConsequenceArea: boolean;
    citation: string;
    note: string;
};
