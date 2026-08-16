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
   * Describes what the code does today, in the present tense.
   *
   * An earlier version promised documents were "encrypted in transit and at rest" and "deleted
   * once we have read them". None of that was implemented — there is no upload, no storage and
   * no encryption anywhere in this app — and it was being shown to people deciding whether it is
   * safe to hand over a passport. Any claim here must be checkable against the code.
   */
  privacy: 'We keep the details from your documents, never the documents themselves.',

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

  /**
   * What actually happened, which is not a submission.
   *
   * This screen used to say "We sent your application to the agency. You can follow its progress
   * on the Home tab." Nothing was sent. `submit()` generates a reference locally and stores a row;
   * there is no public way for an app to file a NYC benefits application, and there is no network
   * call here at all.
   *
   * Told they had applied, someone waits for a decision that is never coming and misses the thing
   * they actually needed to do. For a household waiting on food or rent assistance that is not a
   * cosmetic inaccuracy — it is the worst outcome this app could produce, and it would look like
   * success the whole way.
   */
  confirmation: {
    title: 'Your answers are saved',
    body: 'You have not applied yet. Nothing has been sent to the agency — this app cannot file for you. Take your answers to the agency to finish.',
    /** Deliberately not called a confirmation number: the agency has never seen it. */
    referenceLabel: 'Your note to yourself',
    referenceNote: 'This is our reference, not the agency’s. They will not recognise it.',
    nextTitle: 'How to actually apply',
    applyOnline: 'Open the agency’s application',
    fillForm: 'Fill in the official form',
    noLink: 'This programme does not publish an application link. Call 311 and ask how to apply.',
    viewStatus: 'View saved answers',
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
      'We do not read these at all. Where a form has a box for one, we leave it blank for you to fill in before you sign.',
    whereTitle: 'Where it goes',
    whereBody:
      'Nowhere. On this platform your document is read here, so no image of it has left your phone. Your details are held only while the app is open and are gone when you close it.',
    whereNext:
      'If that ever changes — if a document has to be sent somewhere to be read — this screen will name where it goes before you upload anything.',
    /*
     * Shown instead of the two lines above when the reader that will actually run sends the
     * image off the device. Which of the two you see is decided by `documentDestination()`, not
     * by anyone remembering to edit this file, and `{service}` is filled from the provider, so
     * this screen cannot name the wrong destination or keep denying there is one.
     */
    whereRemoteBody:
      'To read your document, the photograph of it is sent to {service} over an encrypted connection, and nowhere else. Nothing else goes with it — not your name, not what you are applying for. This app keeps no copy of the image.',
    whereRemoteNext:
      'Google runs that service. On the free tier this app uses, an image sent there may be kept for a time and reviewed by a person — so if a document is one you would not show a stranger, add it and type those details in yourself. The text that comes back has Social Security, SEVIS, alien registration and account numbers removed on this phone before anything else sees them.',
    formTitle: 'Filled application forms',
    formBody:
      'When you save a filled form it is written to your phone so you can share it, then deleted as soon as you have. \u201cDelete everything\u201d removes any that are left.',
    immigrationTitle: 'Does this affect my immigration status?',
    immigrationBody:
      'Public charge rules apply only to a small group of people applying for a green card, and most benefits are not counted at all. Many people who avoid benefits out of fear were never affected by the rule. If you are unsure, speak to an immigration legal provider before applying \u2014 not to us.',
    immigrationLink: 'Read the City guidance',
    controlTitle: 'Your control',
    controlBody:
      'Remove any document and everything read from it goes with it. \u201cDelete everything\u201d clears your details and removes any filled forms still on this phone.',
    deleteEverything: 'Delete everything',
  },
  /** Spoken by screen readers. Untranslated here means a Spanish user hears English. */
  /**
   * Keeping benefits, not just getting them. People lose food and health coverage far more often
   * at recertification than at application.
   */
  /** The point of the app: the actual government form, filled in. */
  form2: {
    title: 'Your application form',
    fillAction: 'Fill this form for me',
    preparing: 'Getting the official form',
    filling: 'Filling it in with your details',
    readyTitle: '{filled} boxes filled in for you',
    readyBody: 'This is the real {formName} from the agency, with your information already in it.',
    youMustAdd: 'You still need to add',
    weCouldNotFill: 'We could not fill these',
    download: 'Save or share the form',
    whereToSend: 'Where to send it',
    openPortal: 'Open the submission site',
    unavailableTitle: 'We could not get the form',
    unavailableBody:
      'The agency\u2019s link is not working right now. You can still apply on their site.',
    noFormTitle: 'No fillable form for this programme',
    noFormBody:
      'This programme does not publish a form we can fill in. Apply on the agency site instead.',
    signWarning:
      'Read it before you sign. You are certifying it is true, so check every box we filled.',
    noSubmitApi:
      'We cannot submit for you \u2014 the City has no way for apps to file on your behalf, and we will not ask for your portal password.',
    /** Every route an agency accepts. Paper is listed as an equal, not a consolation. */
    channelNames: {
      'online-portal': 'Apply online',
      mail: 'Send it by post',
      fax: 'Send it by fax',
      'in-person': 'Hand it in',
      email: 'Send it by email',
      cbo: 'Get help from an organisation near you',
    },
  },

  renewal: {
    heading: 'Renewals',
    overdue: 'Renewal was due {date}',
    urgent: 'Renew within {days} days',
    soon: 'Renew by {date}',
    later: 'Renews {date}',
    whyItMatters:
      'Most people who lose benefits lose them at renewal, not when they apply. We will remind you before the deadline.',
    documentsReady: 'Your documents are on file and ready to reuse',
    documentsMissing: 'You will need to add documents again before renewing',
    renewNow: 'Renew now',
  },

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
    manualOnly:
      'This build cannot read documents automatically. Add the document, then type the details in yourself \u2014 or open the app in a browser.',
    /*
     * At the moment of the decision, not buried in a settings screen. Somebody about to
     * photograph a passport is owed the fact that the photograph is going to be sent somewhere,
     * while they can still choose not to.
     */
    sentToProvider:
      'To read it, the photo of your document is sent to {service}. Nothing else about you is sent.',
    demoSample: 'Demo: sample document',
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
    notFoundTitle: 'We could not find that programme',
    notFoundBody:
      'The link may be old, or the programme may have been removed from the City\u2019s list. Browse what is available instead.',
    browseAll: 'See all programmes',
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

  privacy: 'Guardamos los datos de sus documentos, nunca los documentos.',

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
    title: 'Sus respuestas están guardadas',
    body: 'Todavía no ha solicitado. No se ha enviado nada a la agencia — esta aplicación no puede presentar por usted. Lleve sus respuestas a la agencia para terminar.',
    referenceLabel: 'Su nota personal',
    referenceNote: 'Este es nuestro número, no el de la agencia. Ellos no lo reconocerán.',
    nextTitle: 'Cómo solicitar de verdad',
    applyOnline: 'Abrir la solicitud de la agencia',
    fillForm: 'Llenar el formulario oficial',
    noLink: 'Este programa no publica un enlace de solicitud. Llame al 311 y pregunte cómo solicitar.',
    viewStatus: 'Ver respuestas guardadas',
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
      'No leemos esto en absoluto. Cuando un formulario tiene una casilla para ello, la dejamos en blanco para que usted la complete antes de firmar.',
    whereTitle: 'A d\u00f3nde va',
    whereBody:
      'A ninguna parte. En esta plataforma su documento se lee aqu\u00ed mismo, as\u00ed que ninguna imagen de \u00e9l ha salido de su tel\u00e9fono. Sus datos se guardan solo mientras la aplicaci\u00f3n est\u00e1 abierta.',
    whereNext:
      'Si eso cambia alguna vez \u2014 si hay que enviar un documento a otro lugar para leerlo \u2014 esta pantalla dir\u00e1 a d\u00f3nde va antes de que usted suba nada.',
    whereRemoteBody:
      'Para leer su documento, la fotograf\u00eda se env\u00eda a {service} por una conexi\u00f3n cifrada, y a ning\u00fan otro lugar. Nada m\u00e1s la acompa\u00f1a: ni su nombre, ni a qu\u00e9 programa solicita. Esta aplicaci\u00f3n no guarda ninguna copia de la imagen.',
    whereRemoteNext:
      'Ese servicio lo opera Google. En el nivel gratuito que usa esta aplicaci\u00f3n, una imagen enviada all\u00ed puede conservarse un tiempo y ser revisada por una persona \u2014 as\u00ed que si un documento es de los que no le mostrar\u00eda a un desconocido, agr\u00e9guelo y escriba esos datos usted mismo. Al texto que regresa se le quitan en este tel\u00e9fono los n\u00fameros de Seguro Social, SEVIS, registro de extranjero y de cuenta antes de que nada m\u00e1s los vea.',
    formTitle: 'Formularios completados',
    formBody:
      'Cuando guarda un formulario completado, se escribe en su tel\u00e9fono para que pueda compartirlo y se elimina en cuanto lo hace. \u201cEliminar todo\u201d quita los que queden.',
    immigrationTitle: '\u00bfEsto afecta mi estatus migratorio?',
    immigrationBody:
      'Las reglas de carga p\u00fablica se aplican solo a un grupo peque\u00f1o de personas que solicitan la residencia permanente, y la mayor\u00eda de los beneficios no cuentan. Muchas personas que evitan los beneficios por miedo nunca estuvieron afectadas por la regla. Si tiene dudas, hable con un proveedor legal de inmigraci\u00f3n antes de solicitar \u2014 no con nosotros.',
    immigrationLink: 'Leer la gu\u00eda de la Ciudad',
    controlTitle: 'Su control',
    controlBody:
      'Quite cualquier documento y todo lo le\u00eddo de \u00e9l se va con \u00e9l. \u201cEliminar todo\u201d borra sus datos y quita los formularios que queden en este tel\u00e9fono.',
    deleteEverything: 'Eliminar todo',
  },
  form2: {
    title: 'Su formulario de solicitud',
    fillAction: 'Complete este formulario por m\u00ed',
    preparing: 'Obteniendo el formulario oficial',
    filling: 'Complet\u00e1ndolo con sus datos',
    readyTitle: '{filled} casillas completadas por usted',
    readyBody: 'Este es el {formName} real de la agencia, ya con su informaci\u00f3n.',
    youMustAdd: 'Usted a\u00fan debe agregar',
    weCouldNotFill: 'No pudimos completar esto',
    download: 'Guardar o compartir el formulario',
    whereToSend: 'D\u00f3nde enviarlo',
    openPortal: 'Abrir el sitio de env\u00edo',
    unavailableTitle: 'No pudimos obtener el formulario',
    unavailableBody:
      'El enlace de la agencia no funciona ahora. A\u00fan puede solicitar en su sitio.',
    noFormTitle: 'No hay formulario para completar',
    noFormBody:
      'Este programa no publica un formulario que podamos completar. Solicite en el sitio de la agencia.',
    signWarning:
      'L\u00e9alo antes de firmar. Usted certifica que es verdadero, as\u00ed que revise cada casilla.',
    noSubmitApi:
      'No podemos enviarlo por usted \u2014 la Ciudad no permite que las aplicaciones presenten en su nombre, y no le pediremos su contrase\u00f1a del portal.',
    channelNames: {
      'online-portal': 'Solicite en l\u00ednea',
      mail: 'Env\u00edelo por correo postal',
      fax: 'Env\u00edelo por fax',
      'in-person': 'Entr\u00e9guelo en persona',
      email: 'Env\u00edelo por correo electr\u00f3nico',
      cbo: 'Reciba ayuda de una organizaci\u00f3n cercana',
    },
  },

  renewal: {
    heading: 'Renovaciones',
    overdue: 'La renovaci\u00f3n venci\u00f3 el {date}',
    urgent: 'Renueve dentro de {days} d\u00edas',
    soon: 'Renueve antes del {date}',
    later: 'Se renueva el {date}',
    whyItMatters:
      'La mayor\u00eda de las personas pierden sus beneficios en la renovaci\u00f3n, no al solicitar. Le avisaremos antes de la fecha l\u00edmite.',
    documentsReady: 'Sus documentos est\u00e1n archivados y listos para reutilizar',
    documentsMissing: 'Deber\u00e1 agregar documentos otra vez antes de renovar',
    renewNow: 'Renovar ahora',
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
    manualOnly:
      'Esta versi\u00f3n no puede leer documentos autom\u00e1ticamente. Agregue el documento y escriba los datos usted mismo, o abra la aplicaci\u00f3n en un navegador.',
    sentToProvider:
      'Para leerla, la foto de su documento se env\u00eda a {service}. No se env\u00eda nada m\u00e1s sobre usted.',
    demoSample: 'Demo: documento de ejemplo',
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
    notFoundTitle: 'No encontramos ese programa',
    notFoundBody:
      'El enlace puede estar desactualizado, o el programa puede haber sido retirado de la lista de la Ciudad. Explore lo que hay disponible.',
    browseAll: 'Ver todos los programas',
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
