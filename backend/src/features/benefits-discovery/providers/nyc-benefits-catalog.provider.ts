import { BENEFITS_CONFIG } from '@/config/benefits.config';
import type { BenefitsCatalogProvider } from '../adapters/benefits-catalog-provider';
import type { BenefitProgram } from '../types';

type SocrataResponse = { meta?: { view?: { columns?: Array<{ fieldName?: string }> } }; data?: unknown[][] };

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function field(record: Record<string, unknown>, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = asText(record[name]);
    if (value) return value;
  }
  return undefined;
}

export class NycBenefitsCatalogProvider implements BenefitsCatalogProvider {
  private lastLoadStats?: { rawMultilingualRows: number; normalizedEnglishPrograms: number };

  getLastLoadStats(): { rawMultilingualRows: number; normalizedEnglishPrograms: number } | undefined {
    return this.lastLoadStats;
  }

  async getPrograms(programCodes?: string[]): Promise<BenefitProgram[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BENEFITS_CONFIG.requestTimeoutMs);
    try {
      const response = await fetch(BENEFITS_CONFIG.catalog.datasetUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`NYC dataset request failed (${response.status}).`);
      const payload = (await response.json()) as SocrataResponse;
      const columns = payload.meta?.view?.columns ?? [];
      const records = (payload.data ?? []).map((row) => Object.fromEntries(columns.map((column, index) => [column.fieldName ?? String(index), row[index]])));
      const requested = programCodes?.length ? new Set(programCodes) : undefined;
      const seenProgramIds = new Set<string>();
      const programs = records
        // The official multilingual dataset has one row per language. English is
        // the MVP catalog language, and program-id de-duplication protects us
        // if a row is repeated in the source. Program codes are not unique.
        .filter((record) => field(record, 'language') === 'English')
        .filter((record) => !requested || requested.has(field(record, 'program_code') ?? ''))
        .map((record): BenefitProgram | undefined => {
          const programName = field(record, 'program_name');
          if (!programName) return undefined;
          const programId = (field(record, 'unique_id_number') ?? programName).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
          if (seenProgramIds.has(programId)) return undefined;
          seenProgramIds.add(programId);
          const programCode = field(record, 'program_code');
          return {
            programId, programCode, programName,
            category: field(record, 'program_category'), description: field(record, 'program_description'),
            eligibilityText: field(record, 'plain_language_eligibility'),
            officialSourceUrl: BENEFITS_CONFIG.catalog.landingPageUrl,
            applicationUrl: field(record, 'url_of_online_application'),
            source: { type: 'nyc_dataset', lastVerified: '2026-08-15' },
          };
        })
        .filter((program): program is BenefitProgram => Boolean(program));
      this.lastLoadStats = { rawMultilingualRows: records.length, normalizedEnglishPrograms: programs.length };
      return programs;
    } finally { clearTimeout(timer); }
  }
}
