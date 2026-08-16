import { FEATURE_FLAGS } from './feature-flags';

export const BENEFITS_CONFIG = {
  liveScreeningEnabled: FEATURE_FLAGS.liveBenefitsScreening,
  liveCatalogEnabled: FEATURE_FLAGS.liveBenefitsCatalog,
  fixtureFallbackEnabled: FEATURE_FLAGS.fixtureFallback,
  requestTimeoutMs: 8_000,
  deepValidationProgramIds: ['fair_fares', 'idnyc', 'nyc_care'],
  formAutomationProgramIds: ['fair_fares', 'idnyc', 'nyc_care'],
  deepValidationProgramCodes: ['S2R034', 'S2R032'],
  deepValidationProgramNames: ['Fair Fares NYC', 'IDNYC', 'NYC Care'],
  screeningApi: {
    documentationUrl: 'https://screeningapidocs.cityofnewyork.us/',
    // NYC issues this endpoint after account onboarding. Do not guess or commit it.
    endpoint: undefined as string | undefined,
  },
  catalog: {
    datasetUrl: 'https://data.cityofnewyork.us/api/views/yjpx-srhp/rows.json?accessType=DOWNLOAD',
    landingPageUrl: 'https://data.cityofnewyork.us/Social-Services/NYC-Benefits-Platform-Benefits-and-Programs-Multil/yjpx-srhp/about_data',
  },
} as const;
