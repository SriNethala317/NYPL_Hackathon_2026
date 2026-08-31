import { normalizeAmount, normalizeYear } from '../../core/normalize.ts';
import { MONETARY_FIELDS, W2Fields, emptyFields } from '../../core/schema.ts';

/**
 * Turning what a vision model actually returns into what the contract requires.
 *
 * Models return malformed JSON considerably more often than their documentation suggests, and the
 * failures are boringly consistent: a markdown fence, a number where a string was demanded, `null`
 * where an empty array was demanded, a trailing comma.
 *
 * These are all measured, not anticipated. On `gemma3:4b` reading a clean fixture:
 *
 *     "tax_year": 2025,          // number, schema wants a string
 *     "box1_wages": 2720.00,     // number, and a dropped digit besides
 *     "box12": null,             // schema wants []
 *
 * wrapped in a ```json fence. Without this stage every one of those is a zod failure, and the
 * engine scores zero for reasons that have nothing to do with how well it read the page. That
 * would not be measuring extraction quality, it would be measuring JSON discipline.
 *
 * ## What repair may not do
 *
 * Coerce types and shapes. Never values. `2720.00` stays `2720.00` — it is a misread of `27720.00`
 * and the scorer must see it as one. The line is: if fixing it requires knowing what the document
 * said, it is not repair.
 */

export type RepairOutcome =
  | { ok: true; fields: W2Fields; warnings: string[] }
  | { ok: false; error: string };

/** Strips a ```json fence, and anything the model said either side of the object. */
export function stripFence(raw: string): string {
  let text = raw.trim();

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) text = fence[1].trim();

  // Some models preface with a sentence. Take the outermost braces.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) text = text.slice(first, last + 1);

  return text;
}

/** A trailing comma before a closing brace or bracket — common, and trivially recoverable. */
function dropTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1');
}

function asStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return null;
  const text = String(value).trim();
  if (text === '' || text.toLowerCase() === 'null' || text.toLowerCase() === 'n/a') return null;
  return text;
}

function asBooleanOrNull(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'x', 'checked', '1'].includes(text)) return true;
  if (['false', 'no', '', 'unchecked', '0'].includes(text)) return false;
  return null;
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  // `null` for an empty section is the single most common shape error.
  return [];
}

/**
 * Coerces a raw object into the schema's shape.
 *
 * Every coercion appends a warning, so the report can say how much work this stage did per
 * provider. A model needing heavy repair on every call is a finding, not a detail — it predicts
 * how the same model behaves in production where nothing is checking.
 */
export function coerce(input: unknown): { fields: unknown; warnings: string[] } {
  const warnings: string[] = [];
  if (typeof input !== 'object' || input === null) {
    return { fields: emptyFields(), warnings: ['Response was not a JSON object.'] };
  }

  const raw = input as Record<string, unknown>;
  const out: Record<string, unknown> = { ...emptyFields() };

  for (const key of Object.keys(out)) {
    if (!(key in raw)) continue;
    const value = raw[key];

    if (key.startsWith('box13_')) {
      out[key] = asBooleanOrNull(value);
      continue;
    }

    if (key === 'box12' || key === 'box14_other' || key === 'state_items') {
      if (value !== null && !Array.isArray(value)) {
        warnings.push(`${key} was ${typeof value}, not an array; treated as empty.`);
      }
      continue; // Handled below, where the entry shape is known.
    }

    if (typeof value === 'number') {
      warnings.push(`${key} came back as a number; the contract requires a string.`);
    }

    const text = asStringOrNull(value);
    out[key] = MONETARY_FIELDS.has(key) && text !== null ? (normalizeAmount(text) ?? text) : text;
  }

  // Year is the one scalar worth pulling out of prose: models like to answer "Tax year 2025".
  if (out.tax_year !== null) out.tax_year = normalizeYear(out.tax_year as string) ?? out.tax_year;

  out.box12 = asArray(raw.box12)
    .map((entry) => {
      const e = entry as Record<string, unknown>;
      const code = asStringOrNull(e?.code);
      const amount = asStringOrNull(e?.amount);
      if (code === null) return null;
      return { code, amount: normalizeAmount(amount) ?? amount ?? '' };
    })
    .filter((e): e is { code: string; amount: string } => e !== null);

  out.box14_other = asArray(raw.box14_other)
    .map((entry) => {
      const e = entry as Record<string, unknown>;
      const label = asStringOrNull(e?.label);
      const amount = asStringOrNull(e?.amount);
      if (label === null) return null;
      return { label, amount: normalizeAmount(amount) ?? amount ?? '' };
    })
    .filter((e): e is { label: string; amount: string } => e !== null);

  out.state_items = asArray(raw.state_items).map((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>;
    const amount = (key: string) => {
      const text = asStringOrNull(e[key]);
      return text === null ? null : (normalizeAmount(text) ?? text);
    };
    return {
      state: asStringOrNull(e.state),
      employer_state_id: asStringOrNull(e.employer_state_id),
      state_wages: amount('state_wages'),
      state_tax: amount('state_tax'),
      local_wages: amount('local_wages'),
      local_tax: amount('local_tax'),
      locality_name: asStringOrNull(e.locality_name),
    };
  });

  // Keys outside the schema are dropped and reported rather than merged.
  const unknown = Object.keys(raw).filter((k) => !(k in out));
  if (unknown.length > 0) {
    warnings.push(`Response carried keys not in the schema, ignored: ${unknown.join(', ')}.`);
  }

  return { fields: out, warnings };
}

/** Parses, repairs, and validates against the schema. Never throws. */
export function repair(raw: string): RepairOutcome {
  const warnings: string[] = [];

  const stripped = stripFence(raw);
  if (stripped !== raw.trim()) warnings.push('Response was wrapped in prose or a markdown fence.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (first) {
    try {
      parsed = JSON.parse(dropTrailingCommas(stripped));
      warnings.push('Response had a trailing comma.');
    } catch {
      return { ok: false, error: String(first) };
    }
  }

  const { fields, warnings: coercionWarnings } = coerce(parsed);
  warnings.push(...coercionWarnings);

  const result = W2Fields.safeParse(fields);
  if (!result.success) {
    return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  }

  return { ok: true, fields: result.data, warnings };
}
