import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { documentType, type DocumentTypeId } from '@/data/document-types';
import { profileFields, type ProfileFieldKey } from '@/data/profile-fields';
import { reconcile, unresolved, type FieldCandidate, type ResolvedField } from '@/data/reconcile';
import { extractionFor, sampleApplication, sampleUploads } from '@/data/sample-profile';
import {
  captureDocument,
  chooseDocument,
  looksReadable,
  readDocument,
  type PickedDocument,
} from '@/features/extraction';
import type { Language } from '@/i18n/strings';
import { hydrate, persistDocument } from '@/state/persistence';
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
  /** Catalogue program id, e.g. "S2R001". */
  programId: string;
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
  | { type: 'submitted'; programId: string; reference: string; date: string }
  | { type: 'loadSample'; readOn: string; at: number; date: string }
  /**
   * Everything this user had on file, arriving from the server after sign-in.
   *
   * Merged rather than assigned: a slow network must never wipe out a document the user added
   * while the request was in flight. Anything already in memory wins on id collision.
   */
  | {
      type: 'hydrated';
      documents: UploadedDocument[];
      candidates: FieldCandidate[];
      applications: Application[];
    }
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

    case 'read': {
      /*
       * A new document un-confirms the fields it speaks to.
       *
       * Confirmation means "a person looked at this exact value and said it was right". A W-2 read
       * after a licence can change the reconciled winner for `fullName`, and leaving the field
       * marked confirmed would carry that approval onto a value nobody ever saw — which is
       * precisely the assurance the confirmation step exists to provide.
       *
       * A value the user typed themselves is left alone: `overrides` outrank every document, so
       * nothing a document says can change what they will see.
       */
      const touched = new Set(action.candidates.map((candidate) => candidate.field));

      return {
        ...patchDocument(state, action.id, { status: 'read', readOn: action.readOn }),
        candidates: [...state.candidates, ...action.candidates],
        confirmedFields: state.confirmedFields.filter(
          (field) => !touched.has(field) || state.overrides[field] !== undefined,
        ),
      };
    }

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

    case 'hydrated': {
      /*
       * Server rows fill gaps; they never overwrite. Someone who opens the app and immediately
       * photographs a pay stub must not watch it vanish when a slow sign-in finally returns.
       */
      const haveDocument = new Set(state.documents.map((d) => d.id));
      const haveCandidate = new Set(state.candidates.map((c) => `${c.documentId}:${c.field}`));
      const haveApplication = new Set(state.applications.map((a) => a.reference));

      return {
        ...state,
        documents: [
          ...state.documents,
          ...action.documents.filter((d) => !haveDocument.has(d.id)),
        ],
        candidates: [
          ...state.candidates,
          ...action.candidates.filter((c) => !haveCandidate.has(`${c.documentId}:${c.field}`)),
        ],
        applications: [
          ...state.applications,
          ...action.applications.filter((a) => !haveApplication.has(a.reference)),
        ],
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
  /**
   * The real thing: pick a document, read it, reconcile what it yields.
   *
   * `source` decides camera or library. `simulate` drives the demo buttons, which fabricate a
   * document without touching the camera — kept because they are the only way to show the
   * failure paths on demand.
   */
  upload: (options?: {
    source?: 'camera' | 'library';
    as?: DocumentTypeId;
    simulate?: 'sample' | 'unknown' | 'failure';
  }) => void;
  setDocumentType: (id: string, docType: DocumentTypeId) => void;
  removeDocument: (id: string) => void;
  setValue: (key: ProfileFieldKey, value: string) => void;
  resolveConflict: (key: ProfileFieldKey, value: string) => void;
  confirmField: (key: ProfileFieldKey) => void;
  setConsent: (value: boolean) => void;
  setTouched: (value: boolean) => void;
  submit: (programId: string) => string;
  loadSample: () => void;
  reset: () => void;

  /** Derived: the reconciled profile. */
  resolved: ResolvedField[];
  values: Partial<Record<ProfileFieldKey, string>>;
  conflicts: ResolvedField[];
  /** Disagreements the user has not yet settled. Use this to prompt, never `conflicts`. */
  openConflicts: ResolvedField[];
  categoriesOnFile: DocumentCategory[];
  /** Nothing else may be uploaded until an identity document is on file. */
  hasIdentityDocument: boolean;
  /** Mandatory fields still unanswered, for the "still needed" list. */
  missingFields: ProfileFieldKey[];
  /**
   * Why the last save failed, when one did.
   *
   * Surfaced rather than swallowed. A document read on screen but never stored is a state the app
   * must be able to admit to — silently losing somebody's income document between sessions and
   * showing no reason is worse than the failure itself.
   */
  syncError: string | null;
};

const AppStoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const counter = useRef(0);
  /** Last thing that failed to save. Surfaced rather than swallowed — see persistence.ts. */
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  /*
   * Pull anything already on the server, once.
   *
   * Deliberately not awaited anywhere in render: the app is fully usable before this resolves, and
   * on a bad connection it may never resolve at all. Documents added in the meantime survive —
   * `hydrated` merges rather than assigns.
   */
  useEffect(() => {
    void hydrate({
      onHydrate: (data) =>
        dispatch({
          type: 'hydrated',
          documents: data.documents.map((d) => ({
            id: d.id,
            type: d.kind,
            status: d.status as DocumentStatus,
            // `readAt` orders reconciliation tie-breaks, so a restored document must carry the
            // time it was originally read — not now, which would make every old document look
            // like the newest one and quietly invert the precedence rules.
            readAt: d.readAt ? Date.parse(d.readAt) || 0 : 0,
            readOn: d.readAt?.slice(0, 10),
            confidence: d.confidence ?? 0,
          })),
          candidates: data.candidates,
          applications: data.applications,
        }),
      onError: (message) => setSyncError(message),
    });
  }, []);

  const after = (ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  };

  const readDocuments = state.documents.filter((d) => d.status === 'read');

  const resolved = reconcile(state.candidates);
  const conflicts = unresolved(resolved);

  /*
   * The disagreements still worth asking about.
   *
   * `conflicts` is computed from the documents alone, so it never shrinks — answering one leaves
   * it in the list and the app would ask the same question again on every render, forever. A
   * conflict is settled once the user has chosen between the readings or typed their own value.
   */
  const openConflicts = conflicts.filter(
    (conflict) =>
      state.conflictChoices[conflict.field] === undefined &&
      state.overrides[conflict.field] === undefined,
  );

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
    openConflicts,
    values,
    categoriesOnFile,
    hasIdentityDocument: readDocuments.some((d) => documentType(d.type).isIdentity),
    missingFields: profileFields
      .filter((f) => f.mandatory && !values[f.key]?.trim())
      .map((f) => f.key),
    syncError,

    toggleLanguage: () => dispatch({ type: 'toggleLanguage' }),
    openSheet: () => dispatch({ type: 'openSheet' }),
    closeSheet: () => dispatch({ type: 'closeSheet' }),

    upload: (options = {}) => {
      counter.current += 1;
      const id = `doc-${counter.current}`;
      const at = counter.current;

      // The demo paths, kept so the failure states can be shown without a camera.
      if (options.simulate) {
        dispatch({ type: 'uploadStarted', id, at });
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
            dispatch({ type: 'read', id, readOn: today(), candidates: extractionFor(docType, id, at) });
            dispatch({ type: 'closeSheet' });
          });
        });
        return;
      }

      void (async () => {
        const picked =
          options.source === 'camera' ? await captureDocument() : await chooseDocument();

        // Cancelling is not a failure and must not leave a dead row in the list.
        if (!picked.ok) {
          if (picked.reason !== 'cancelled') {
            dispatch({ type: 'uploadStarted', id, at });
            dispatch({ type: 'failed', id, reason: 'unreadable' });
          }
          return;
        }

        dispatch({ type: 'uploadStarted', id, at });

        const readable = looksReadable(picked.document as PickedDocument);
        if (!readable.ok) {
          dispatch({ type: 'failed', id, reason: 'unreadable' });
          return;
        }

        const outcome = await readDocument(picked.document, { documentId: id, readAt: at, as: options.as });

        if (!outcome.ok) {
          // "We could not tell what this is" is a different state from "we could not read it":
          // one the user can resolve by naming the document, the other they cannot.
          if (outcome.reason === 'no-type') {
            dispatch({ type: 'classified', id, docType: 'unknown', confidence: 0.3 });
          } else {
            dispatch({ type: 'failed', id, reason: 'unreadable' });
          }
          dispatch({ type: 'closeSheet' });
          return;
        }

        dispatch({ type: 'classified', id, docType: outcome.documentType, confidence: outcome.confidence });
        dispatch({ type: 'read', id, readOn: today(), candidates: outcome.candidates });
        dispatch({ type: 'closeSheet' });

        /*
         * Saved only now, after a successful read, and never awaited.
         *
         * Storing earlier would leave a permanent "reading…" row for a document that turned out to
         * be unreadable. Awaiting it would make the screen wait on the network to show a result it
         * already has — the fields are on screen the moment they are extracted, whether or not the
         * save lands.
         */
        void persistDocument(
          {
            id,
            kind: outcome.documentType,
            status: 'read',
            confidence: outcome.confidence,
            readAt: new Date(at).toISOString(),
          },
          outcome.candidates,
          { onError: setSyncError },
        );
      })();
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
