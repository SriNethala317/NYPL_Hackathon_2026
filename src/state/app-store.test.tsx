import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { documentType, type DocumentTypeId } from '@/data/document-types';
import type { FieldCandidate } from '@/data/reconcile';
import { chooseDocument, extractFields, looksReadable, readDocument } from '@/features/extraction';

import { AppStoreProvider, useAppStore } from './app-store';

/**
 * The store's upload pipeline ends at the camera, the photo library and an OCR call — none of
 * which a unit test can or should exercise for real. Everything on this side of that boundary
 * (uploadStarted → classified → read/failed, reconciliation, confirmation) is real and runs
 * unmocked; only `chooseDocument`, `readDocument` and `extractFields` are stood in for, so the
 * reducer is driven the same way production drives it.
 */
jest.mock('@/features/extraction', () => {
  const actual = jest.requireActual('@/features/extraction');
  return {
    ...actual,
    captureDocument: jest.fn(),
    chooseDocument: jest.fn(),
    looksReadable: jest.fn(),
    readDocument: jest.fn(),
    extractFields: jest.fn(),
  };
});

const mockChooseDocument = chooseDocument as jest.MockedFunction<typeof chooseDocument>;
const mockLooksReadable = looksReadable as jest.MockedFunction<typeof looksReadable>;
const mockReadDocument = readDocument as jest.MockedFunction<typeof readDocument>;
const mockExtractFields = extractFields as jest.MockedFunction<typeof extractFields>;

const PICKED_DOCUMENT = { uri: 'file://test-document.jpg', width: 1200, height: 1600 };

/** A stand-in applicant, used only to give the mocked OCR boundary something to return. */
const FIXTURE_VALUES: Record<string, string> = {
  fullName: 'Jordan Alvarez',
  dob: '02/14/1988',
  address: '99 Test Lane, Queens, NY 11101',
  household: '2',
  income: '1800',
};

/** What the mocked reader hands back for a document type — only the fields it actually yields. */
function fixtureCandidates(
  type: DocumentTypeId,
  documentId: string,
  readAt: number,
): FieldCandidate[] {
  return documentType(type).yields.map((field) => ({
    field,
    value: FIXTURE_VALUES[field],
    documentId,
    documentType: type,
    confidence: 0.94,
    readAt,
  }));
}

beforeEach(() => {
  jest.clearAllMocks();

  mockChooseDocument.mockResolvedValue({ ok: true, document: PICKED_DOCUMENT });
  mockLooksReadable.mockReturnValue({ ok: true });

  mockReadDocument.mockImplementation(async (_document, options) => {
    const type = options.as ?? 'passport';
    return {
      ok: true,
      documentType: type,
      confidence: 0.96,
      candidates: fixtureCandidates(type, options.documentId, options.readAt ?? 0),
      text: `MOCK OCR TEXT: ${type}`,
    };
  });

  // Mirrors the real function's contract (only fields the type declares) without depending on
  // label matching against literal text, since the text here is a fixture, not a real page.
  mockExtractFields.mockImplementation((_text, type) =>
    documentType(type).yields.map((field) => ({
      key: field,
      value: FIXTURE_VALUES[field],
      confidence: 0.94,
    })),
  );
});

function wrapper({ children }: { children: ReactNode }) {
  return <AppStoreProvider>{children}</AppStoreProvider>;
}

const setup = () => renderHook(() => useAppStore(), { wrapper });

/** Drives a whole upload through the mocked boundary and waits for the document to settle. */
async function uploadAndSettle(
  result: { current: ReturnType<typeof useAppStore> },
  options?: Parameters<ReturnType<typeof useAppStore>['upload']>[0],
) {
  const before = result.current.documents.length;
  act(() => result.current.upload(options));
  await waitFor(() => expect(result.current.documents.length).toBeGreaterThan(before));
  await waitFor(() =>
    expect(result.current.documents.at(-1)?.status).not.toBe('uploading'),
  );
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
  it('reads a document all the way to a usable state', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });
    expect(result.current.documents[0].status).toBe('read');
  });

  it('extracts only the fields the document type declares', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });

    // A passport proves who you are; it says nothing about income or where you live.
    expect(result.current.values.fullName).toBe(FIXTURE_VALUES.fullName);
    expect(result.current.values.dob).toBe(FIXTURE_VALUES.dob);
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
    await uploadAndSettle(result, { as: 'w2' });

    // A W-2, a pay stub or a tax return all satisfy "income".
    expect(result.current.categoriesOnFile).toContain('income');
    expect(result.current.categoriesOnFile).toContain('identity');
  });

  it('closes the sheet when the document has been read', async () => {
    const { result } = setup();
    act(() => result.current.openSheet());
    await uploadAndSettle(result, { as: 'passport' });
    expect(result.current.sheet.open).toBe(false);
  });

  it('leaves no row behind when the picker is cancelled', async () => {
    const { result } = setup();
    mockChooseDocument.mockResolvedValueOnce({ ok: false, reason: 'cancelled' });

    act(() => result.current.upload());
    await waitFor(() => expect(mockChooseDocument).toHaveBeenCalled());

    // Cancelling is not a failure and must not leave a dead row in the list.
    expect(result.current.documents).toEqual([]);
  });
});

describe('classification failure paths', () => {
  it('asks the user rather than guessing when it cannot classify', async () => {
    const { result } = setup();
    mockReadDocument.mockResolvedValueOnce({
      ok: false,
      reason: 'no-type',
      detail: 'unclear',
      text: 'a page nothing recognized',
    });

    await uploadAndSettle(result);

    // Guessing a type would propagate a wrong type into every field read from it.
    expect(result.current.documents[0].status).toBe('needsType');
    expect(result.current.values).toEqual({});
  });

  it('reads the document once the user names its type', async () => {
    const { result } = setup();
    mockReadDocument.mockResolvedValueOnce({
      ok: false,
      reason: 'no-type',
      detail: 'unclear',
      text: 'a page nothing recognized',
    });
    await uploadAndSettle(result);

    act(() => result.current.setDocumentType(result.current.documents[0].id, 'passport'));

    await waitFor(() => expect(result.current.documents[0].status).toBe('read'));
    // Extracted from the page already read, not a fresh photo.
    expect(mockExtractFields).toHaveBeenCalledWith('a page nothing recognized', 'passport');
    expect(result.current.values.fullName).toBe(FIXTURE_VALUES.fullName);
  });

  it('does not let a non-profile field into the profile when a type is named by hand', async () => {
    /*
     * `extractFields` also emits `employer`, which exists to match a pay stub against a W-2 later
     * and is not one of the five fields a profile holds. The automatic path filters it out in
     * `readDocument`; this path has to filter it too, or a company name is cast to a key the
     * profile has no field for and dispatched as a candidate anyway.
     */
    const { result } = setup();
    mockReadDocument.mockResolvedValueOnce({
      ok: false,
      reason: 'no-type',
      detail: 'unclear',
      text: 'ATLAS HOME CARE INC / GROSS PAY 2310.00',
    });
    await uploadAndSettle(result);

    mockExtractFields.mockReturnValueOnce([
      { key: 'income', value: '2310', confidence: 0.9 },
      { key: 'employer', value: 'ATLAS HOME CARE INC', confidence: 0.9 },
    ] as ReturnType<typeof extractFields>);

    act(() => result.current.setDocumentType(result.current.documents[0].id, 'pay_stub'));
    await waitFor(() => expect(result.current.documents[0].status).toBe('read'));

    expect(result.current.values.income).toBe('2310');
    expect(Object.keys(result.current.values)).not.toContain('employer');
  });

  it('surfaces an unreadable document instead of failing silently', async () => {
    const { result } = setup();
    mockReadDocument.mockResolvedValueOnce({ ok: false, reason: 'unreadable', detail: 'blurry' });

    await uploadAndSettle(result);

    expect(result.current.documents[0].status).toBe('failed');
    expect(result.current.documents[0].failure).toBe('unreadable');
    expect(result.current.values).toEqual({});
  });

  it('a failed document contributes no categories of proof', async () => {
    const { result } = setup();
    mockReadDocument.mockResolvedValueOnce({ ok: false, reason: 'unreadable', detail: 'blurry' });

    await uploadAndSettle(result);

    expect(result.current.categoriesOnFile).toEqual([]);
    expect(result.current.hasIdentityDocument).toBe(false);
  });
});

describe('removing a document', () => {
  it('takes the values it supplied with it', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });
    expect(result.current.values.fullName).toBe(FIXTURE_VALUES.fullName);

    act(() => result.current.removeDocument(result.current.documents[0].id));

    // Otherwise a value would outlive its provenance and could not be defended.
    expect(result.current.values.fullName).toBeUndefined();
    expect(result.current.documents).toEqual([]);
  });
});

describe('reconciliation through the store', () => {
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

describe('reset', () => {
  it('clears everything a document and an application added', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });
    act(() => result.current.submit('snap'));
    expect(result.current.documents.length).toBeGreaterThan(0);
    expect(result.current.applications.length).toBeGreaterThan(0);

    act(() => result.current.reset());

    expect(result.current.documents).toEqual([]);
    expect(result.current.values).toEqual({});
    expect(result.current.applications).toEqual([]);
  });

  it('keeps the chosen language across a reset', () => {
    const { result } = setup();
    act(() => result.current.toggleLanguage());
    act(() => result.current.reset());
    // Resetting must not strand the user in a language they cannot read.
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

/**
 * Two behaviours the confirmation gate depends on, neither of which existed.
 *
 * They matter together: a form is only allowed to be generated once a person has looked at every
 * value going onto it, and both of these were silently undermining that. A conflict that could
 * never be settled meant the question was asked forever; a confirmation that could never lapse
 * meant approval given for one value was carried onto a different one.
 */
describe('settling a disagreement between documents', () => {
  it('stops asking once the user has chosen', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });

    act(() => result.current.resolveConflict('fullName', FIXTURE_VALUES.fullName));

    expect(result.current.openConflicts.map((c) => c.field)).not.toContain('fullName');
  });

  it('stops asking once the user types their own value instead', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });

    act(() => result.current.setValue('fullName', 'Someone Else'));

    expect(result.current.openConflicts.map((c) => c.field)).not.toContain('fullName');
  });

  it('keeps the raw disagreement visible for anyone who wants to see it', async () => {
    // `conflicts` is the record of what the documents said; `openConflicts` is the to-do list.
    // Settling one must not rewrite history.
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });

    act(() => result.current.resolveConflict('fullName', FIXTURE_VALUES.fullName));
    expect(result.current.conflicts.length).toBeGreaterThanOrEqual(
      result.current.openConflicts.length,
    );
  });
});

describe('confirmation lapses when the value behind it can change', () => {
  it('un-confirms a field a newly read document speaks to', async () => {
    const { result } = setup();

    // A passport, yielding a name the user then approves.
    await uploadAndSettle(result, { as: 'passport' });

    act(() => result.current.confirmField('fullName'));
    expect(result.current.confirmedFields).toContain('fullName');

    // A W-2 also yields a name, so the reconciled winner for `fullName` can move — and the
    // approval the user gave was for whatever they were shown before it arrived.
    await uploadAndSettle(result, { as: 'w2' });

    expect(result.current.confirmedFields).not.toContain('fullName');
  });

  it('leaves a typed value confirmed, because no document can outrank it', async () => {
    const { result } = setup();
    await uploadAndSettle(result, { as: 'passport' });

    act(() => result.current.setValue('fullName', 'Someone Else'));
    expect(result.current.confirmedFields).toContain('fullName');

    await uploadAndSettle(result, { as: 'w2' });

    // The value on screen did not change, so the approval still applies to what they saw.
    expect(result.current.confirmedFields).toContain('fullName');
    expect(result.current.values.fullName).toBe('Someone Else');
  });
});
