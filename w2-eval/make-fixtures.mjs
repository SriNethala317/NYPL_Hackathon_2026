#!/usr/bin/env node
/**
 * Builds the W-2 fixture corpus.
 *
 *   node make-fixtures.mjs            # renders into ./fixtures
 *   CHROME_BIN=chromium node make-fixtures.mjs
 *
 * ## Ground truth is authored, then rendered from
 *
 * The eval spec asks for hand-written truth, on the grounds that "ground truth produced by one of
 * the systems under test is worthless." That reasoning is right and this satisfies it more
 * strongly than transcription does: the data below is written first and the image is generated
 * from it, so the truth never passes through an extractor and never through a human's eyes either.
 * Hand-transcribing 40 boxes across 13 fixtures would introduce exactly the errors the truth
 * exists to rule out.
 *
 * The technique is lifted from `scripts/make-ocr-corpus.mjs` in the app — author a record, render
 * HTML from it via headless Chrome, write both. It lives here rather than extending that script
 * because the two have different lifecycles: that one wipes `docs/ocr-corpus/` on every run and
 * serves the app's five document types, while this one serves the bake-off alone.
 *
 * ## Everything is fabricated
 *
 * SSNs come from the 900-99 range, which the SSA has never issued and never will. Employers and
 * addresses are invented. Committing a photograph of a real W-2 would hand out exactly the data
 * this project exists to protect, and the free tiers both tracks call may retain what they are
 * sent.
 *
 * ## These are rendered, not photographed
 *
 * A synthetic image that was never printed lacks real capture artefacts, so both tracks will score
 * higher here than on a photograph of a real form. The report says so. Printing a subset and
 * photographing it is the next pass; drop the photographs in beside a matching `.truth.json` and
 * they are picked up with no code change.
 */

import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'fixtures');
const CHROME = process.env.CHROME_BIN ?? 'google-chrome';

/* ------------------------------------------------------------------ people */

/**
 * Four employees, chosen to cover the content dimensions the spec asks for: single state,
 * multi-state, several box-12 codes, a populated box 14, and an empty box 12.
 *
 * Every set of figures is internally consistent — box 4 is exactly 6.2% of box 3 and box 6 exactly
 * 1.45% of box 5 — so the validators pass on ground truth. A fixture whose own arithmetic is
 * broken would make every engine look like it hallucinated.
 */
const PEOPLE = {
  maria: {
    employee_name: 'MARIA REYES',
    employee_address: '1240 GRAND CONCOURSE, BRONX, NY 10456',
    employee_ssn: '900-99-1234',
    employer_name: 'ATLAS HOME CARE INC',
    employer_address: '77 WATER ST, NEW YORK, NY 10005',
    employer_ein: '13-4567890',
    control_number: 'A-0042719',
    tax_year: '2025',
    box1_wages: '27720.00',
    box2_federal_tax: '1980.00',
    box3_ss_wages: '29000.00',
    box4_ss_tax: '1798.00',
    box5_medicare_wages: '29000.00',
    box6_medicare_tax: '420.50',
    box13_retirement_plan: true,
    box12: [
      { code: 'D', amount: '1280.00' },
      { code: 'DD', amount: '9100.00' },
    ],
    box14_other: [],
    state_items: [
      {
        state: 'NY',
        employer_state_id: '13-4567890',
        state_wages: '29000.00',
        state_tax: '1450.00',
        local_wages: '29000.00',
        local_tax: '890.00',
        locality_name: 'NYC',
      },
    ],
  },

  daniel: {
    employee_name: 'DANIEL OKONKWO',
    employee_address: '512 BERGENLINE AVE, UNION CITY, NJ 07087',
    employee_ssn: '900-99-5567',
    employer_name: 'HARBORLIGHT LOGISTICS LLC',
    employer_address: '1900 PORT RD, ELIZABETH, NJ 07201',
    employer_ein: '22-7788990',
    control_number: 'HL-99213',
    tax_year: '2025',
    box1_wages: '61450.00',
    box2_federal_tax: '7310.00',
    box3_ss_wages: '64200.00',
    box4_ss_tax: '3980.40',
    box5_medicare_wages: '64200.00',
    box6_medicare_tax: '930.90',
    box13_retirement_plan: true,
    box12: [{ code: 'D', amount: '2750.00' }],
    box14_other: [],
    // Multi-state: the row-repetition case, and the one most likely to be read as a single row.
    state_items: [
      {
        state: 'NY',
        employer_state_id: '22-7788990',
        state_wages: '40000.00',
        state_tax: '2100.00',
        local_wages: null,
        local_tax: null,
        locality_name: null,
      },
      {
        state: 'NJ',
        employer_state_id: '22-7788990-000',
        state_wages: '24200.00',
        state_tax: '980.00',
        local_wages: null,
        local_tax: null,
        locality_name: null,
      },
    ],
  },

  priya: {
    employee_name: 'PRIYA RAMACHANDRAN',
    employee_address: '88 STEINWAY ST, ASTORIA, NY 11103',
    employee_ssn: '900-99-3311',
    employer_name: 'NORTHSIDE DENTAL GROUP PC',
    employer_address: '410 QUEENS BLVD, QUEENS, NY 11101',
    employer_ein: '45-1122334',
    control_number: null,
    tax_year: '2025',
    box1_wages: '43800.00',
    box2_federal_tax: '4120.00',
    box3_ss_wages: '43800.00',
    box4_ss_tax: '2715.60',
    box5_medicare_wages: '43800.00',
    box6_medicare_tax: '635.10',
    box13_retirement_plan: false,
    // Empty box 12 -- an engine must abstain rather than invent a row.
    box12: [],
    box14_other: [
      { label: 'NY SDI', amount: '31.20' },
      { label: 'NY PFL', amount: '154.00' },
    ],
    state_items: [
      {
        state: 'NY',
        employer_state_id: '45-1122334',
        state_wages: '43800.00',
        state_tax: '2190.00',
        local_wages: '43800.00',
        local_tax: '1314.00',
        locality_name: 'NYC',
      },
    ],
  },

  tomas: {
    employee_name: 'TOMÁS FERREIRA-LUZ',
    employee_address: '3301 CHURCH AVE, BROOKLYN, NY 11226',
    employee_ssn: '900-99-8842',
    employer_name: 'MERIDIAN SOFTWARE PARTNERS',
    employer_address: '1 METROTECH CTR, BROOKLYN, NY 11201',
    employer_ein: '81-5566778',
    control_number: 'MSP-2025-0417',
    tax_year: '2025',
    box1_wages: '52300.00',
    box2_federal_tax: '5890.00',
    box3_ss_wages: '56800.00',
    box4_ss_tax: '3521.60',
    box5_medicare_wages: '56800.00',
    box6_medicare_tax: '823.60',
    box13_retirement_plan: true,
    // Several codes, including one two-letter and one easily confused with a digit.
    box12: [
      { code: 'D', amount: '3200.00' },
      { code: 'DD', amount: '11400.00' },
      { code: 'W', amount: '1300.00' },
    ],
    box14_other: [],
    state_items: [
      {
        state: 'NY',
        employer_state_id: '81-5566778',
        state_wages: '56800.00',
        state_tax: '2840.00',
        local_wages: '56800.00',
        local_tax: '1704.00',
        locality_name: 'NYC',
      },
    ],
  },
};

/**
 * Fills the schema's absent fields so a truth file always parses, then blanks anything the chosen
 * layout does not actually print.
 *
 * `omits` is the important half and it was learned the hard way. The first version of this file
 * built truth from the person alone, so the 4-up fixture claimed a control number and a ticked
 * Box 13 retirement plan that its layout never renders. Gemini correctly returned null for both and
 * was scored as having missed them — the corpus was penalising an engine for being right, and
 * rewarding one that guessed. Ground truth describes the image on the page, never the employee
 * behind it.
 */
function truthFor(person, omits = [], overrides = {}) {
  const truth = {
    employee_ssn: null,
    employer_ein: null,
    employer_name: null,
    employer_address: null,
    employee_name: null,
    employee_address: null,
    control_number: null,
    box1_wages: null,
    box2_federal_tax: null,
    box3_ss_wages: null,
    box4_ss_tax: null,
    box5_medicare_wages: null,
    box6_medicare_tax: null,
    box7_ss_tips: null,
    box8_allocated_tips: null,
    box10_dependent_care: null,
    box11_nonqualified: null,
    box12: [],
    box13_statutory_employee: false,
    box13_retirement_plan: null,
    box13_third_party_sick: false,
    box14_other: [],
    state_items: [],
    tax_year: null,
    as_of: person.tax_year ? `${person.tax_year}-12-31` : null,
    ...person,
    ...overrides,
  };

  for (const field of omits) truth[field] = Array.isArray(truth[field]) ? [] : null;
  return truth;
}

/* ----------------------------------------------------------------- layouts */

const money = (v) => (v === null || v === undefined ? '' : v);

function box(n, label, value, extra = '') {
  return `<div class="box ${extra}"><span class="n">${n}</span><span class="lbl">${label}</span><span class="val">${money(value)}</span></div>`;
}

function box12Rows(entries) {
  const slots = ['12a', '12b', '12c', '12d'];
  return slots
    .map((slot, i) => {
      const e = entries[i];
      return `<div class="b12"><span class="slot">${slot}</span><span class="code">${e ? e.code : ''}</span><span class="amt">${e ? e.amount : ''}</span></div>`;
    })
    .join('');
}

function stateRows(items, cols = true) {
  const rows = items
    .map(
      (s) =>
        `<tr><td>${s.state ?? ''}</td><td>${s.employer_state_id ?? ''}</td><td>${money(s.state_wages)}</td><td>${money(s.state_tax)}</td><td>${money(s.local_wages)}</td><td>${money(s.local_tax)}</td><td>${s.locality_name ?? ''}</td></tr>`,
    )
    .join('');
  if (!cols) return rows;
  return `<table class="states"><thead><tr><th>15 State</th><th>Employer's state ID</th><th>16 State wages</th><th>17 State income tax</th><th>18 Local wages</th><th>19 Local income tax</th><th>20 Locality</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const BASE_CSS = `
*{box-sizing:border-box}
body{margin:0;padding:26px;font-family:"DejaVu Sans",Arial,Helvetica,sans-serif;background:#fff;color:#111;font-size:12px}
.box{border:1px solid #444;padding:5px 7px;min-height:44px;position:relative}
.box .n{font-weight:700;margin-right:5px;font-size:10px}
.box .lbl{font-size:9.5px;text-transform:uppercase;letter-spacing:.2px}
.box .val{display:block;margin-top:7px;font-size:15px;font-weight:600}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:-1px}
.grid2>*{margin:-0.5px}
.b12{display:flex;gap:8px;border:1px solid #444;padding:3px 6px;align-items:center;min-height:24px}
.b12 .slot{font-size:9px;font-weight:700;width:26px}
.b12 .code{font-weight:700;width:30px}
.b12 .amt{font-weight:600}
.states{width:100%;border-collapse:collapse;margin-top:8px;font-size:10px}
.states th{background:#eee;border:1px solid #444;padding:3px;font-size:8.5px;text-align:left}
.states td{border:1px solid #444;padding:5px 4px;font-weight:600;font-size:11px}
.hdr{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px}
.ident{border:1px solid #444;padding:5px 7px;margin-bottom:-1px}
.ident .lbl{font-size:9px;text-transform:uppercase}
.ident .val{font-weight:600;font-size:13px;margin-top:3px}
.cb{display:inline-block;width:11px;height:11px;border:1px solid #333;margin-right:4px;vertical-align:-1px;text-align:center;line-height:10px;font-size:10px}
`;

/**
 * The official IRS form: red-ink rules, the standard two-column box grid, boxes in their real
 * positions. This is the layout an anchor parser should handle best, so it is the control.
 */
function irsRedInk(p) {
  return `
<style>${BASE_CSS}
body{color:#111}
.box,.b12,.ident,.states td,.states th{border-color:#B22234}
.states th{background:#fdeaec}
.hdr .title{color:#B22234;font-weight:700;font-size:17px}
.void{color:#B22234;font-size:9px}
</style>
<div class="hdr"><div><span class="void">22222</span> <span class="title">Form W-2 Wage and Tax Statement</span></div><div><b>${p.tax_year}</b><br><span style="font-size:9px">Department of the Treasury — IRS</span></div></div>
<div class="ident"><div class="lbl">b Employer identification number (EIN)</div><div class="val">${p.employer_ein}</div></div>
<div class="ident"><div class="lbl">c Employer's name, address, and ZIP code</div><div class="val">${p.employer_name}<br>${p.employer_address}</div></div>
<div class="ident"><div class="lbl">d Control number</div><div class="val">${p.control_number ?? ''}</div></div>
<div class="ident"><div class="lbl">a Employee's social security number</div><div class="val">${p.employee_ssn}</div></div>
<div class="ident"><div class="lbl">e Employee's first name and initial, Last name</div><div class="val">${p.employee_name}</div></div>
<div class="ident"><div class="lbl">f Employee's address and ZIP code</div><div class="val">${p.employee_address}</div></div>
<div class="grid2">
  ${box(1, 'Wages, tips, other compensation', p.box1_wages)}
  ${box(2, 'Federal income tax withheld', p.box2_federal_tax)}
  ${box(3, 'Social security wages', p.box3_ss_wages)}
  ${box(4, 'Social security tax withheld', p.box4_ss_tax)}
  ${box(5, 'Medicare wages and tips', p.box5_medicare_wages)}
  ${box(6, 'Medicare tax withheld', p.box6_medicare_tax)}
  ${box(7, 'Social security tips', p.box7_ss_tips)}
  ${box(8, 'Allocated tips', p.box8_allocated_tips)}
  ${box(10, 'Dependent care benefits', p.box10_dependent_care)}
  ${box(11, 'Nonqualified plans', p.box11_nonqualified)}
</div>
<div class="grid2" style="margin-top:6px">
  <div class="box"><span class="n">13</span><span class="lbl">
    <span class="cb">${p.box13_statutory_employee ? 'X' : ''}</span>Statutory employee
    <span class="cb">${p.box13_retirement_plan ? 'X' : ''}</span>Retirement plan
    <span class="cb">${p.box13_third_party_sick ? 'X' : ''}</span>Third-party sick pay</span></div>
  <div><div style="font-size:9px;font-weight:700">12 See instructions for box 12</div>${box12Rows(p.box12)}</div>
</div>
<div class="box" style="margin-top:6px"><span class="n">14</span><span class="lbl">Other</span>
  <span class="val" style="font-size:12px">${p.box14_other.map((e) => `${e.label} ${e.amount}`).join('&nbsp;&nbsp;&nbsp;') || ''}</span></div>
${stateRows(p.state_items)}`;
}

/**
 * A plain black laser print, four copies to a sheet.
 *
 * The genuine difficulty here is that the same numbers appear four times with different copy
 * labels (B, C, 2, 2). An engine has to return one W-2, not four merged together, and a parser
 * anchored on "the value below the Box 1 label" will find four of them.
 */
function laser4Up(p) {
  const quadrant = (copy) => `
<div class="q">
  <div style="display:flex;justify-content:space-between"><b>Form W-2 ${p.tax_year}</b><span style="font-size:8px">${copy}</span></div>
  <div class="mini"><span>b EIN</span><b>${p.employer_ein}</b></div>
  <div class="mini"><span>c Employer</span><b>${p.employer_name}, ${p.employer_address}</b></div>
  <div class="mini"><span>a SSN</span><b>${p.employee_ssn}</b></div>
  <div class="mini"><span>e Employee</span><b>${p.employee_name}</b></div>
  <div class="mini"><span>f Address</span><b>${p.employee_address}</b></div>
  <div class="g2">
    <div><span>1 Wages, tips, other compensation</span><b>${money(p.box1_wages)}</b></div>
    <div><span>2 Federal income tax withheld</span><b>${money(p.box2_federal_tax)}</b></div>
    <div><span>3 Social security wages</span><b>${money(p.box3_ss_wages)}</b></div>
    <div><span>4 Social security tax withheld</span><b>${money(p.box4_ss_tax)}</b></div>
    <div><span>5 Medicare wages and tips</span><b>${money(p.box5_medicare_wages)}</b></div>
    <div><span>6 Medicare tax withheld</span><b>${money(p.box6_medicare_tax)}</b></div>
  </div>
  <div class="mini"><span>d Control no.</span><b>${p.control_number ?? ''}</b></div>
  <div class="mini"><span>12</span><b>${p.box12.map((e) => `${e.code} ${e.amount}`).join('  ') || ''}</b></div>
  <div class="mini"><span>13</span><b><span class="cb">${p.box13_statutory_employee ? 'X' : ''}</span>Stat
    <span class="cb">${p.box13_retirement_plan ? 'X' : ''}</span>Ret. plan
    <span class="cb">${p.box13_third_party_sick ? 'X' : ''}</span>Sick pay</b></div>
  <table class="st">${stateRows(p.state_items, false)}</table>
</div>`;

  return `
<style>${BASE_CSS}
body{padding:14px;font-size:9px}
.sheet{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:10px}
.q{border:1px solid #000;padding:7px}
.mini{display:flex;gap:5px;border-bottom:1px dotted #999;padding:2px 0;font-size:8px}
.mini span{width:74px;color:#444;flex-shrink:0}
.mini b{font-size:9.5px}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:2px;margin-top:3px}
.g2>div{border:1px solid #666;padding:2px 3px}
.g2 span{display:block;font-size:7px;color:#333}
.g2 b{font-size:10.5px}
.st{width:100%;border-collapse:collapse;margin-top:3px;font-size:8px}
.st td{border:1px solid #777;padding:2px}
</style>
<div class="sheet">
  ${quadrant('Copy B — To be filed with employee’s FEDERAL tax return')}
  ${quadrant('Copy C — For EMPLOYEE’S RECORDS')}
  ${quadrant('Copy 2 — To be filed with employee’s State return')}
  ${quadrant('Copy 2 — To be filed with employee’s City return')}
</div>`;
}

/** Payroll-provider styling: branded header, sans-serif, boxes in a different visual order. */
function payrollProvider(p, brand, accent) {
  return `
<style>${BASE_CSS}
body{font-size:11px}
.brand{background:${accent};color:#fff;padding:9px 12px;font-weight:700;font-size:15px;letter-spacing:.4px;margin:-26px -26px 12px}
.two{display:grid;grid-template-columns:1.25fr 1fr;gap:12px}
.card{border:1px solid #ccd;border-radius:5px;padding:9px 11px;background:#fbfcfe}
.row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #e6e9f0}
.row span{color:#405;font-size:9.5px}
.row b{font-size:13px}
.who{font-size:10px;line-height:1.5;color:#223}
</style>
<div class="brand">${brand} &nbsp;·&nbsp; Form W-2 Wage and Tax Statement &nbsp;·&nbsp; ${p.tax_year}</div>
<div class="two">
  <div class="card">
    <div class="row"><span>1 Wages, tips, other compensation</span><b>${money(p.box1_wages)}</b></div>
    <div class="row"><span>2 Federal income tax withheld</span><b>${money(p.box2_federal_tax)}</b></div>
    <div class="row"><span>3 Social security wages</span><b>${money(p.box3_ss_wages)}</b></div>
    <div class="row"><span>4 Social security tax withheld</span><b>${money(p.box4_ss_tax)}</b></div>
    <div class="row"><span>5 Medicare wages and tips</span><b>${money(p.box5_medicare_wages)}</b></div>
    <div class="row"><span>6 Medicare tax withheld</span><b>${money(p.box6_medicare_tax)}</b></div>
    <div class="row"><span>10 Dependent care benefits</span><b>${money(p.box10_dependent_care)}</b></div>
    <div class="row"><span>11 Nonqualified plans</span><b>${money(p.box11_nonqualified)}</b></div>
  </div>
  <div class="card">
    <div class="who"><b>c Employer</b><br>${p.employer_name}<br>${p.employer_address}<br>
      <b>b EIN</b> ${p.employer_ein}<br>
      <b>d Control number</b> ${p.control_number ?? '—'}</div>
    <hr style="border:0;border-top:1px solid #e6e9f0;margin:8px 0">
    <div class="who"><b>e Employee</b><br>${p.employee_name}<br>${p.employee_address}<br>
      <b>a SSN</b> ${p.employee_ssn}</div>
    <hr style="border:0;border-top:1px solid #e6e9f0;margin:8px 0">
    <div style="font-size:9px;font-weight:700;margin-bottom:3px">12 Codes</div>
    ${p.box12.length ? box12Rows(p.box12) : '<div style="font-size:10px;color:#889">None reported</div>'}
    <div style="font-size:9px;font-weight:700;margin:7px 0 3px">13</div>
    <div style="font-size:10px">
      <span class="cb">${p.box13_statutory_employee ? 'X' : ''}</span>Statutory employee<br>
      <span class="cb">${p.box13_retirement_plan ? 'X' : ''}</span>Retirement plan<br>
      <span class="cb">${p.box13_third_party_sick ? 'X' : ''}</span>Third-party sick pay
    </div>
    <div style="font-size:9px;font-weight:700;margin:7px 0 3px">14 Other</div>
    <div style="font-size:10px">${p.box14_other.map((e) => `${e.label} ${e.amount}`).join('<br>') || '—'}</div>
  </div>
</div>
${stateRows(p.state_items)}`;
}

/* ---------------------------------------------------------------- variants */

const VARIANTS = {
  clean: '',
  blur: 'body{filter:blur(1.3px)}',
  skew: 'body{transform:rotate(-2.1deg) scale(.94);transform-origin:center}',
  glare:
    'body{position:relative}body::after{content:"";position:fixed;inset:0;background:radial-gradient(circle at 62% 26%,rgba(255,255,255,.94) 0,rgba(255,255,255,.55) 20%,transparent 46%);pointer-events:none}',
  lowlight: 'body{filter:brightness(.6) contrast(.83)}',
};

/* ---------------------------------------------------------------- fixtures */

/**
 * Thirteen fixtures across four layouts and five capture variants.
 *
 * `crop` is adversarial: the page is cut off below box 14, so boxes 15-20 genuinely are not there.
 * Its truth carries an empty `state_items`, which makes it the one fixture that scores an engine
 * on abstaining correctly rather than on reading.
 */
const FIXTURES = [
  {
    id: 'irs-redink',
    person: 'maria',
    layout: irsRedInk,
    variants: ['clean', 'blur', 'skew', 'glare', 'lowlight'],
    size: '1000,800',
  },
  {
    id: 'laser-4up',
    person: 'daniel',
    layout: laser4Up,
    variants: ['clean', 'skew'],
    size: '1000,620',
    // Box 14 is the one thing this condensed sheet genuinely has no room for.
    omits: ['box14_other'],
  },
  {
    id: 'adp',
    person: 'priya',
    layout: (p) => payrollProvider(p, 'ADP', '#C8102E'),
    variants: ['clean', 'blur', 'glare'],
    size: '1000,470',
  },
  {
    id: 'gusto',
    person: 'tomas',
    layout: (p) => payrollProvider(p, 'gusto', '#F45D48'),
    variants: ['clean', 'lowlight'],
    size: '1000,470',
  },
  {
    id: 'crop',
    person: 'maria',
    layout: irsRedInk,
    variants: ['clean'],
    // Cuts the page below box 14. Boxes 15-20 are absent from the image and from the truth, so
    // this is the fixture that scores an engine on abstaining rather than on reading.
    size: '1000,660',
    // The page is cut below box 14, so boxes 15-20 are genuinely absent from the image.
    omits: ['state_items'],
  },
];

const PAGE = (body, css) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}</body></html>`;

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  let count = 0;

  for (const fixture of FIXTURES) {
    const person = PEOPLE[fixture.person];
    const body = fixture.layout(person);
    const truth = truthFor(person, fixture.omits ?? [], fixture.truthOverrides ?? {});

    for (const variant of fixture.variants) {
      const name = `w2-${fixture.id}-${variant}`;
      const css = `${VARIANTS[variant]}${fixture.css ?? ''}`;
      const htmlPath = join(OUT, `${name}.html`);
      const pngPath = join(OUT, `${name}.png`);

      await writeFile(htmlPath, PAGE(body, css), 'utf8');
      await run(CHROME, [
        '--headless',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        `--window-size=${fixture.size ?? '1000,900'}`,
        '--virtual-time-budget=3000',
        `--screenshot=${pngPath}`,
        `file://${htmlPath}`,
      ]);

      await writeFile(join(OUT, `${name}.truth.json`), `${JSON.stringify(truth, null, 2)}\n`, 'utf8');
      count += 1;
      console.log(`  ${name}`);
    }
  }

  console.log(`\n${count} fixtures in ${OUT}`);
  console.log('Rendered, not photographed — treat the resulting scores as an upper bound.');
}

await main();
