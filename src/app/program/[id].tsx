import { router, useLocalSearchParams } from 'expo-router';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

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
import { criteriaFor, programById } from '@/data/catalogue';
import {
  ageFromDob,
  evaluate,
  isDocumentCategory,
  monthlyToAnnual,
  toVisualStatus,
} from '@/data/eligibility';
import { hasTemplate } from '@/features/forms';
import { fill, useStrings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';
import { colors, layout } from '@/theme';

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export default function ProgramDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const strings = useStrings();
  const { values, categoriesOnFile } = useAppStore();

  const program = programById(id);
  const record = criteriaFor(id);

  const result = evaluate(id, {
    age: ageFromDob(values.dob),
    householdSize: values.household ? Number(values.household) : undefined,
    annualIncome: values.income ? monthlyToAnnual(values.income) : undefined,
    nycResident: values.address ? true : undefined,
    categoriesOnFile,
  });

  if (!program) {
    /*
     * A stale link or a programme the City has withdrawn. Rendering just the header left a blank
     * screen with nothing to read and nothing to do -- the failure looked like a crash while
     * reporting nothing.
     */
    return (
      <View style={styles.root}>
        <BackHeader label={strings.detail.back} onPress={() => router.back()} />
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.body}>
            <Card style={styles.explain} accent={colors.amber}>
              <Text variant="cardTitle">{strings.catalogue.notFoundTitle}</Text>
              <Text variant="bodySm" color="muted">
                {strings.catalogue.notFoundBody}
              </Text>
              <Button
                label={strings.catalogue.browseAll}
                size="md"
                onPress={() => router.navigate('/enrollment')}
              />
            </Card>
          </View>
        </ScrollView>
      </View>
    );
  }

  const screened = result.status !== 'not_screened';
  const status = screened ? toVisualStatus(result.status) : 'more';
  const missingCategories = result.missingFields.filter(isDocumentCategory);

  return (
    <View style={styles.root}>
      <BackHeader label={strings.detail.back} onPress={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.body}>
          {screened ? (
            <StatusBadge status={status} label={strings.groups[status]} />
          ) : (
            <StatusBadge status="more" label={strings.catalogue.notScreenedGroup} />
          )}

          <Text variant="programTitle">{program.name}</Text>
          {program.summary ? (
            <Text variant="body" color="muted">
              {program.summary}
            </Text>
          ) : null}

          <RowGroup style={styles.facts}>
            {program.agency ? (
              <DataRow label={strings.detail.facts.agency} value={program.agency} />
            ) : null}
            {program.category ? (
              <DataRow label={strings.detail.facts.appliesTo} value={program.category} />
            ) : null}
            {program.populationServed.length > 0 ? (
              <DataRow
                label={strings.detail.facts.benefit}
                value={program.populationServed.join(', ')}
              />
            ) : null}
          </RowGroup>

          {/*
            Why we said what we said. Every negative quotes the City's own sentence, so a person
            can check the rule that was applied to them rather than taking our word for it.
          */}
          {result.reasonDetails.length > 0 && (
            <Card style={styles.explain}>
              <Text variant="cardTitle">{strings.detail.whyYouMayNotQualify}</Text>
              {result.reasonDetails.map((detail) => (
                <View key={detail.code} style={styles.reason}>
                  <Text variant="bodySm" color="muted">
                    {reasonLine(detail, strings, Number(values.household) || 1)}
                  </Text>
                  {detail.sourceText ? (
                    <Text variant="caption" color="disabled">
                      “{detail.sourceText}”
                    </Text>
                  ) : null}
                </View>
              ))}
              <Text variant="bodySm" color="muted">
                {strings.detail.onlyAgencyDecides}
              </Text>
            </Card>
          )}

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

          {/* The official rules, verbatim. This is the authority; our screening is a convenience. */}
          {program.eligibilityText ? (
            <Card style={styles.explain}>
              <Text variant="cardTitle">{strings.catalogue.officialRules}</Text>
              <Text variant="bodySm" color="muted">
                {program.eligibilityText}
              </Text>
              {!record?.scorable ? (
                <Text variant="caption" color="disabled">
                  {strings.catalogue.notScreenedBody}
                </Text>
              ) : null}
            </Card>
          ) : null}

          {program.requiredDocumentsText ? (
            <Card style={styles.explain}>
              <Text variant="cardTitle">{strings.catalogue.whatYouWillNeed}</Text>
              <Text variant="bodySm" color="muted">
                {program.requiredDocumentsText}
              </Text>
            </Card>
          ) : null}
        </View>
      </ScrollView>

      <StickyFooter>
        {/*
          The point of the whole pipeline: hand over the agency's own PDF with the applicant's
          details already in it. Offered ahead of "start application", because filling the real
          form is the thing that actually saves them an afternoon.
        */}
        {hasTemplate(id) && (
          <Button
            label={strings.form2.fillAction}
            onPress={() => router.push(`/form/${encodeURIComponent(id)}`)}
          />
        )}

        {screened && status === 'yes' && !hasTemplate(id) && (
          <Button
            label={strings.detail.startApplication}
            onPress={() => router.push(`/apply/${encodeURIComponent(id)}`)}
          />
        )}

        {screened && status === 'more' && missingCategories.length > 0 && (
          <Button
            label={strings.detail.addDocuments}
            variant="accent"
            onPress={() => router.navigate('/profile')}
          />
        )}

        {/*
          Never a dead end. Eligibility is the agency's determination and our reading of the rules
          can be wrong, so the applicant keeps the right to try.
        */}
        {screened && status === 'no' && (
          <Button
            label={strings.detail.applyAnyway}
            onPress={() => router.push(`/apply/${encodeURIComponent(id)}`)}
          />
        )}

        {program.applyUrl ? (
          <Button
            label={strings.catalogue.applyOnOfficialSite}
            variant="secondary"
            onPress={() => Linking.openURL(program.applyUrl as string)}
          />
        ) : null}
      </StickyFooter>
    </View>
  );
}

function reasonLine(
  detail: { code: string; limit?: number },
  strings: ReturnType<typeof useStrings>,
  householdSize: number,
) {
  switch (detail.code) {
    case 'income-over-limit':
      return fill(strings.reasons.incomeOverLimit, {
        size: householdSize,
        limit: usd.format(detail.limit ?? 0),
      });
    case 'below-min-age':
      return fill(strings.reasons.belowMinAge, { limit: detail.limit ?? 0 });
    case 'above-max-age':
      return fill(strings.reasons.aboveMaxAge, { limit: detail.limit ?? 0 });
    case 'not-nyc-resident':
      return strings.reasons.notNycResident;
    default:
      return detail.code;
  }
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
  reason: {
    gap: 4,
  },
});
