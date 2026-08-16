import type { Request, Response } from 'express';
import { readProfile } from '@/api/request-validation';
import { checkEligibility } from '@/features/eligibility';
import { discoverBenefits } from '@/features/benefits-discovery';

const SUPPORTED_PROGRAM_IDS = new Set(['fair_fares', 'idnyc', 'nyc_care']);

function error(response: Response, status: number, code: string, message: string, fields?: string[]): void {
  response.status(status).json({ success: false, error: { code, message, ...(fields ? { fields } : {}) } });
}

export async function discoverBenefitsController(request: Request, response: Response): Promise<void> {
  const input = readProfile(request.body);
  if ('error' in input) return error(response, 400, input.error.code, input.error.message, input.error.fields);
  const recommendations = await discoverBenefits(input.profile);
  response.json({ success: true, data: { recommendations } });
}

export function validateProgramController(request: Request, response: Response): void {
  const programId = typeof request.params.programId === 'string' ? request.params.programId : undefined;
  if (!programId) return error(response, 400, 'INVALID_REQUEST', 'A programId path parameter is required.', ['programId']);
  if (!SUPPORTED_PROGRAM_IDS.has(programId)) {
    return error(response, 404, 'DETAILED_VALIDATION_NOT_SUPPORTED', `Detailed validation is not supported for program: ${programId}.`);
  }
  const input = readProfile(request.body);
  if ('error' in input) return error(response, 400, input.error.code, input.error.message, input.error.fields);
  const result = checkEligibility(input.profile).find((item) => item.programId === programId);
  if (!result) return error(response, 404, 'PROGRAM_NOT_SUPPORTED', `Program not found: ${programId}.`);
  response.json({ success: true, data: { result } });
}
