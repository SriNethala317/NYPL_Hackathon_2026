import type { BenefitProgram, SafeRecommendationContext } from './types';

const MAX_PROGRAMS_FOR_RANKING = 35;

function searchableText(program: BenefitProgram): string {
  return [program.programName, program.category, program.description, program.eligibilityText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function relevanceTerms(context: SafeRecommendationContext): string[] {
  const terms = ['benefit', 'assistance', 'service'];
  if (context.studentStatus) terms.push('student', 'education', 'school');
  if (context.transportationNeeds) terms.push('transportation', 'transit', 'fare');
  if (context.hasInsurance === false || context.insuranceEligibility === 'unknown') terms.push('health', 'care', 'insurance');
  if (context.annualIncomeBand === 'under_25k' || context.annualIncomeBand === '25k_to_50k') terms.push('food', 'housing', 'cash', 'income', 'employment');
  return terms;
}

/** Reduces prompt size only; it never decides whether someone is eligible. */
export function preFilterPrograms(programs: BenefitProgram[], context: SafeRecommendationContext): BenefitProgram[] {
  const terms = relevanceTerms(context);
  return [...programs]
    .sort((left, right) => {
      const score = (program: BenefitProgram) => terms.reduce((total, term) => total + (searchableText(program).includes(term) ? 1 : 0), 0);
      return score(right) - score(left) || left.programName.localeCompare(right.programName);
    })
    .slice(0, MAX_PROGRAMS_FOR_RANKING);
}
