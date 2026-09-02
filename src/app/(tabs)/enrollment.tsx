import { router } from 'expo-router';
import { useMemo } from 'react';
import { SectionList, StyleSheet, View } from 'react-native';

import { AppHeader, EmptyStateCard, PrivacyNote, ProgramRow, SectionLabel, Text } from '@/components';
import { catalogueFetchedAt, programById } from '@/data/catalogue';
import {
  ageFromDob,
  evaluateAll,
  isDocumentCategory,
  monthlyToAnnual,
  toVisualStatus,
  type EligibilityResult,
} from '@/data/eligibility';
import { fill, useLanguageSwitchLabel, useStrings, type Strings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';
import { colors, eligibility, layout, type EligibilityStatus } from '@/theme';

/** Render order: what you can act on first, what we could not check last. */
const groupOrder: (EligibilityStatus | 'unscreened')[] = ['yes', 'more', 'no', 'unscreened'];

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export default function EnrollmentScreen() {
  const strings = useStrings();
  const switchLabel = useLanguageSwitchLabel();
  const store = useAppStore();
  const { language, toggleLanguage, values, categoriesOnFile } = store;

  const results = useMemo(
    () =>
      evaluateAll({
        age: ageFromDob(values.dob),
        householdSize: values.household ? Number(values.household) : undefined,
        annualIncome: values.income ? monthlyToAnnual(values.income) : undefined,
        // Address is the only residency signal we hold; absence is unknown, not "no".
        nycResident: values.address ? true : undefined,
        categoriesOnFile,
      }),
    [values.dob, values.household, values.income, values.address, categoriesOnFile],
  );

  const sections = useMemo(() => {
    return groupOrder
      .map((group) => ({
        group,
        title:
          group === 'unscreened'
            ? strings.catalogue.notScreenedGroup
            : strings.groups[group as EligibilityStatus],
        data: results.filter((r) =>
          group === 'unscreened' ? r.status === 'not_screened' : toVisualStatus(r.status) === group && r.status !== 'not_screened',
        ),
      }))
      .filter((section) => section.data.length > 0);
  }, [results, strings]);

  const hasAnyDocument = categoriesOnFile.length > 0;

  return (
    <View style={styles.root}>
      <AppHeader
        title={strings.titles.enrollment}
        language={language}
        switchLabel={switchLabel}
        onToggleLanguage={toggleLanguage}
      />

      {!hasAnyDocument ? (
        <View style={styles.emptyWrap}>
          <EmptyStateCard
            title={strings.enrollment.emptyTitle}
            body={strings.enrollment.emptyBody}
            action={{
              label: strings.enrollment.addDocuments,
              onPress: () => router.navigate('/profile'),
            }}
            // The design's "Preview with sample documents" fabricated four verified documents.
            // The only real substitute is the same trip the primary action takes — there is no
            // eligibility to preview until something has actually been uploaded.
            secondaryAction={{
              label: strings.enrollment.goToProfile,
              onPress: () => router.navigate('/profile'),
            }}
          />
          <PrivacyNote onPress={() => router.push('/privacy')}>{strings.privacy}</PrivacyNote>
        </View>
      ) : (
        /*
         * SectionList rather than a mapped ScrollView: the catalogue is 97 programs and only a
         * handful are on screen at once. Virtualizing is the difference between mounting 8 rows
         * and mounting all of them.
         */
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.programId}
          contentContainerStyle={styles.listContent}
          style={styles.list}
          stickySectionHeadersEnabled={false}
          initialNumToRender={8}
          windowSize={7}
          renderSectionHeader={({ section }) => (
            <SectionLabel
              label={section.title}
              dotColor={
                section.group === 'unscreened'
                  ? colors.disabled
                  : eligibility[section.group as EligibilityStatus].accent
              }
              style={styles.sectionHeader}
            />
          )}
          renderItem={({ item }) => {
            const program = programById(item.programId);
            if (!program) return null;
            return (
              <ProgramRow
                name={program.name}
                blurb={program.summary ?? program.plainLanguageName ?? ''}
                meta={metaFor(item, strings, Number(values.household) || 1)}
                status={item.status === 'not_screened' ? 'more' : toVisualStatus(item.status)}
                style={styles.row}
                onPress={() => router.push(`/program/${encodeURIComponent(item.programId)}`)}
              />
            );
          }}
          ListFooterComponent={
            <View style={styles.footer}>
              <Text variant="caption" color="muted" align="center">
                {fill(strings.catalogue.sourceNote, { date: catalogueFetchedAt.slice(0, 10) })}
              </Text>
              <PrivacyNote onPress={() => router.push('/privacy')}>{strings.privacy}</PrivacyNote>
            </View>
          }
        />
      )}
    </View>
  );
}

/**
 * The one-line status under a program's name.
 *
 * Every negative quotes a limit rather than asserting one, because the applicant is entitled to
 * know which number was applied to them.
 */
function metaFor(result: EligibilityResult, strings: Strings, householdSize: number) {
  if (result.status === 'not_screened') return undefined;

  const missingCategory = result.missingFields.find(isDocumentCategory);
  if (missingCategory) {
    return fill(strings.reasons.addDocument, { document: strings.categories[missingCategory] });
  }
  if (result.missingFields.includes('dob')) return strings.reasons.needDob;

  const detail = result.reasonDetails[0];
  if (!detail) return undefined;

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
      return undefined;
  }
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.offWhite,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: layout.screenPaddingX,
    paddingTop: 18,
    paddingBottom: layout.tabBarClearance,
  },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 10,
  },
  row: {
    marginBottom: 10,
  },
  emptyWrap: {
    padding: layout.screenPaddingX,
    gap: 14,
  },
  footer: {
    gap: 14,
    paddingTop: 18,
  },
});
