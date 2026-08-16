import { router } from 'expo-router';

import { ApplicationCard, Button, EmptyStateCard, PrivacyNote, TabScreen } from '@/components';
import { programById } from '@/data/catalogue';
import { useLanguageSwitchLabel, useStrings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';

/** Home — the status of everything already submitted. */
export default function HomeScreen() {
  const strings = useStrings();
  const switchLabel = useLanguageSwitchLabel();
  const { language, toggleLanguage, applications } = useAppStore();

  return (
    <TabScreen title={strings.titles.home} language={language} switchLabel={switchLabel} onToggleLanguage={toggleLanguage}>
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
              note={noteFor(application.stage, strings.stages)}
            />
          ))}
          <Button
            label={strings.home.seeOtherPrograms}
            variant="secondary"
            onPress={() => router.navigate('/enrollment')}
          />
        </>
      )}

      <PrivacyNote>{strings.privacy}</PrivacyNote>
    </TabScreen>
  );
}

/** The footer line under the stage rail. Kept out of the card so the copy stays localizable. */
function noteFor(stage: number, stages: readonly string[]): string {
  return `${stages[stage]}.`;
}
