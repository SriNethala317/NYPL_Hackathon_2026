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
    facts: {
      benefit: 'Benefit',
      appliesTo: 'Applies to',
      agency: 'Agency',
      source: 'Rules last checked',
    },
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
    stillNeeded: 'Still needed',
    addADocument: 'Add a document',
    loadSample: 'Load sample',
    resetDemo: 'Reset demo',
    countRead: '{done} documents read',
    none: 'No documents on file yet',
    verified: 'Verified',
    /** Extract-then-discard: the original is gone, so there is no filename to show. */
    readOn: 'Read {date} · original deleted',
    /** The same fact, short enough to sit on one line beside a document name. */
    readShort: 'Read {date}',
    missingField: 'We could not read your {field}',
    remove: 'Remove',
  },

  privacyScreen: {
    title: 'Your data',
    intro:
      'Plain answers about what happens to what you upload. Everything below is generated from the code that actually runs, not written separately.',
    readTitle: 'What we read',
    readBody: 'These are the documents we can read, and what we take from each one.',
    keepTitle: 'What we keep',
    keepBody:
      'Only these fields. The document itself is deleted as soon as we have read it \u2014 there is no copy of your passport or pay stub anywhere.',
    neverTitle: 'What we never store',
    neverBody:
      'We read these to complete an application when a program requires it, then drop them. They are never saved.',
    whereTitle: 'Where it goes',
    whereBody:
      'Encrypted while it travels and while it is stored. Used only to fill in applications you choose to make. Never sold, never used for advertising.',
    immigrationTitle: 'Does this affect my immigration status?',
    immigrationBody:
      'Public charge rules apply only to a small group of people applying for a green card, and most benefits are not counted at all. Many people who avoid benefits out of fear were never affected by the rule. If you are unsure, speak to an immigration legal provider before applying \u2014 not to us.',
    immigrationLink: 'Read the City guidance',
    controlTitle: 'Your control',
    controlBody:
      'Remove any document and everything read from it goes with it. Reset the app and nothing is left.',
    deleteEverything: 'Delete everything',
  },
  /** Spoken by screen readers. Untranslated here means a Spanish user hears English. */
  a11y: {
    dismiss: 'Dismiss',
    close: 'Close',
    switchTo: 'Switch to {language}',
    english: 'English',
    spanish: 'Espa\u00f1ol',
    stageOf: 'Stage {n} of {total}: {label}',
  },

  lock: {
    title: 'Unlock Enroll NYC',
    body: 'Your benefit information is behind your device lock.',
    action: 'Try again',
  },

  /** Shown until a photo ID is on file; nothing else is accepted before it. */
  gate: {
    title: 'Start with a photo ID',
    body: 'We need to know who you are before anything else. A passport, state ID, IDNYC or permanent resident card all work.',
    action: 'Add a photo ID',
  },

  conflict: {
    title: 'Two documents disagree',
    body: 'Your documents do not match on {field}. Which is right?',
    use: 'Use this',
  },

  upload: {
    titleGeneric: 'Add a document',
    scan: 'Scan with camera',
    scanBody: 'Photograph the document',
    choose: 'Choose a file',
    chooseBody: 'PDF or image from Files',
    cancel: 'Cancel',
    uploading: 'Uploading',
    reading: 'Reading your document',
    whatIsThis: 'What is this document?',
    whatIsThisBody: 'We could not tell what this is. Pick the closest match and we will read it.',
    failedTitle: 'We could not read that',
    failedBody: 'The photo may be blurry or cropped. Try again with the whole page in frame.',
    tryAgain: 'Try again',
    demoUnknown: 'Demo: unrecognised',
    demoFailure: 'Demo: failed read',
  },

  /** One label per entry in the open document registry. */
  documents: {
    passport: 'Passport',
    state_id: 'State ID',
    drivers_license: 'Driver licence',
    idnyc: 'IDNYC',
    permanent_resident_card: 'Permanent resident card',
    i20: 'Form I-20',
    w2: 'W-2',
    pay_stub: 'Pay stub',
    tax_return: 'Tax return',
    bank_statement: 'Bank statement',
    benefits_letter: 'Benefits letter',
    lease: 'Lease',
    utility_bill: 'Utility bill',
    unknown: 'Unrecognised document',
  },

  /** What a document proves, used wherever any of several files would do. */
  categories: {
    identity: 'Photo ID',
    immigration: 'Immigration document',
    income: 'Proof of income',
    residence: 'Proof of address',
    other: 'Other document',
  },

  /**
   * Program names and descriptions come from NYC Open Data and are English-only at source, so
   * they are not translated here. Everything the app itself says is.
   */
  catalogue: {
    allPrograms: 'All programs',
    notScreenedGroup: 'We could not check these',
    notScreenedBody:
      'The rules for these are published as text we cannot check automatically. Read them and decide for yourself.',
    officialRules: 'Official eligibility rules',
    whatYouWillNeed: 'What you will need',
    applyOnOfficialSite: 'Apply on the official site',
    sourceNote: 'From NYC Open Data, fetched {date}',
    resultCount: '{count} programs',
    filterAll: 'All',
  },

  reasons: {
    addDocument: 'Add: {document}',
    incomeOverLimit: 'Income above the limit for a household of {size} ({limit})',
    belowMinAge: 'You need to be at least {limit}',
    aboveMaxAge: 'This is for people up to {limit}',
    notNycResident: 'This is for New York City residents',
    needDob: 'Add your date of birth',
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
    banner: 'Completado con sus documentos subidos. Revise cada campo antes de continuar.',
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
    stillNeeded: 'Aún falta',
    addADocument: 'Agregar un documento',
    loadSample: 'Cargar ejemplo',
    resetDemo: 'Reiniciar demo',
    countRead: '{done} documentos leídos',
    none: 'Aún no hay documentos archivados',
    verified: 'Verificado',
    readOn: 'Leído {date} · original eliminado',
    readShort: 'Leído {date}',
    missingField: 'No pudimos leer su {field}',
    remove: 'Quitar',
  },

  privacyScreen: {
    title: 'Sus datos',
    intro:
      'Respuestas claras sobre qu\u00e9 pasa con lo que sube. Todo lo siguiente se genera del c\u00f3digo que realmente se ejecuta, no se escribe aparte.',
    readTitle: 'Qu\u00e9 leemos',
    readBody: 'Estos son los documentos que podemos leer y lo que tomamos de cada uno.',
    keepTitle: 'Qu\u00e9 guardamos',
    keepBody:
      'Solo estos campos. El documento se elimina en cuanto lo leemos \u2014 no queda ninguna copia de su pasaporte ni de su talón de pago.',
    neverTitle: 'Qu\u00e9 nunca guardamos',
    neverBody:
      'Leemos esto para completar una solicitud cuando un programa lo exige, y luego lo descartamos. Nunca se guarda.',
    whereTitle: 'A d\u00f3nde va',
    whereBody:
      'Cifrado mientras viaja y mientras se almacena. Se usa solo para completar las solicitudes que usted elija. Nunca se vende ni se usa para publicidad.',
    immigrationTitle: '\u00bfEsto afecta mi estatus migratorio?',
    immigrationBody:
      'Las reglas de carga p\u00fablica se aplican solo a un grupo peque\u00f1o de personas que solicitan la residencia permanente, y la mayor\u00eda de los beneficios no cuentan. Muchas personas que evitan los beneficios por miedo nunca estuvieron afectadas por la regla. Si tiene dudas, hable con un proveedor legal de inmigraci\u00f3n antes de solicitar \u2014 no con nosotros.',
    immigrationLink: 'Leer la gu\u00eda de la Ciudad',
    controlTitle: 'Su control',
    controlBody:
      'Quite cualquier documento y todo lo le\u00eddo de \u00e9l se va con \u00e9l. Reinicie la aplicaci\u00f3n y no queda nada.',
    deleteEverything: 'Eliminar todo',
  },
  a11y: {
    dismiss: 'Descartar',
    close: 'Cerrar',
    switchTo: 'Cambiar a {language}',
    english: 'English',
    spanish: 'Espa\u00f1ol',
    stageOf: 'Etapa {n} de {total}: {label}',
  },

  lock: {
    title: 'Desbloquear Enroll NYC',
    body: 'Su información de beneficios está protegida por el bloqueo de su dispositivo.',
    action: 'Intentar de nuevo',
  },

  gate: {
    title: 'Empiece con una identificación con foto',
    body: 'Necesitamos saber quién es usted antes que nada. Sirve un pasaporte, una identificación estatal, IDNYC o una tarjeta de residente permanente.',
    action: 'Agregar identificación con foto',
  },

  conflict: {
    title: 'Dos documentos no coinciden',
    body: 'Sus documentos no coinciden en {field}. ¿Cuál es correcto?',
    use: 'Usar este',
  },

  upload: {
    titleGeneric: 'Agregar un documento',
    scan: 'Escanear con la cámara',
    scanBody: 'Fotografíe el documento',
    choose: 'Elegir un archivo',
    chooseBody: 'PDF o imagen de Archivos',
    cancel: 'Cancelar',
    uploading: 'Subiendo',
    reading: 'Leyendo su documento',
    whatIsThis: '¿Qué documento es este?',
    whatIsThisBody: 'No pudimos identificarlo. Elija la opción más parecida y lo leeremos.',
    failedTitle: 'No pudimos leer eso',
    failedBody: 'La foto puede estar borrosa o cortada. Intente de nuevo con la página completa.',
    tryAgain: 'Intentar de nuevo',
    demoUnknown: 'Demo: no reconocido',
    demoFailure: 'Demo: lectura fallida',
  },

  documents: {
    passport: 'Pasaporte',
    state_id: 'Identificación estatal',
    drivers_license: 'Licencia de conducir',
    idnyc: 'IDNYC',
    permanent_resident_card: 'Tarjeta de residente permanente',
    i20: 'Formulario I-20',
    w2: 'Formulario W-2',
    pay_stub: 'Talón de pago',
    tax_return: 'Declaración de impuestos',
    bank_statement: 'Estado de cuenta bancario',
    benefits_letter: 'Carta de beneficios',
    lease: 'Contrato de arrendamiento',
    utility_bill: 'Factura de servicios',
    unknown: 'Documento no reconocido',
  },

  categories: {
    identity: 'Identificación con foto',
    immigration: 'Documento de inmigración',
    income: 'Comprobante de ingresos',
    residence: 'Comprobante de domicilio',
    other: 'Otro documento',
  },

  catalogue: {
    allPrograms: 'Todos los programas',
    notScreenedGroup: 'No pudimos verificar estos',
    notScreenedBody:
      'Las reglas de estos programas se publican como texto que no podemos verificar automáticamente. Léalas y decida usted mismo.',
    officialRules: 'Reglas oficiales de elegibilidad',
    whatYouWillNeed: 'Lo que necesitará',
    applyOnOfficialSite: 'Solicitar en el sitio oficial',
    sourceNote: 'De NYC Open Data, obtenido el {date}',
    resultCount: '{count} programas',
    filterAll: 'Todos',
  },

  reasons: {
    addDocument: 'Agregar: {document}',
    incomeOverLimit: 'Ingreso superior al límite para un hogar de {size} ({limit})',
    belowMinAge: 'Debe tener al menos {limit} años',
    aboveMaxAge: 'Esto es para personas de hasta {limit} años',
    notNycResident: 'Esto es para residentes de la ciudad de Nueva York',
    needDob: 'Agregue su fecha de nacimiento',
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
