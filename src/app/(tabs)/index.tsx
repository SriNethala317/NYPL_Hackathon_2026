import { router } from 'expo-router';

import {
  ApplicationCard,
  Button,
  EmptyStateCard,
  PrivacyNote,
  RenewalCard,
  SectionLabel,
  TabScreen,
  Text,
} from '@/components';
import { programById } from '@/data/catalogue';
import { bySoonest, isUpcoming, renewalFor, type RenewalWindow } from '@/data/renewals';
import { fill, useLanguageSwitchLabel, useStrings, type Strings } from '@/i18n/use-strings';
import { useAppStore, type Application } from '@/state/app-store';
import { colors } from '@/theme';

/** Home — the status of everything submitted, and anything about to lapse. */
export default function HomeScreen() {
  const strings = useStrings();
  const switchLabel = useLanguageSwitchLabel();
  const { language, toggleLanguage, applications, categoriesOnFile } = useAppStore();

  /*
   * Renewals lead the screen when they are pressing.
   *
   * Getting somebody enrolled and then letting them fall off at recertification solves half of
   * what they came for — and recertification, not eligibility, is how most people actually lose
   * food and health benefits.
   */
  const renewals = applications
    .map((application) => ({
      application,
      window: renewalFor(application.programId, parseSubmitted(application)),
    }))
    .filter((entry): entry is { application: Application; window: RenewalWindow } =>
      isUpcoming(entry.window),
    )
    .sort((a, b) => bySoonest(a.window, b.window));

  return (
    <TabScreen
      title={strings.titles.home}
      language={language}
      switchLabel={switchLabel}
      onToggleLanguage={toggleLanguage}>
      {renewals.length > 0 && (
        <>
          <SectionLabel label={strings.renewal.heading} dotColor={colors.amber} />
          {renewals.map(({ application, window }) => (
            <RenewalCard
              key={`renewal-${application.reference}`}
              programName={programById(application.programId)?.name ?? application.programId}
              status={renewalStatus(window, strings)}
              urgency={window.urgency}
              sourceText={window.sourceText}
              documentsReady={categoriesOnFile.length > 0}
              documentsNote={
                categoriesOnFile.length > 0
                  ? strings.renewal.documentsReady
                  : strings.renewal.documentsMissing
              }
              actionLabel={strings.renewal.renewNow}
              onRenew={() => router.push(`/apply/${encodeURIComponent(application.programId)}`)}
            />
          ))}
          <Text variant="caption" color="muted">
            {strings.renewal.whyItMatters}
          </Text>
        </>
      )}

      {applications.length === 0 ? (
        <EmptyStateCard
          title={strings.home.emptyTitle}
          body={strings.home.emptyBody}
          action={{
            label: strings.home.addDocuments,
            onPress: () => router.navigate('/profile'),
          }}
        />
      ) : (
        <>
          {applications.map((application) => (
            <ApplicationCard
              key={application.reference}
              name={programById(application.programId)?.name ?? application.programId}
              reference={application.reference}
              date={application.date}
              stageLabel={strings.stages[application.stage]}
              stageLabels={[...strings.stages]}
              stage={application.stage}
              announcement={fill(strings.a11y.stageOf, {
                n: application.stage + 1,
                total: strings.stages.length,
                label: strings.stages[application.stage],
              })}
              note={`${strings.stages[application.stage]}.`}
            />
          ))}
          <Button
            label={strings.home.seeOtherPrograms}
            variant="secondary"
            onPress={() => router.navigate('/enrollment')}
          />
        </>
      )}

      <PrivacyNote onPress={() => router.push('/privacy')}>{strings.privacy}</PrivacyNote>
    </TabScreen>
  );
}

/**
 * The submission date, back from its display form.
 *
 * Applications store a formatted date because that is what the card shows. Falling back to today
 * keeps an unparseable value from throwing on the home screen — the worst case is a renewal
 * reminder that is early, never a crash.
 */
function parseSubmitted(application: Application): Date {
  const parsed = new Date(application.date);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** The deadline, phrased for how close it is. */
function renewalStatus(window: RenewalWindow, strings: Strings): string {
  const date = window.dueOn.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  if (window.urgency === 'overdue') return fill(strings.renewal.overdue, { date });
  if (window.urgency === 'urgent') return fill(strings.renewal.urgent, { days: window.daysUntil });
  if (window.urgency === 'soon') return fill(strings.renewal.soon, { date });
  return fill(strings.renewal.later, { date });
}
