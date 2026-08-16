import { StyleSheet, View } from 'react-native';

import {
  Button,
  DocumentRow,
  Icon,
  IdentityCard,
  PrivacyNote,
  ScanningIndicator,
  SectionLabel,
  Sheet,
  TabScreen,
  Text,
  UploadOptionCard,
} from '@/components';
import { sampleProfile } from '@/data/sample-profile';
import { fill, useStrings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';
import { colors, documentKinds, type DocumentKind } from '@/theme';

export default function ProfileScreen() {
  const strings = useStrings();
  const store = useAppStore();
  const { language, toggleLanguage, documents } = store;

  const readCount = documentKinds.filter((k) => documents[k].status === 'read').length;
  const scanningKind = documentKinds.find((k) => documents[k].status === 'scanning');
  const hasAny = readCount > 0;

  return (
    <TabScreen title={strings.titles.profile} language={language} onToggleLanguage={toggleLanguage}>
      <IdentityCard
        name={hasAny ? sampleProfile.fullName : '—'}
        initials={hasAny ? sampleProfile.initials : '?'}
        summary={
          hasAny
            ? fill(strings.profile.countVerified, {
                done: readCount,
                total: documentKinds.length,
              })
            : strings.profile.none
        }
        action={{
          label: hasAny ? strings.profile.resetDemo : strings.profile.loadSample,
          onPress: hasAny ? store.reset : store.loadSample,
        }}
      />

      <SectionLabel label={strings.profile.yourDocuments} />

      {documentKinds.map((kind) => {
        const doc = documents[kind];
        const isRead = doc.status === 'read';
        return (
          <DocumentRow
            key={kind}
            kind={kind}
            label={strings.documents[kind]}
            detail={
              isRead
                ? fill(strings.profile.readOn, { date: doc.readOn ?? '' })
                : strings.profile.notAdded
            }
            verified={isRead}
            statusLabel={isRead ? strings.profile.verified : strings.profile.add}
            onPress={() => store.openSheet(kind)}
          />
        );
      })}

      <Button
        label={strings.profile.addADocument}
        icon={<Icon name="plus" size={18} color={colors.paper} />}
        onPress={() => store.openSheet(null)}
      />

      <PrivacyNote>{strings.privacy}</PrivacyNote>

      <UploadSheet scanningKind={scanningKind} />
    </TabScreen>
  );
}

/**
 * The upload sheet, in its two states.
 *
 * Both options land on the same scanning state because both are the same thing underneath: a
 * file goes to storage, gets read, and the derived fields come back. The original is discarded
 * once read, which is why nothing here promises to keep it.
 */
function UploadSheet({ scanningKind }: { scanningKind?: DocumentKind }) {
  const strings = useStrings();
  const store = useAppStore();
  const { sheet } = store;

  const target = scanningKind ?? sheet.target;
  const title = target
    ? fill(strings.upload.titleFor, { document: strings.documents[target] })
    : strings.upload.titleGeneric;

  // With no specific row tapped, the sheet fills the first document still missing.
  const nextMissing = documentKinds.find((k) => store.documents[k].status === 'missing');
  const kindToScan = sheet.target ?? nextMissing ?? 'id';

  return (
    <Sheet visible={sheet.open} onRequestClose={store.closeSheet} label={title}>
      {scanningKind ? (
        <ScanningIndicator
          kind={scanningKind}
          title={strings.upload.reading}
          documentLabel={strings.documents[scanningKind]}
        />
      ) : (
        <>
          <Text variant="cardTitle">{title}</Text>
          <View style={styles.options}>
            <UploadOptionCard
              icon="camera"
              iconColor={colors.navy}
              title={strings.upload.scan}
              description={strings.upload.scanBody}
              onPress={() => store.scan(kindToScan)}
            />
            <UploadOptionCard
              icon="document"
              iconColor={colors.cyan}
              title={strings.upload.choose}
              description={strings.upload.chooseBody}
              onPress={() => store.scan(kindToScan)}
            />
          </View>
          <PrivacyNote>{strings.privacy}</PrivacyNote>
          <Button label={strings.upload.cancel} variant="tertiary" onPress={store.closeSheet} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  options: {
    flexDirection: 'row',
    gap: 12,
  },
});
