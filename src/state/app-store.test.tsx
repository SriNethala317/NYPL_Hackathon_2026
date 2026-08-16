import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AppStoreProvider, useAppStore } from './app-store';

function wrapper({ children }: { children: ReactNode }) {
  return <AppStoreProvider>{children}</AppStoreProvider>;
}

const setup = () => renderHook(() => useAppStore(), { wrapper });

/**
 * Runs an upload all the way through classify → extract, on the simulated path deliberately.
 *
 * An upload without `simulate` now opens the real camera or photo library, which a unit test
 * neither can nor should do — that separation is the point of the flag.
 */
async function uploadAndSettle(
  result: { current: ReturnType<typeof useAppStore> },
  options?: Parameters<ReturnType<typeof useAppStore>['upload']>[0],
) {
  act(() => result.current.upload({ simulate: 'sample', ...options }));
  act(() => jest.runAllTimers());
  await waitFor(() => expect(result.current.documents.length).toBeGreaterThan(0));
}

describe('initial state', () => {
  it('starts with nothing on file', () => {
    const { result } = setup();
    expect(result.current.documents).toEqual([]);
    expect(result.current.values).toEqual({});
    expect(result.current.applications).toEqual([]);
    expect(result.current.categoriesOnFile).toEqual([]);
  });

  it('has no identity document, so the gate is closed', () => {
    const { result } = setup();
    expect(result.current.hasIdentityDocument).toBe(false);
  });

  it('reports every mandatory field as missing', () => {
    const { result } = setup();
    expect(result.current.missingFields).toEqual([
      'fullName',
      'dob',
      'address',
      'household',
      'income',
    ]);
  });
});

describe('the upload pipeline', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes through upload and read before the document is usable', async () => {
    const { result } = setup();

    act(() => result.current.upload({ simulate: 'sample', as: 'passport' }));
    // The intermediate states are the point: this round-trip is slow and can fail.
    expect(result.current.documents[0].status).toBe('uploading');

    act(() => jest.runAllTimers());
    await waitFor(() => expect(result.current.documents[0].status).toBe('read'));
  });

  it('extracts only the fields the document type declares', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });

    // A passport proves who you are; it says nothing about income or where you live.
    expect(result.current.values.fullName).toBe('Maria Reyes');
    expect(result.current.values.dob).toBe('04/18/1991');
    expect(result.current.values.income).toBeUndefined();
    expect(result.current.values.address).toBeUndefined();
  });

  it('opens the identity gate once a photo ID is read', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });
    expect(result.current.hasIdentityDocument).toBe(true);
  });

  it('does not open the gate for a non-identity document', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'w2' });
    expect(result.current.hasIdentityDocument).toBe(false);
  });

  it('reports categories of proof, not individual files', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });
    act(() => result.current.upload({ simulate: 'sample', as: 'w2' }));
    act(() => jest.runAllTimers());

    // A W-2, a pay stub or a tax return all satisfy "income".
    await waitFor(() => expect(result.current.categoriesOnFile).toContain('income'));
    expect(result.current.categoriesOnFile).toContain('identity');
  });

  it('closes the sheet when the document has been read', async () => {
    const { result } = setup();
    act(() => result.current.openSheet());
    await uploadAndSettle(result, { as: 'passport' });
    expect(result.current.sheet.open).toBe(false);
  });
});

describe('classification failure paths', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('asks the user rather than guessing when it cannot classify', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { simulate: 'unknown' });

    // Guessing a type would propagate a wrong type into every field read from it.
    expect(result.current.documents[0].status).toBe('needsType');
    expect(result.current.values).toEqual({});
  });

  it('reads the document once the user names its type', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { simulate: 'unknown' });

    act(() => result.current.setDocumentType(result.current.documents[0].id, 'passport'));
    act(() => jest.runAllTimers());

    await waitFor(() => expect(result.current.documents[0].status).toBe('read'));
    expect(result.current.values.fullName).toBe('Maria Reyes');
  });

  it('surfaces an unreadable document instead of failing silently', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { simulate: 'failure' });

    expect(result.current.documents[0].status).toBe('failed');
    expect(result.current.documents[0].failure).toBe('unreadable');
    expect(result.current.values).toEqual({});
  });

  it('a failed document contributes no categories of proof', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { simulate: 'failure' });
    expect(result.current.categoriesOnFile).toEqual([]);
    expect(result.current.hasIdentityDocument).toBe(false);
  });
});

describe('removing a document', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('takes the values it supplied with it', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });
    expect(result.current.values.fullName).toBe('Maria Reyes');

    act(() => result.current.removeDocument(result.current.documents[0].id));

    // Otherwise a value would outlive its provenance and could not be defended.
    await waitFor(() => expect(result.current.values.fullName).toBeUndefined());
    expect(result.current.documents).toEqual([]);
  });
});

describe('reconciliation through the store', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('a typed value always beats an extracted one', async () => {
    const { result } = setup();

    act(() => result.current.setValue('fullName', 'María Reyes-Ortiz'));
    await uploadAndSettle(result, { as: 'passport' });

    // The applicant certifies these values as true; a machine must not silently replace them.
    expect(result.current.values.fullName).toBe('María Reyes-Ortiz');
  });

  it('records which document a value came from', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });

    const name = result.current.resolved.find((r) => r.field === 'fullName');
    expect(name?.documentType).toBe('passport');
  });

  it('leaves extracted-but-unseen values unconfirmed', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });

    // Extraction is not confirmation — this is what stops a hallucinated value being certified.
    expect(result.current.confirmedFields).toEqual([]);
  });
});

describe('the demo affordances', () => {
  it('loads a sample profile that satisfies the identity gate', () => {
    const { result } = setup();
    act(() => result.current.loadSample());

    expect(result.current.hasIdentityDocument).toBe(true);
    expect(result.current.values.fullName).toBe('Maria Reyes');
    expect(result.current.applications).toHaveLength(1);
  });

  it('reset clears everything the sample added', () => {
    const { result } = setup();
    act(() => result.current.loadSample());
    act(() => result.current.reset());

    expect(result.current.documents).toEqual([]);
    expect(result.current.values).toEqual({});
    expect(result.current.applications).toEqual([]);
  });

  it('keeps the chosen language across a reset', () => {
    const { result } = setup();
    act(() => result.current.toggleLanguage());
    act(() => result.current.reset());
    // Resetting the demo must not strand the user in a language they cannot read.
    expect(result.current.language).toBe('es');
  });
});

describe('submitting an application', () => {
  it('prepends the new application at the first stage', () => {
    const { result } = setup();

    let reference = '';
    act(() => {
      reference = result.current.submit('fair_fares');
    });

    expect(result.current.applications[0]).toMatchObject({
      programId: 'fair_fares',
      reference,
      stage: 0,
    });
  });

  it('clears consent so it cannot carry to the next application', () => {
    const { result } = setup();
    act(() => result.current.setConsent(true));
    act(() => {
      result.current.submit('snap');
    });
    expect(result.current.consent).toBe(false);
  });

  it('issues non-sequential references', () => {
    // Sequential ids are enumerable and leak volume; production must issue these server-side.
    const { result } = setup();
    const refs = new Set<string>();
    for (let i = 0; i < 25; i++) {
      act(() => {
        refs.add(result.current.submit('snap'));
      });
    }
    expect(refs.size).toBeGreaterThan(20);
    for (const ref of refs) expect(ref).toMatch(/^NYC-\d{4}-\d{4}$/);
  });
});
