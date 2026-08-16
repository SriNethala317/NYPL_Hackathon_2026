import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  BackHeader,
  Button,
  Card,
  DataRow,
  RowGroup,
  StatusBadge,
  StickyFooter,
  Text,
} from '@/components';
import {
  evaluate,
  isDocumentCategory,
  limitFromReason,
  monthlyToAnnual,
  toVisualStatus,
} from '@/data/mock-eligibility';
import { formatUsd, programById, type ProgramId } from '@/data/programs';
import { fill, useStrings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';
import { colors, layout } from '@/theme';

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: ProgramId }>();
  const strings = useStrings();
  const { values, categoriesOnFile } = useAppStore();

  const program = programById(id);
  const copy = strings.programs[id];

  const result = evaluate(id, {
    householdSize: values.household ? Number(values.household) : undefined,
    annualIncome: values.income ? monthlyToAnnual(values.income) : undefined,
    categoriesOnFile,
  });
  const status = toVisualStatus(result.status);

  const missingCategories = result.missingFields.filter(isDocumentCategory);
  const limit = result.reasons.map(limitFromReason).find((n): n is number => n !== null);

  return (
    <View style={styles.root}>
      <BackHeader label={strings.detail.back} onPress={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.body}>
          <StatusBadge status={status} label={strings.groups[status]} />

          <Text variant="programTitle">{copy.name}</Text>
          <Text variant="body" color="muted">
            {copy.blurb}
          </Text>

          <RowGroup style={styles.facts}>
            <DataRow label={strings.detail.facts.benefit} value={program.benefit} />
            <DataRow label={strings.detail.facts.appliesTo} value={program.appliesTo} />
            <DataRow label={strings.detail.facts.agency} value={program.agency} />
            {/*
              Surfacing when the rules were last checked, because a stale income limit is the
              most likely way this screen misleads someone.
            */}
            <DataRow label={strings.detail.facts.source} value={program.source.lastVerified} />
          </RowGroup>

          {missingCategories.length > 0 && (
            <Card style={styles.explain}>
              <Text variant="cardTitle">{strings.detail.beforeYouCanApply}</Text>
              {missingCategories.map((category) => (
                <Text key={category} variant="bodySm" color="muted">
                  · {strings.categories[category]}
                </Text>
              ))}
            </Card>
          )}

          {limit !== undefined && (
            <Card style={styles.explain}>
              <Text variant="cardTitle">{strings.detail.whyYouMayNotQualify}</Text>
              <Text variant="bodySm" color="muted">
                {fill(strings.reasons.incomeOverLimit, {
                  program: copy.name,
                  limit: `${formatUsd(limit)}/yr`,
                })}
              </Text>
              {/*
                The app screens; it does not decide. Saying so here is what makes "Apply anyway"
                below an honest option rather than a trap.
              */}
              <Text variant="bodySm" color="muted">
                {strings.detail.onlyAgencyDecides}
              </Text>
            </Card>
          )}
        </View>
      </ScrollView>

      <StickyFooter>
        {status === 'yes' && (
          <Button
            label={strings.detail.startApplication}
            onPress={() => router.push(`/apply/${id}`)}
          />
        )}

        {status === 'more' && (
          <Button
            label={strings.detail.addDocuments}
            variant="accent"
            onPress={() => router.navigate('/profile')}
          />
        )}

        {/*
          Never a dead end. Eligibility is the agency's determination, and OCR'd income can be
          wrong, so the applicant keeps the right to try.
        */}
        {status === 'no' && (
          <>
            <Button label={strings.detail.applyAnyway} onPress={() => router.push(`/apply/${id}`)} />
            <Button
              label={strings.detail.seeOtherPrograms}
              variant="tertiary"
              onPress={() => router.navigate('/enrollment')}
            />
          </>
        )}
      </StickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.offWhite,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 18,
    paddingHorizontal: layout.screenPaddingX,
    paddingBottom: 40,
  },
  body: {
    flex: 1,
    gap: 10,
    maxWidth: layout.maxContentWidth,
  },
  facts: {
    marginTop: 8,
  },
  explain: {
    padding: 16,
    gap: 8,
  },
});
