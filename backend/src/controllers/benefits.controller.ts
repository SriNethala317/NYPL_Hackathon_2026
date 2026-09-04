import type { Request, Response } from 'express';
import { readProfile } from '@/api/request-validation';
import { checkEligibility, resolveCanonicalProgramId } from '@/features/eligibility';
import { discoverBenefits } from '@/features/benefits-discovery';

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
  const rawProgramId = typeof request.params.programId === 'string' ? request.params.programId : undefined;
  if (!rawProgramId) return error(response, 400, 'INVALID_REQUEST', 'A programId path parameter is required.', ['programId']);
  // Resolves both the literal ids this controller always understood ("idnyc") and the live
  // catalog's own derived ids ("p032en") to the same canonical id — see program-id-resolver.ts.
  const programId = resolveCanonicalProgramId(rawProgramId);
  if (!programId) {
    return error(response, 404, 'DETAILED_VALIDATION_NOT_SUPPORTED', `Detailed validation is not supported for program: ${rawProgramId}.`);
  }
  const input = readProfile(request.body);
  if ('error' in input) return error(response, 400, input.error.code, input.error.message, input.error.fields);
  const result = checkEligibility(input.profile).find((item) => item.programId === programId);
  if (!result) return error(response, 404, 'PROGRAM_NOT_SUPPORTED', `Program not found: ${programId}.`);
  response.json({ success: true, data: { result } });
}
