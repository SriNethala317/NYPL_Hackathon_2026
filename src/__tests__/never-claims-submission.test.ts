import { dictionaries } from '@/i18n/strings';

/**
 * The app must never tell somebody it filed their application.
 *
 * It cannot. There is no public API for submitting a NYC benefits application, `submit()` makes a
 * local reference and writes a local row, and no network call happens anywhere in that path.
 *
 * The screen previously said "We sent your application to the agency. You can follow its progress
 * on the Home tab." Somebody who believes that stops — they wait for a decision that will never
 * arrive, and the deadline passes. For a household waiting on food or rent assistance, a false
 * success is worse than an obvious failure, because nothing about it prompts them to try again.
 *
 * This test exists because that copy read as perfectly reasonable in review. It only became
 * obviously wrong when someone used the app and asked where their application had gone.
 */

const CLAIMS_IT_WAS_SENT = [
  /\bwe sent\b/i,
  /\bwe (have )?submitted\b/i,
  /\bsent (your|the) application\b/i,
  /\bapplication submitted\b/i,
  /\benviamos su solicitud\b/i,
  /\bsolicitud enviada\b/i,
  /\bhemos enviado\b/i,
];

/** Every string in the dictionary, flattened, with the path that reached it. */
function everyString(node: unknown, path: string[] = []): { path: string; value: string }[] {
  if (typeof node === 'string') return [{ path: path.join('.'), value: node }];
  if (Array.isArray(node)) return node.flatMap((item, i) => everyString(item, [...path, String(i)]));
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) => everyString(value, [...path, key]));
  }
  return [];
}

describe('no user-visible copy claims an application was filed', () => {
  it.each(['en', 'es'] as const)('%s', (language) => {
    const offenders = everyString(dictionaries[language]).filter((entry) =>
      CLAIMS_IT_WAS_SENT.some((pattern) => pattern.test(entry.value)),
    );

    expect(offenders).toEqual([]);
  });

  it('says plainly that nothing was sent', () => {
    expect(dictionaries.en.confirmation.body).toMatch(/have not applied|nothing has been sent/i);
    expect(dictionaries.es.confirmation.body).toMatch(/no ha solicitado|no se ha enviado/i);
  });

  it('does not present its own reference as the agency’s', () => {
    // The number looks exactly like a confirmation number, so it has to be labelled as ours.
    expect(dictionaries.en.confirmation.referenceNote).toMatch(/not the agency/i);
    expect(dictionaries.es.confirmation.referenceNote).toMatch(/no el de la agencia/i);
  });
});
