import type { Request, Response } from 'express';
import { readEligibilityResult, readProfile } from '@/api/request-validation';
import { generateFormPayload } from '@/features/form-payload';
import type { EligibilityResult } from '@/features/eligibility';

const SUPPORTED_PROGRAM_IDS = new Set(['fair_fares', 'idnyc', 'nyc_care']);

function error(response: Response, status: number, code: string, message: string, fields?: string[]): void {
  response.status(status).json({ success: false, error: { code, message, ...(fields ? { fields } : {}) } });
}

function isEligibilityResult(value: unknown): value is EligibilityResult {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  return typeof result.programId === 'string'
    && typeof result.programName === 'string'
    && ['potentially_eligible', 'needs_more_information', 'likely_not_eligible'].includes(String(result.status))
    && Array.isArray(result.reasons)
    && Array.isArray(result.missingFields)
    && typeof result.source === 'object'
    && result.source !== null;
}

export function generateFormPayloadController(request: Request, response: Response): void {
  const programId = typeof request.params.programId === 'string' ? request.params.programId : undefined;
  if (!programId) return error(response, 400, 'INVALID_REQUEST', 'A programId path parameter is required.', ['programId']);
  if (!SUPPORTED_PROGRAM_IDS.has(programId)) {
    return error(response, 404, 'FORM_AUTOMATION_NOT_SUPPORTED', `Form payload generation is not supported for program: ${programId}.`);
  }
  const input = readProfile(request.body);
  if ('error' in input) return error(response, 400, input.error.code, input.error.message, input.error.fields);
  const eligibilityResult = readEligibilityResult(request.body);
  if (!isEligibilityResult(eligibilityResult)) {
    return error(response, 400, 'INVALID_REQUEST', 'Request body must include a valid eligibilityResult object.', ['eligibilityResult']);
  }
  if (eligibilityResult.programId !== programId) {
    return error(response, 400, 'INVALID_REQUEST', 'eligibilityResult.programId must match the requested programId.', ['eligibilityResult.programId']);
  }
  try {
    const payload = generateFormPayload(input.profile, programId, eligibilityResult);
    response.json({ success: true, data: { payload } });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Unable to generate form payload.';
    error(response, 400, 'MISSING_INFORMATION', message);
  }
}
