import type { ProgramSource } from './types';

export const PROGRAM_SOURCES: Record<string, ProgramSource> = {
  fair_fares: {
    name: 'Fair Fares NYC',
    url: 'https://www.nyc.gov/site/fairfares/',
    lastVerified: '2026-08-15',
  },
  idnyc: {
    name: 'IDNYC',
    url: 'https://www.nyc.gov/site/idnyc/about/about.page',
    lastVerified: '2026-08-15',
  },
  nyc_care: {
    name: 'NYC Care',
    url: 'https://www.nyccare.nyc/about/',
    lastVerified: '2026-08-15',
  },
};
