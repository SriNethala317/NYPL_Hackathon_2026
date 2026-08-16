import { dictionaries, fill } from './strings';

type Node = string | string[] | { [key: string]: Node };

/** Every leaf path in a dictionary, so two languages can be compared structurally. */
function paths(node: Node, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  if (Array.isArray(node)) return node.map((_, i) => `${prefix}[${i}]`);
  return Object.entries(node).flatMap(([key, child]) =>
    paths(child as Node, prefix ? `${prefix}.${key}` : key),
  );
}

function leaves(node: Node, prefix = ''): [string, string][] {
  if (typeof node === 'string') return [[prefix, node]];
  if (Array.isArray(node)) return node.map((v, i) => [`${prefix}[${i}]`, v] as [string, string]);
  return Object.entries(node).flatMap(([key, child]) =>
    leaves(child as Node, prefix ? `${prefix}.${key}` : key),
  );
}

const en = dictionaries.en as unknown as Node;
const es = dictionaries.es as unknown as Node;

describe('translation completeness', () => {
  it('has identical key structure in both languages', () => {
    // TypeScript enforces the shape, but not array lengths or nesting depth.
    expect(paths(es).sort()).toEqual(paths(en).sort());
  });

  it('has no empty strings', () => {
    for (const [path, value] of [...leaves(en), ...leaves(es)]) {
      expect(value.trim()).not.toBe('');
      expect({ path, value }).toBeTruthy();
    }
  });

  it('actually translates the user-facing copy', () => {
    // Catches keys copy-pasted from English and never translated. Proper nouns and a few
    // shared brand strings legitimately match, so they are exempt.
    const allowedIdentical = new Set([
      // Proper nouns and brand names, which do not translate.
      'documents.idnyc',
      'detail.facts.agency',
      // Language names are written in their own language in both dictionaries, on purpose:
      // someone looking for Spanish should see "Español" whichever language the app is in.
      'a11y.english',
      'a11y.spanish',
    ]);

    const enLeaves = new Map(leaves(en));
    const untranslated = leaves(es)
      .filter(([path, value]) => enLeaves.get(path) === value && !allowedIdentical.has(path))
      .map(([path]) => path);

    expect(untranslated).toEqual([]);
  });

  it('keeps placeholders consistent across languages', () => {
    // A dropped {document} would render a literal brace to the user.
    const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    const enLeaves = new Map(leaves(en));

    for (const [path, value] of leaves(es)) {
      expect(placeholders(value)).toEqual(placeholders(enLeaves.get(path) ?? ''));
    }
  });

  it('has three stage labels in both languages', () => {
    expect(dictionaries.en.stages).toHaveLength(3);
    expect(dictionaries.es.stages).toHaveLength(3);
  });

  it('describes storage honestly in both languages', () => {
    // The original design copy claimed documents never leave the device, which is false under
    // the Supabase pipeline. Guard against it coming back.
    for (const lang of ['en', 'es'] as const) {
      expect(dictionaries[lang].privacy.toLowerCase()).not.toMatch(/on your device|en su dispositivo/);
    }
  });
});

describe('fill', () => {
  it('substitutes named placeholders', () => {
    expect(fill('Add: {document}', { document: 'Lease' })).toBe('Add: Lease');
  });

  it('substitutes numbers', () => {
    expect(fill('{done} of {total}', { done: 3, total: 5 })).toBe('3 of 5');
  });

  it('leaves unknown placeholders untouched rather than printing undefined', () => {
    expect(fill('Hello {name}', {})).toBe('Hello {name}');
  });

  it('replaces every occurrence', () => {
    expect(fill('{a} and {a}', { a: 'x' })).toBe('x and x');
  });
});
