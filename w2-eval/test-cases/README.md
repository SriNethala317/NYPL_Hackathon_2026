# W-2 test cases

17 cases across 5 layouts and six capture conditions.
Each case is a directory you can open: the image, the ground truth, the HTML it was
rendered from, and a note saying what it is for.

## How ground truth is produced

The data is authored first and the image is rendered **from** it, so the truth never passes
through an extractor and never through a human transcriber. `expected.json` describes what is
printed on that specific image — not what is true of the employee. Where a layout does not
print a field, the truth for that field is null, because an engine that correctly returns
nothing must not be scored as having missed something.

## A caveat that matters

These pages were **rendered, never printed**. Paper texture and true focus falloff are not
here, so every engine scores better on this corpus than it would on a photograph of a real
form. The `phone` condition narrows that gap; it does not close it. Treat the numbers as an
upper bound.

To add a real photograph: make a directory beside these, put the image in it with an
`expected.json` describing what the photo shows. The generator will leave it alone.

## All data is fabricated

SSNs come from the 900-99 range, which the SSA has never issued and never will. Employers and
addresses are invented. No real tax document is in this repository.

## The cases

### irs-redink

The official IRS red-ink form, boxes in their real positions. The control layout.

- [`irs-redink-clean`](./irs-redink-clean/) — A flatbed scan.
- [`irs-redink-blur`](./irs-redink-blur/) — Out of focus.
- [`irs-redink-skew`](./irs-redink-skew/) — Photographed at an angle — a real perspective projection, not a rotation.
- [`irs-redink-glare`](./irs-redink-glare/) — A window or ceiling light reflecting off the paper, washing out one corner.
- [`irs-redink-lowlight`](./irs-redink-lowlight/) — A dim room.
- [`irs-redink-phone`](./irs-redink-phone/) — Everything at once: off-axis, out of focus, noisy, unevenly lit, then compressed the way a messaging app compresses it.

### laser-4up

A plain laser print, four copies to one sheet (Copy B, C, 2, 2).

- [`laser-4up-clean`](./laser-4up-clean/) — A flatbed scan.
- [`laser-4up-skew`](./laser-4up-skew/) — Photographed at an angle — a real perspective projection, not a rotation.
- [`laser-4up-phone`](./laser-4up-phone/) — Everything at once: off-axis, out of focus, noisy, unevenly lit, then compressed the way a messaging app compresses it.

### adp

Payroll-provider styling: branded header, boxes in a different visual order.

- [`adp-clean`](./adp-clean/) — A flatbed scan.
- [`adp-blur`](./adp-blur/) — Out of focus.
- [`adp-glare`](./adp-glare/) — A window or ceiling light reflecting off the paper, washing out one corner.
- [`adp-phone`](./adp-phone/) — Everything at once: off-axis, out of focus, noisy, unevenly lit, then compressed the way a messaging app compresses it.

### gusto

A second payroll-provider style, to prove the reader is not tuned to one brand.

- [`gusto-clean`](./gusto-clean/) — A flatbed scan.
- [`gusto-lowlight`](./gusto-lowlight/) — A dim room.
- [`gusto-phone`](./gusto-phone/) — Everything at once: off-axis, out of focus, noisy, unevenly lit, then compressed the way a messaging app compresses it.

### crop

The IRS layout, cut off below box 14.

- [`crop-clean`](./crop-clean/) — A flatbed scan.

## Regenerating

```bash
node make-fixtures.mjs      # needs google-chrome and ImageMagick
```

It overwrites the four files it owns in each case directory and deletes nothing else.
