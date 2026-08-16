import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';

import type { ProgramId } from '@/data/programs';
import type { ProfileFieldKey } from '@/data/profile-fields';
import {
  sampleApplication,
  sampleDocuments,
  sampleProfile,
  sampleReadDate,
} from '@/data/sample-profile';
import type { Language } from '@/i18n/strings';
import { motion, type DocumentKind } from '@/theme';

/**
 * All app state, in one reducer.
 *
 * Deliberately absent: the design's `tab`, `route` and `programId` fields. Those are navigation,
 * and expo-router owns them — duplicating them here is how the two get out of sync.
 *
 * When Supabase lands, everything below the UI section becomes server state. The shapes are
 * chosen so that swap does not reach the screens.
 */

/**
 * A document is never simply "there or not". Upload → OCR → LLM is asynchronous and can fail,
 * so `scanning` is a real state rather than a 1700ms cosmetic delay.
 *
 * `failed` has no screen in the design — see docs/architecture-review.md. It is modelled here so
 * the gap is visible in the type rather than silently impossible.
 */
export type DocumentStatus = 'missing' | 'scanning' | 'read' | 'failed';

export type DocumentState = {
  status: DocumentStatus;
  /** When the document was read. Under extract-then-discard there is no file left to name. */
  readOn?: string;
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
  documents: Record<DocumentKind, DocumentState>;
  /** Values extracted from documents, or typed by the user. */
  values: Partial<Record<ProfileFieldKey, string>>;
  /**
   * Fields the user has actually looked at and accepted, mirroring `confirmedFields` in the
   * eligibility engine. An LLM-extracted value the user never saw should not be certified as
   * true on a government form.
   */
  confirmedFields: ProfileFieldKey[];
  applications: Application[];
  consent: boolean;
  /** Validation is only revealed after a failed submit attempt, per the design. */
  touched: boolean;
  lastReference: string | null;
  sheet: { open: boolean; target: DocumentKind | null };
};

type Action =
  | { type: 'toggleLanguage' }
  | { type: 'openSheet'; target: DocumentKind | null }
  | { type: 'closeSheet' }
  | { type: 'scanStarted'; kind: DocumentKind }
  | { type: 'scanFinished'; kind: DocumentKind; readOn: string }
  | { type: 'setValue'; key: ProfileFieldKey; value: string }
  | { type: 'confirmField'; key: ProfileFieldKey }
  | { type: 'prefillForm' }
  | { type: 'setConsent'; value: boolean }
  | { type: 'setTouched'; value: boolean }
  | { type: 'submitted'; programId: ProgramId; reference: string; date: string }
  | { type: 'loadSample'; readOn: string; date: string }
  | { type: 'reset' };

const emptyDocuments: Record<DocumentKind, DocumentState> = {
  id: { status: 'missing' },
  address: { status: 'missing' },
  income: { status: 'missing' },
  lease: { status: 'missing' },
  utility: { status: 'missing' },
};

const initialState: State = {
  language: 'en',
  documents: emptyDocuments,
  values: {},
  confirmedFields: [],
  applications: [],
  consent: false,
  touched: false,
  lastReference: null,
  sheet: { open: false, target: null },
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'toggleLanguage':
      return { ...state, language: state.language === 'en' ? 'es' : 'en' };

    case 'openSheet':
      return { ...state, sheet: { open: true, target: action.target } };

    case 'closeSheet':
      return { ...state, sheet: { open: false, target: null } };

    case 'scanStarted':
      return {
        ...state,
        documents: { ...state.documents, [action.kind]: { status: 'scanning' } },
      };

    case 'scanFinished': {
      const documents = {
        ...state.documents,
        [action.kind]: { status: 'read' as const, readOn: action.readOn },
      };
      // Extraction fills only the fields this document is the source for, and never
      // overwrites something the user has already typed.
      const values = { ...state.values };
      for (const [key, value] of Object.entries(extractionFor(action.kind))) {
        if (!values[key as ProfileFieldKey]) values[key as ProfileFieldKey] = value;
      }
      return { ...state, documents, values };
    }

    case 'setValue':
      return {
        ...state,
        values: { ...state.values, [action.key]: action.value },
        // Typing a value is itself confirmation of it.
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

    case 'prefillForm':
      return { ...state, touched: false };

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

    case 'loadSample':
      return {
        ...state,
        documents: sampleDocuments.reduce(
          (acc, kind) => ({ ...acc, [kind]: { status: 'read' as const, readOn: action.readOn } }),
          { ...emptyDocuments },
        ),
        values: { ...sampleProfile.values },
        confirmedFields: [],
        applications: [{ ...sampleApplication, date: action.date }],
      };

    case 'reset':
      return { ...initialState, language: state.language };
  }
}

/** What each document yields. The real pipeline returns this from an Edge Function. */
function extractionFor(kind: DocumentKind): Partial<Record<ProfileFieldKey, string>> {
  switch (kind) {
    case 'id':
      return { fullName: sampleProfile.values.fullName, dob: sampleProfile.values.dob };
    case 'address':
      return { address: sampleProfile.values.address };
    case 'income':
      return { income: sampleProfile.values.income };
    case 'lease':
      return { household: sampleProfile.values.household };
    case 'utility':
      return {};
  }
}

type Store = State & {
  toggleLanguage: () => void;
  openSheet: (target?: DocumentKind | null) => void;
  closeSheet: () => void;
  scan: (kind: DocumentKind) => void;
  setValue: (key: ProfileFieldKey, value: string) => void;
  confirmField: (key: ProfileFieldKey) => void;
  setConsent: (value: boolean) => void;
  setTouched: (value: boolean) => void;
  submit: (programId: ProgramId) => string;
  loadSample: () => void;
  reset: () => void;
  documentsOnFile: DocumentKind[];
};

const AppStoreContext = createContext<Store | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const store: Store = {
    ...state,

    toggleLanguage: () => dispatch({ type: 'toggleLanguage' }),
    openSheet: (target = null) => dispatch({ type: 'openSheet', target }),
    closeSheet: () => dispatch({ type: 'closeSheet' }),

    scan: (kind) => {
      dispatch({ type: 'scanStarted', kind });
      // Stands in for upload → OCR → LLM. Real latency is seconds, not milliseconds, and this
      // call can fail; see the `failed` status above.
      const timer = setTimeout(() => {
        dispatch({ type: 'scanFinished', kind, readOn: today() });
        dispatch({ type: 'closeSheet' });
      }, motion.scanDuration);
      timers.current.push(timer);
    },

    setValue: (key, value) => dispatch({ type: 'setValue', key, value }),
    confirmField: (key) => dispatch({ type: 'confirmField', key }),
    setConsent: (value) => dispatch({ type: 'setConsent', value }),
    setTouched: (value) => dispatch({ type: 'setTouched', value }),

    submit: (programId) => {
      const reference = newReference();
      dispatch({ type: 'submitted', programId, reference, date: today() });
      return reference;
    },

    loadSample: () => dispatch({ type: 'loadSample', readOn: sampleReadDate, date: today() }),
    reset: () => dispatch({ type: 'reset' }),

    documentsOnFile: (Object.keys(state.documents) as DocumentKind[]).filter(
      (kind) => state.documents[kind].status === 'read',
    ),
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
