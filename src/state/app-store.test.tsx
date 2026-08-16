import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AppStoreProvider, useAppStore } from './app-store';

import { documentKinds } from '@/theme';

function wrapper({ children }: { children: ReactNode }) {
  return <AppStoreProvider>{children}</AppStoreProvider>;
}

const setup = () => renderHook(() => useAppStore(), { wrapper });

describe('initial state', () => {
  it('starts empty, with nothing on file', () => {
    const { result } = setup();
    expect(result.current.documentsOnFile).toEqual([]);
    expect(result.current.applications).toEqual([]);
    expect(result.current.values).toEqual({});
    expect(result.current.consent).toBe(false);
  });

  it('marks every document missing', () => {
    const { result } = setup();
    for (const kind of documentKinds) {
      expect(result.current.documents[kind].status).toBe('missing');
    }
  });
});

describe('language', () => {
  it('toggles between the two languages', () => {
    const { result } = setup();
    expect(result.current.language).toBe('en');
    act(() => result.current.toggleLanguage());
    expect(result.current.language).toBe('es');
    act(() => result.current.toggleLanguage());
    expect(result.current.language).toBe('en');
  });

  it('survives a demo reset', () => {
    // Resetting the demo should not throw the user back into a language they cannot read.
    const { result } = setup();
    act(() => result.current.toggleLanguage());
    act(() => result.current.reset());
    expect(result.current.language).toBe('es');
  });
});

describe('scanning a document', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('passes through a scanning state before becoming readable', async () => {
    const { result } = setup();

    act(() => result.current.scan('id'));
    // The intermediate state is the whole point: extraction is asynchronous and can fail.
    expect(result.current.documents.id.status).toBe('scanning');

    act(() => jest.runAllTimers());
    await waitFor(() => expect(result.current.documents.id.status).toBe('read'));
  });

  it('extracts only the fields that document is the source for', async () => {
    const { result } = setup();

    act(() => result.current.scan('id'));
    act(() => jest.runAllTimers());

    await waitFor(() => expect(result.current.values.fullName).toBe('Maria Reyes'));
    expect(result.current.values.dob).toBe('04/18/1991');
    // A photo ID says nothing about income.
    expect(result.current.values.income).toBeUndefined();
  });

  it('records when the document was read, since the original is discarded', async () => {
    const { result } = setup();
    act(() => result.current.scan('income'));
    act(() => jest.runAllTimers());
    await waitFor(() => expect(result.current.documents.income.readOn).toBeTruthy());
  });

  it('closes the upload sheet when extraction finishes', async () => {
    const { result } = setup();
    act(() => result.current.openSheet('id'));
    expect(result.current.sheet.open).toBe(true);

    act(() => result.current.scan('id'));
    act(() => jest.runAllTimers());
    await waitFor(() => expect(result.current.sheet.open).toBe(false));
  });

  it('never overwrites a value the user typed themselves', async () => {
    const { result } = setup();

    act(() => result.current.setValue('fullName', 'María Reyes-Ortiz'));
    act(() => result.current.scan('id'));
    act(() => jest.runAllTimers());

    // The applicant certifies these values as true; a machine must not silently replace them.
    await waitFor(() => expect(result.current.documents.id.status).toBe('read'));
    expect(result.current.values.fullName).toBe('María Reyes-Ortiz');
  });
});

describe('field confirmation', () => {
  it('treats typing a value as confirming it', () => {
    const { result } = setup();
    act(() => result.current.setValue('income', '2400'));
    expect(result.current.confirmedFields).toContain('income');
  });

  it('does not double-record a field', () => {
    const { result } = setup();
    act(() => result.current.setValue('income', '2400'));
    act(() => result.current.setValue('income', '2500'));
    act(() => result.current.confirmField('income'));
    expect(result.current.confirmedFields.filter((f) => f === 'income')).toHaveLength(1);
  });

  it('leaves extracted-but-unseen values unconfirmed', async () => {
    jest.useFakeTimers();
    const { result } = setup();

    act(() => result.current.scan('id'));
    act(() => jest.runAllTimers());
    await waitFor(() => expect(result.current.documents.id.status).toBe('read'));

    // Extraction alone is not confirmation — this is what stops a hallucinated value being
    // certified as true on a government form.
    expect(result.current.confirmedFields).toEqual([]);
    jest.useRealTimers();
  });
});

describe('submitting an application', () => {
  it('prepends the new application at the first stage', () => {
    const { result } = setup();

    let reference = '';
    act(() => {
      reference = result.current.submit('fair_fares');
    });

    expect(result.current.applications).toHaveLength(1);
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

  it('keeps the newest application first', () => {
    const { result } = setup();
    act(() => {
      result.current.submit('fair_fares');
    });
    act(() => {
      result.current.submit('medicaid');
    });
    expect(result.current.applications[0].programId).toBe('medicaid');
  });
});

describe('the demo affordances', () => {
  it('loads a complete sample profile', () => {
    const { result } = setup();
    act(() => result.current.loadSample());

    expect(result.current.documentsOnFile).toHaveLength(documentKinds.length);
    expect(result.current.values.fullName).toBe('Maria Reyes');
    expect(result.current.applications).toHaveLength(1);
  });

  it('reset clears everything the sample added', () => {
    const { result } = setup();
    act(() => result.current.loadSample());
    act(() => result.current.reset());

    expect(result.current.documentsOnFile).toEqual([]);
    expect(result.current.values).toEqual({});
    expect(result.current.applications).toEqual([]);
  });
});

describe('the upload sheet', () => {
  it('remembers which document row opened it', () => {
    const { result } = setup();
    act(() => result.current.openSheet('lease'));
    expect(result.current.sheet).toEqual({ open: true, target: 'lease' });
  });

  it('opens without a target from the generic add button', () => {
    const { result } = setup();
    act(() => result.current.openSheet());
    expect(result.current.sheet).toEqual({ open: true, target: null });
  });

  it('clears the target on close', () => {
    const { result } = setup();
    act(() => result.current.openSheet('lease'));
    act(() => result.current.closeSheet());
    expect(result.current.sheet).toEqual({ open: false, target: null });
  });
});
