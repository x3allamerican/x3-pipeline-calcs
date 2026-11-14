# X3 Pipeline Calcs

**The steel gas pipeline arithmetic in 49 CFR Part 192, with the citation for every factor.** Design pressure, design factor, joint factor, temperature derating, class location, MAOP from test pressure, percent SMYS and potential impact radius.

**[Try the calculator →](https://x3allamerican.github.io/x3-pipeline-calcs/)**

Built and maintained by **[X3 Pipeline](https://x3pipeline.com)**.

## Install

```sh
npm install x3-pipeline-calcs
```

## Use

```ts
import { classLocation, designPressure, testPressureFactor, maop, percentSmys, potentialImpactRadius, hcaByPirOver660 } from 'x3-pipeline-calcs';

const cls = classLocation({ buildings: 8 });                       // Class 1, 49 CFR 192.5(b)(1)(ii)
const d = designPressure({ smys: 52000, wall: 0.25, od: 12.75, classLocation: 1, spec: 'API 5L', seam: 'erw' });
d.psig;      // 1468  = (2 x 52000 x 0.25 / 12.75) x 0.72 x 1 x 1
d.citations; // ['49 CFR 192.105', '49 CFR 192.111(a)', '49 CFR 192.113', '49 CFR 192.115']

const f = testPressureFactor({ material: 'steel', classLocation: 1, installed: '2008-06-01' }); // 1.1
const m = maop({ designPsig: d.psig, testPsig: 1800, testFactor: f.factor });                  // lowest limit, with which one controls
percentSmys(m.psig, { smys: 52000, wall: 0.25, od: 12.75 });
potentialImpactRadius(m.psig, 12.75);                                                          // feet, 192.903
```

## Rules covered

| Function | Rule |
|---|---|
| `classLocation` | 192.5(b): 10 or fewer, 11-45, 46+ buildings; places of public assembly within 100 yards; four-story buildings |
| `designFactor` | 192.111(a)-(d): 0.72 / 0.60 / 0.50 / 0.40 and the crossing, bridge, station and platform limits |
| `jointFactor` | 192.113 |
| `temperatureDerating` | 192.115, interpolated, to 450 °F |
| `designPressure` | 192.105(a)-(b) |
| `testPressureFactor`, `maop` | 192.619(a)(1)-(3), Table 1 with its footnotes |
| `potentialImpactRadius`, `hcaByPirOver660` | 192.903 |

## Limits

Decision support for qualified people, not engineering sign-off or legal advice. Steel gas pipe only; plastic pipe design (192.121), hazardous liquids (Part 195), the full MAOP rules in 192.619(a)(4)-(c), 192.620 and 192.624, and the other HCA tests are not covered.

## Develop

```sh
npm install
npm test
npm run build
```

## License

MIT. Free for any use, including commercial.

---

**[X3 Pipeline](https://x3pipeline.com)** runs integrity, damage prevention, operator qualification and the rest of a PHMSA program in one place.
