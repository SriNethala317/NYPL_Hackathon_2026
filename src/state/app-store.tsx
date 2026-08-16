import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import { documentType, type DocumentTypeId } from '@/data/document-types';
import type { ProgramId } from '@/data/programs';
import { profileFields, type ProfileFieldKey } from '@/data/profile-fields';
import { reconcile, unresolved, type FieldCandidate, type ResolvedField } from '@/data/reconcile';
import { extractionFor, sampleApplication, sampleUploads } from '@/data/sample-profile';
import type { Language } from '@/i18n/strings';
import { motion, type DocumentCategory } from '@/theme';

/**
 * All app state, in one reducer.
 *
 * Deliberately absent: the design's `tab`, `route` and `programId` fields. Those are navigation,
 * and expo-router owns them.
 *
 * The document model is open — a user uploads whatever they have and the pipeline works out what
 * it is. See docs/upload-pipeline.md. When Supabase lands, `documents` and `candidates` become
 * server state; the shapes are chosen so that swap does not reach the screens.
 */

/**
 * Upload → classify → extract is asynchronous and fails routinely, so each step is a real state
 * rather than a cosmetic delay.
 *
 * `needsType` is what the classifier reports when it is not confident enough to name the
 * document. Guessing there would propagate a wrong type into every field read from it.
 */
export type DocumentStatus = 'uploading' | 'reading' | 'read' | 'needsType' | 'failed';

export type FailureReason = 'unreadable' | 'timeout' | 'noFields';

export type UploadedDocument = {
  id: string;
  type: DocumentTypeId;
  status: DocumentStatus;
  /** Display date the document was read. The original is deleted at that point. */
  readOn?: string;
  /** Ordering key for reconciliation tie-breaks. */
  readAt: number;
  /** Classifier confidence, 0–1. */
  confidence: number;
  failure?: FailureReason;
};

export type Application = {
  programId: ProgramId;
  reference: string;
  date: string;
  /** Index into the three stages: Submitted, In review, Decision. */
  stage: number;
};

type State = {
  language: Language;
  documents: UploadedDocument[];
  /** Every value any document yielded, with provenance. Reconciled on read. */
  candidates: FieldCandidate[];
  /** Values the user typed. These always beat anything a machine extracted. */
  overrides: Partial<Record<ProfileFieldKey, string>>;
  /** How the user settled a conflict between equally authoritative documents. */
  conflictChoices: Partial<Record<ProfileFieldKey, string>>;
  /**
   * Fields the user has looked at and accepted. An extracted value the user never saw must not
   * be certified as true on a government form.
   */
  confirmedFields: ProfileFieldKey[];
  applications: Application[];
  consent: boolean;
  touched: boolean;
  lastReference: string | null;
  sheet: { open: boolean };
};

type Action =
  | { type: 'toggleLanguage' }
  | { type: 'openSheet' }
  | { type: 'closeSheet' }
  | { type: 'uploadStarted'; id: string; at: number }
  | { type: 'classified'; id: string; docType: DocumentTypeId; confidence: number }
  | { type: 'read'; id: string; readOn: string; candidates: FieldCandidate[] }
  | { type: 'failed'; id: string; reason: FailureReason }
  | { type: 'setType'; id: string; docType: DocumentTypeId }
  | { type: 'removeDocument'; id: string }
  | { type: 'setValue'; key: ProfileFieldKey; value: string }
  | { type: 'resolveConflict'; key: ProfileFieldKey; value: string }
  | { type: 'confirmField'; key: ProfileFieldKey }
  | { type: 'setConsent'; value: boolean }
  | { type: 'setTouched'; value: boolean }
  | { type: 'submitted'; programId: ProgramId; reference: string; date: string }
  | { type: 'loadSample'; readOn: string; at: number; date: string }
  | { type: 'reset' };

const initialState: State = {
  language: 'en',
  documents: [],
  candidates: [],
  overrides: {},
  conflictChoices: {},
  confirmedFields: [],
  applications: [],
  consent: false,
  touched: false,
  lastReference: null,
  sheet: { open: false },
};

function patchDocument(state: State, id: string, patch: Partial<UploadedDocument>): State {
  return {
    ...state,
    documents: state.documents.map((d) => (d.id === id ? { ...d, ...patch } : d)),
  };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'toggleLanguage':
      return { ...state, language: state.language === 'en' ? 'es' : 'en' };

    case 'openSheet':
      return { ...state, sheet: { open: true } };

    case 'closeSheet':
      return { ...state, sheet: { open: false } };

    case 'uploadStarted':
      return {
        ...state,
        documents: [
          ...state.documents,
          {
            id: action.id,
            type: 'unknown',
            status: 'uploading',
            readAt: action.at,
            confidence: 0,
          },
        ],
      };

    case 'classified':
      return patchDocument(state, action.id, {
        type: action.docType,
        confidence: action.confidence,
        // Below the threshold the classifier declines to name it and the user picks.
        status: action.docType === 'unknown' ? 'needsType' : 'reading',
      });

    case 'read':
      return {
        ...patchDocument(state, action.id, { status: 'read', readOn: action.readOn }),
        candidates: [...state.candidates, ...action.candidates],
      };

    case 'failed':
      return patchDocument(state, action.id, { status: 'failed', failure: action.reason });

    case 'setType':
      return patchDocument(state, action.id, { type: action.docType, status: 'reading' });

    case 'removeDocument':
      return {
        ...state,
        documents: state.documents.filter((d) => d.id !== action.id),
        // Values sourced from a removed document go with it.
        candidates: state.candidates.filter((c) => c.documentId !== action.id),
      };

    case 'setValue':
      return {
        ...state,
        overrides: { ...state.overrides, [action.key]: action.value },
        // Typing a value is itself confirmation of it.
        confirmedFields: state.confirmedFields.includes(action.key)
          ? state.confirmedFields
          : [...state.confirmedFields, action.key],
      };

    case 'resolveConflict':
      return {
        ...state,
        conflictChoices: { ...state.conflictChoices, [action.key]: action.value },
        confirmedFields: state.confirmedFields.includes(action.key)
          ? state.confirmedFields
          : [...state.confirmedFields, action.key],
      };

    case 'confirmField':
      return {
        ...state,
        confirmedFields: state.confirmedFields.includes(action.key)
          ? state.confirmedFields
          : [...state.confirmedFields, action.key],
      };

    case 'setConsent':
      return { ...state, consent: action.value };

    case 'setTouched':
      return { ...state, touched: action.value };

    case 'submitted':
      return {
        ...state,
        applications: [
          { programId: action.programId, reference: action.reference, date: action.date, stage: 0 },
          ...state.applications,
        ],
        lastReference: action.reference,
        // Consent does not carry across applications.
        consent: false,
        touched: false,
      };

    case 'loadSample': {
      const documents = sampleUploads.map((upload, index) => ({
        id: `sample-${upload.type}`,
        type: upload.type,
        status: 'read' as const,
        readOn: action.readOn,
        readAt: action.at + index,
        confidence: 0.97,
      }));
      const candidates = documents.flatMap((doc) =>
        extractionFor(doc.type, doc.id, doc.readAt),
      );
      return {
        ...state,
        documents,
        candidates,
        overrides: {},
        conflictChoices: {},
        confirmedFields: [],
        applications: [{ ...sampleApplication, date: action.date }],
      };
    }

    case 'reset':
      return { ...initialState, language: state.language };
  }
}

type Store = State & {
  toggleLanguage: () => void;
  openSheet: () => void;
  closeSheet: () => void;
  /** Runs the whole upload → classify → extract pipeline for one file. */
  upload: (options?: { as?: DocumentTypeId; simulate?: 'unknown' | 'failure' }) => void;
  setDocumentType: (id: string, docType: DocumentTypeId) => void;
  removeDocument: (id: string) => void;
  setValue: (key: ProfileFieldKey, value: string) => void;
  resolveConflict: (key: ProfileFieldKey, value: string) => void;
  confirmField: (key: ProfileFieldKey) => void;
  setConsent: (value: boolean) => void;
  setTouched: (value: boolean) => void;
  submit: (programId: ProgramId) => string;
  loadSample: () => void;
  reset: () => void;

  /** Derived: the reconciled profile. */
  resolved: ResolvedField[];
  values: Partial<Record<ProfileFieldKey, string>>;
  conflicts: ResolvedField[];
  categoriesOnFile: DocumentCategory[];
  /** Nothing else may be uploaded until an identity document is on file. */
  hasIdentityDocument: boolean;
  /** Mandatory fields still unanswered, for the "still needed" list. */
  missingFields: ProfileFieldKey[];
};

const AppStoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const after = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const readDocuments = state.documents.filter((d) => d.status === 'read');

  const resolved = reconcile(state.candidates);
  const conflicts = unresolved(resolved);

  // Precedence: what the user typed, then how they settled a conflict, then the reconciled
  // winner. A machine never overrides a person.
  const values: Partial<Record<ProfileFieldKey, string>> = {};
  for (const field of resolved) values[field.field] = field.value;
  for (const [key, value] of Object.entries(state.conflictChoices)) {
    if (value) values[key as ProfileFieldKey] = value;
  }
  for (const [key, value] of Object.entries(state.overrides)) {
    if (value) values[key as ProfileFieldKey] = value;
  }

  const categoriesOnFile = [
    ...new Set(readDocuments.map((d) => documentType(d.type).category)),
  ];

  const store: Store = {
    ...state,
    resolved,
    conflicts,
    values,
    categoriesOnFile,
    hasIdentityDocument: readDocuments.some((d) => documentType(d.type).isIdentity),
    missingFields: profileFields
      .filter((f) => f.mandatory && !values[f.key]?.trim())
      .map((f) => f.key),

    toggleLanguage: () => dispatch({ type: 'toggleLanguage' }),
    openSheet: () => dispatch({ type: 'openSheet' }),
    closeSheet: () => dispatch({ type: 'closeSheet' }),

    upload: (options = {}) => {
      counter.current += 1;
      const id = `doc-${counter.current}`;
      const at = counter.current;
      dispatch({ type: 'uploadStarted', id, at });

      // Stands in for the Edge Function round-trip. Real latency is seconds, and every one of
      // these branches happens in practice.
      after(motion.scanDuration / 2, () => {
        if (options.simulate === 'failure') {
          dispatch({ type: 'failed', id, reason: 'unreadable' });
          dispatch({ type: 'closeSheet' });
          return;
        }
        const docType = options.simulate === 'unknown' ? 'unknown' : (options.as ?? 'passport');
        dispatch({
          type: 'classified',
          id,
          docType,
          confidence: docType === 'unknown' ? 0.3 : 0.96,
        });
        if (docType === 'unknown') {
          dispatch({ type: 'closeSheet' });
          return;
        }
        after(motion.scanDuration / 2, () => {
          dispatch({
            type: 'read',
            id,
            readOn: today(),
            candidates: extractionFor(docType, id, at),
          });
          dispatch({ type: 'closeSheet' });
        });
      });
    },

    setDocumentType: (id, docType) => {
      dispatch({ type: 'setType', id, docType });
      const doc = state.documents.find((d) => d.id === id);
      after(motion.scanDuration / 2, () =>
        dispatch({
          type: 'read',
          id,
          readOn: today(),
          candidates: extractionFor(docType, id, doc?.readAt ?? 0),
        }),
      );
    },

    removeDocument: (id) => dispatch({ type: 'removeDocument', id }),
    setValue: (key, value) => dispatch({ type: 'setValue', key, value }),
    resolveConflict: (key, value) => dispatch({ type: 'resolveConflict', key, value }),
    confirmField: (key) => dispatch({ type: 'confirmField', key }),
    setConsent: (value) => dispatch({ type: 'setConsent', value }),
    setTouched: (value) => dispatch({ type: 'setTouched', value }),

    submit: (programId) => {
      const reference = newReference();
      dispatch({ type: 'submitted', programId, reference, date: today() });
      return reference;
    },

    loadSample: () => dispatch({ type: 'loadSample', readOn: today(), at: 1000, date: today() }),
    reset: () => dispatch({ type: 'reset' }),
  };

  return <AppStoreContext.Provider value={store}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): Store {
  const store = useContext(AppStoreContext);
  if (!store) throw new Error('useAppStore must be used inside <AppStoreProvider>');
  return store;
}

const dateFormat = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function today(): string {
  return dateFormat.format(new Date());
}

/**
 * The design specifies an incrementing reference. Sequential ids are enumerable and leak
 * application volume, so the mock keeps the format but randomizes the suffix. In production this
 * must be issued by the server, not the client.
 */
function newReference(): string {
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `NYC-${new Date().getFullYear()}-${suffix}`;
}
