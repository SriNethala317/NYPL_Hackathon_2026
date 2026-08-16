/**
 * Every user-visible string, in both languages.
 *
 * The language toggle in the header switches the whole app, so no component may contain a
 * literal — they all take copy as props. Long program descriptions stay English for now, which
 * the design handoff also assumes.
 *
 * NYC Local Law 30 sets language access at the top ten citywide languages. Two is a hackathon
 * scope, not a finished position; adding a language should only mean adding a key here.
 */

const en = {
  tabs: { home: 'Home', enrollment: 'Enrollment', profile: 'Profile' },

  titles: {
    home: 'Your applications',
    enrollment: 'Programs for you',
    profile: 'Profile',
  },

  splash: {
    agency: ['Human Resources', 'Administration'],
    badge: 'OFFICIAL CITY OF NEW YORK APP',
  },

  stages: ['Submitted', 'In review', 'Decision'],

  groups: {
    yes: 'You may qualify',
    more: 'Needs more info',
    no: 'May not qualify',
  },

  /**
   * Accurate under the actual architecture: documents are uploaded, read, then deleted. The
   * handoff's original line claimed they never leave the device, which stopped being true the
   * moment extraction moved to the cloud.
   */
  privacy:
    'Your documents are encrypted in transit and at rest, used only to fill your applications, and deleted once we have read them.',

  home: {
    emptyTitle: 'No applications yet',
    emptyBody: 'Add your documents and we will show you what you can apply for.',
    addDocuments: 'Add documents',
    seeOtherPrograms: 'See other programs',
  },

  enrollment: {
    emptyTitle: 'Nothing to show yet',
    emptyBody:
      'Once your ID and income documents are on file, eligible programs appear here automatically.',
    addDocuments: 'Add documents',
    previewSample: 'Preview with sample documents',
  },

  detail: {
    back: 'Back',
    startApplication: 'Start application',
    applyAnyway: 'Apply anyway',
    addDocuments: 'Add documents',
    seeOtherPrograms: 'See other programs',
    beforeYouCanApply: 'Before you can apply',
    whyYouMayNotQualify: 'Why you may not qualify',
    // The app screens; it does not decide. Every dead end says so.
    onlyAgencyDecides:
      'Based on what you have uploaded you may not qualify, but only the agency can decide.',
    facts: { benefit: 'Benefit', appliesTo: 'Applies to', agency: 'Agency', source: 'Rules last checked' },
  },

  form: {
    banner: 'Prefilled from your uploaded documents. Check each field before you continue.',
    fields: {
      fullName: 'Full name',
      dob: 'Date of birth',
      address: 'Home address',
      household: 'People in household',
      income: 'Monthly income',
    },
    fromDocument: 'From your {document}',
    notExtracted: 'Enter this yourself',
    required: 'Required',
    consent:
      'I certify the information above is true and authorize the City to verify it with the documents on file.',
    reviewApplication: 'Review application',
    incomplete: 'Complete every field and certify to continue',
    complete: 'All required fields complete',
  },

  review: {
    edit: 'Edit',
    title: 'Review',
    heading: 'Check your answers before submitting',
    program: 'Program',
    attached: 'Attached documents',
    submit: 'Submit application',
  },

  confirmation: {
    title: 'Application submitted',
    body: 'We sent your application to the agency. You can follow its progress on the Home tab.',
    viewStatus: 'View status',
  },

  profile: {
    yourDocuments: 'Your documents',
    addADocument: 'Add a document',
    loadSample: 'Load sample',
    resetDemo: 'Reset demo',
    countVerified: '{done} of {total} documents verified',
    none: 'No documents on file yet',
    verified: 'Verified',
    add: 'Add',
    notAdded: 'Not added',
    /** Extract-then-discard: the original is gone, so there is no filename to show. */
    readOn: 'Read {date} · original deleted',
    /** The same fact, short enough to sit on one line beside a document name. */
    readShort: 'Read {date}',
  },

  upload: {
    titleGeneric: 'Add a document',
    titleFor: 'Add {document}',
    scan: 'Scan with camera',
    scanBody: 'Photograph the document',
    choose: 'Choose a file',
    chooseBody: 'PDF or image from Files',
    cancel: 'Cancel',
    reading: 'Reading your document',
  },

  documents: {
    id: 'Photo ID / IDNYC',
    address: 'Proof of address',
    income: 'Pay stubs',
    lease: 'Lease',
    utility: 'Utility bill',
  },

  programs: {
    fair_fares: {
      name: 'Fair Fares NYC',
      blurb: 'Half-price subway and bus fares for New Yorkers with low incomes.',
    },
    snap: {
      name: 'SNAP food benefits',
      blurb: 'Monthly money for groceries, loaded onto an EBT card.',
    },
    medicaid: {
      name: 'Medicaid',
      blurb: 'Free or low-cost health coverage for New Yorkers who qualify.',
    },
  },

  reasons: {
    addDocument: 'Add: {document}',
    incomeOverLimit: 'Income above the {program} limit ({limit})',
  },
};

/**
 * `en` is the schema as well as the English copy, so every other language is required to have
 * the same keys. Deliberately not `as const` — that would freeze each value to its literal and
 * demand `es` repeat the English word for word.
 */
type Strings = typeof en;

const es: Strings = {
  tabs: { home: 'Inicio', enrollment: 'Inscripción', profile: 'Perfil' },

  titles: {
    home: 'Sus solicitudes',
    enrollment: 'Programas para usted',
    profile: 'Perfil',
  },

  splash: {
    agency: ['Recursos Humanos', 'Administración'],
    badge: 'APLICACIÓN OFICIAL DE LA CIUDAD DE NUEVA YORK',
  },

  stages: ['Enviada', 'En revisión', 'Decisión'],

  groups: {
    yes: 'Puede calificar',
    more: 'Falta información',
    no: 'Puede no calificar',
  },

  privacy:
    'Sus documentos se cifran en tránsito y en reposo, se usan solo para completar sus solicitudes y se eliminan una vez leídos.',

  home: {
    emptyTitle: 'Aún no hay solicitudes',
    emptyBody: 'Agregue sus documentos y le mostraremos a qué puede aplicar.',
    addDocuments: 'Agregar documentos',
    seeOtherPrograms: 'Ver otros programas',
  },

  enrollment: {
    emptyTitle: 'Nada que mostrar aún',
    emptyBody:
      'Cuando sus documentos de identidad e ingresos estén archivados, los programas elegibles aparecerán aquí automáticamente.',
    addDocuments: 'Agregar documentos',
    previewSample: 'Ver con documentos de ejemplo',
  },

  detail: {
    back: 'Atrás',
    startApplication: 'Comenzar solicitud',
    applyAnyway: 'Solicitar de todos modos',
    addDocuments: 'Agregar documentos',
    seeOtherPrograms: 'Ver otros programas',
    beforeYouCanApply: 'Antes de poder solicitar',
    whyYouMayNotQualify: 'Por qué puede no calificar',
    onlyAgencyDecides:
      'Según lo que ha subido, puede que no califique, pero solo la agencia puede decidir.',
    facts: {
      benefit: 'Beneficio',
      appliesTo: 'Aplica a',
      agency: 'Agencia',
      source: 'Reglas verificadas',
    },
  },

  form: {
    banner:
      'Completado con sus documentos subidos. Revise cada campo antes de continuar.',
    fields: {
      fullName: 'Nombre completo',
      dob: 'Fecha de nacimiento',
      address: 'Dirección',
      household: 'Personas en el hogar',
      income: 'Ingreso mensual',
    },
    fromDocument: 'De su {document}',
    notExtracted: 'Ingrese esto usted mismo',
    required: 'Obligatorio',
    consent:
      'Certifico que la información anterior es verdadera y autorizo a la Ciudad a verificarla con los documentos archivados.',
    reviewApplication: 'Revisar solicitud',
    incomplete: 'Complete todos los campos y certifique para continuar',
    complete: 'Todos los campos obligatorios están completos',
  },

  review: {
    edit: 'Editar',
    title: 'Revisar',
    heading: 'Revise sus respuestas antes de enviar',
    program: 'Programa',
    attached: 'Documentos adjuntos',
    submit: 'Enviar solicitud',
  },

  confirmation: {
    title: 'Solicitud enviada',
    body: 'Enviamos su solicitud a la agencia. Puede seguir su progreso en la pestaña Inicio.',
    viewStatus: 'Ver estado',
  },

  profile: {
    yourDocuments: 'Sus documentos',
    addADocument: 'Agregar un documento',
    loadSample: 'Cargar ejemplo',
    resetDemo: 'Reiniciar demo',
    countVerified: '{done} de {total} documentos verificados',
    none: 'Aún no hay documentos archivados',
    verified: 'Verificado',
    add: 'Agregar',
    notAdded: 'No agregado',
    readOn: 'Leído {date} · original eliminado',
    readShort: 'Leído {date}',
  },

  upload: {
    titleGeneric: 'Agregar un documento',
    titleFor: 'Agregar {document}',
    scan: 'Escanear con la cámara',
    scanBody: 'Fotografíe el documento',
    choose: 'Elegir un archivo',
    chooseBody: 'PDF o imagen de Archivos',
    cancel: 'Cancelar',
    reading: 'Leyendo su documento',
  },

  documents: {
    id: 'Identificación con foto / IDNYC',
    address: 'Comprobante de domicilio',
    income: 'Talones de pago',
    lease: 'Contrato de arrendamiento',
    utility: 'Factura de servicios',
  },

  programs: {
    fair_fares: {
      name: 'Fair Fares NYC',
      blurb: 'Pasajes de metro y autobús a mitad de precio para neoyorquinos de bajos ingresos.',
    },
    snap: {
      name: 'Beneficios SNAP',
      blurb: 'Dinero mensual para comestibles, cargado en una tarjeta EBT.',
    },
    medicaid: {
      name: 'Medicaid',
      blurb: 'Cobertura médica gratuita o de bajo costo para quienes califican.',
    },
  },

  reasons: {
    addDocument: 'Agregar: {document}',
    incomeOverLimit: 'Ingreso superior al límite de {program} ({limit})',
  },
};

export type Language = 'en' | 'es';

export const dictionaries: Record<Language, Strings> = { en, es };

export type { Strings };

/** Fills `{name}` placeholders. Keeps interpolation out of the screens. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
