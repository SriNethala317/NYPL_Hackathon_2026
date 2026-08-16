import { router } from 'expo-router';
import { Fragment } from 'react';

import { EmptyStateCard, PrivacyNote, ProgramRow, SectionLabel, TabScreen } from '@/components';
import {
  evaluateAll,
  isDocumentKind,
  limitFromReason,
  monthlyToAnnual,
  toVisualStatus,
  type EligibilityResult,
} from '@/data/mock-eligibility';
import { formatUsd, programById, type ProgramId } from '@/data/programs';
import { fill, useStrings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';
import { eligibility, type EligibilityStatus } from '@/theme';

/** The order the design renders the three groups in. */
const groupOrder: EligibilityStatus[] = ['yes', 'more', 'no'];

export default function EnrollmentScreen() {
  const strings = useStrings();
  const store = useAppStore();
  const { language, toggleLanguage, values, documentsOnFile } = store;

  const results = evaluateAll({
    householdSize: values.household ? Number(values.household) : undefined,
    annualIncome: values.income ? monthlyToAnnual(values.income) : undefined,
    documentsOnFile,
  });

  const hasAnyDocument = documentsOnFile.length > 0;

  const grouped = groupOrder.map((group) => ({
    group,
    results: results.filter((r) => toVisualStatus(r.status) === group),
  }));

  return (
    <TabScreen
      title={strings.titles.enrollment}
      language={language}
      onToggleLanguage={toggleLanguage}>
      {!hasAnyDocument ? (
        <EmptyStateCard
          title={strings.enrollment.emptyTitle}
          body={strings.enrollment.emptyBody}
          action={{
            label: strings.enrollment.addDocuments,
            onPress: () => router.navigate('/profile'),
          }}
          secondaryAction={{
            label: strings.enrollment.previewSample,
            onPress: store.loadSample,
          }}
        />
      ) : (
        grouped.map(
          ({ group, results: rows }) =>
            rows.length > 0 && (
              <Fragment key={group}>
                <SectionLabel
                  label={strings.groups[group]}
                  dotColor={eligibility[group].accent}
                />
                {rows.map((result) => (
                  <ProgramRow
                    key={result.programId}
                    name={strings.programs[result.programId as ProgramId].name}
                    blurb={strings.programs[result.programId as ProgramId].blurb}
                    meta={metaFor(result, strings)}
                    status={toVisualStatus(result.status)}
                    onPress={() => router.push(`/program/${result.programId}`)}
                  />
                ))}
              </Fragment>
            ),
        )
      )}

      <PrivacyNote>{strings.privacy}</PrivacyNote>
    </TabScreen>
  );
}

/**
 * The status line under a program's blurb.
 *
 * `missingFields` and `reasons` come straight from the eligibility contract, so this keeps
 * working unchanged once the real engine replaces the mock.
 */
function metaFor(result: EligibilityResult, strings: ReturnType<typeof useStrings>) {
  const missingDoc = result.missingFields.find(isDocumentKind);
  if (missingDoc) {
    return fill(strings.reasons.addDocument, { document: strings.documents[missingDoc] });
  }

  const limit = result.reasons.map(limitFromReason).find((n): n is number => n !== null);
  if (limit !== undefined) {
    return fill(strings.reasons.incomeOverLimit, {
      program: strings.programs[result.programId as ProgramId].name,
      limit: `${formatUsd(limit)}/yr`,
    });
  }

  // Nothing missing and nothing disqualifying — lead with what the applicant would get.
  return programById(result.programId as ProgramId).benefit;
}
