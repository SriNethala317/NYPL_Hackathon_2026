import { getFairFaresIncomeLimit } from './fair-fares-limits';
import { PROGRAM_SOURCES } from '../sources';
import type { EligibilityInput, EligibilityResult, ProgramValidator } from '../types';

export const fairFaresValidator: ProgramValidator = {
  programId: 'fair_fares',
  programName: 'Fair Fares NYC',
  validate(input: EligibilityInput): EligibilityResult {
    const reasons: string[] = [];
    const missingFields: string[] = [];

    if (input.nycResident === false) reasons.push('Fair Fares is for New York City residents.');
    else if (input.nycResident === undefined) missingFields.push('nycResident');

    if (input.age === undefined) missingFields.push('age');
    else if (input.age < 18 || input.age > 64) reasons.push('Fair Fares requires applicants to be 18 through 64 years old.');

    const incomeLimit = input.householdSize === undefined ? undefined : getFairFaresIncomeLimit(input.householdSize);
    if (input.householdSize === undefined || incomeLimit === undefined) missingFields.push('householdSize');
    if (input.annualIncome === undefined) missingFields.push('annualIncome');
    else if (incomeLimit !== undefined && input.annualIncome > incomeLimit) {
      reasons.push(`Annual household income is above the Fair Fares limit of $${incomeLimit.toLocaleString('en-US')}.`);
    }

    if (input.receivesFullCarfare === undefined) missingFields.push('receivesFullCarfare');
    else if (input.receivesFullCarfare) reasons.push('Applicant receives or is eligible for full carfare from a NYC agency.');

    if (input.receivesTransportationDiscount === undefined) missingFields.push('receivesTransportationDiscount');
    else if (input.receivesTransportationDiscount && input.fairFaresDiscountType === undefined) {
      missingFields.push('fairFaresDiscountType');
    } else if (input.receivesTransportationDiscount && input.fairFaresDiscountType === 'subway_bus') {
      reasons.push('Applicant receives or is eligible for another transportation discount program for subway and bus service.');
    }

    return {
      programId: 'fair_fares',
      programName: 'Fair Fares NYC',
      status: reasons.length > 0 ? 'likely_not_eligible' : missingFields.length > 0 ? 'needs_more_information' : 'potentially_eligible',
      reasons,
      missingFields,
      source: PROGRAM_SOURCES.fair_fares,
    };
  },
};
