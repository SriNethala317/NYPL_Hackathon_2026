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
  const input = readProfile(request.body);
  if ('error' in input) return error(response, 400, input.error.code, input.error.message, input.error.fields);
  // checkEligibility() now screens every scorable program in the real catalogue (~49 of 97), not
  // just the 3 that used to be hardcoded — this looks up whichever one the caller asked for
  // rather than gating on a fixed id list first. Its own `programId` values are the literal
  // scheme for the 3 aliased programs, the catalogue's lowercased id for every other one (see
  // eligibility-engine.ts) — resolving the incoming id through the same alias table first (a live
  // discovery id like "p120en" resolves to "fair_fares") is what lets either form the caller
  // might have find the same result; falling back to the raw id unchanged covers every other,
  // non-aliased program, which checkEligibility() keys on its own lowercased catalogue id.
  const target = (resolveCanonicalProgramId(rawProgramId) ?? rawProgramId).toLowerCase();
  const result = checkEligibility(input.profile).find((item) => item.programId.toLowerCase() === target);
  if (!result) return error(response, 404, 'DETAILED_VALIDATION_NOT_SUPPORTED', `Detailed validation is not supported for program: ${rawProgramId}.`);
  response.json({ success: true, data: { result } });
}
