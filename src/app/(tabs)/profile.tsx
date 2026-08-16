import { StyleSheet, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
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
import { documentType, selectableDocumentTypes } from '@/data/document-types';
import { fieldDef } from '@/data/profile-fields';
import { fill, useStrings } from '@/i18n/use-strings';
import { useAppStore, type UploadedDocument } from '@/state/app-store';
import { colors, radius } from '@/theme';

export default function ProfileScreen() {
  const strings = useStrings();
  const store = useAppStore();
  const { language, toggleLanguage, documents, hasIdentityDocument, missingFields } = store;

  const read = documents.filter((d) => d.status === 'read');
  const needsAttention = documents.filter(
    (d) => d.status === 'needsType' || d.status === 'failed',
  );

  return (
    <TabScreen title={strings.titles.profile} language={language} onToggleLanguage={toggleLanguage}>
      <IdentityCard
        name={store.values.fullName ?? '—'}
        initials={initialsOf(store.values.fullName) ?? '?'}
        summary={
          read.length > 0
            ? fill(strings.profile.countRead, { done: read.length })
            : strings.profile.none
        }
        action={{
          label: read.length > 0 ? strings.profile.resetDemo : strings.profile.loadSample,
          onPress: read.length > 0 ? store.reset : store.loadSample,
        }}
      />

      {/*
        The identity gate. Nothing else is accepted first, because every other document's values
        need an identity to attach to — and it is the anchor reconciliation resolves against.
      */}
      {!hasIdentityDocument && documents.length === 0 ? (
        <Card style={styles.gate}>
          <View style={styles.gateIcon}>
            <Icon name="profile" size={22} color={colors.navy} />
          </View>
          <Text variant="cardTitle">{strings.gate.title}</Text>
          <Text variant="bodySm" color="muted">
            {strings.gate.body}
          </Text>
          <Button label={strings.gate.action} size="md" onPress={store.openSheet} />
        </Card>
      ) : null}

      {needsAttention.map((doc) => (
        <AttentionCard key={doc.id} document={doc} />
      ))}

      {read.length > 0 && (
        <>
          <SectionLabel label={strings.profile.yourDocuments} />
          {read.map((doc) => (
            <DocumentRow
              key={doc.id}
              category={documentType(doc.type).category}
              label={strings.documents[doc.type]}
              detail={fill(strings.profile.readOn, { date: doc.readOn ?? '' })}
              verified
              statusLabel={strings.profile.verified}
              onPress={() => store.removeDocument(doc.id)}
            />
          ))}
        </>
      )}

      {/*
        Derived from the fields we still lack, not from a fixed list of slots. The user brings
        whatever proves it.
      */}
      {missingFields.length > 0 && read.length > 0 && (
        <>
          <SectionLabel label={strings.profile.stillNeeded} dotColor={colors.amber} />
          <Card style={styles.missing}>
            {missingFields.map((key) => (
              <Text key={key} variant="bodySm" color="muted">
                · {fill(strings.profile.missingField, { field: strings.form.fields[key] })}
                {fieldDef(key).source ? ` — ${strings.categories[fieldDef(key).source!]}` : ''}
              </Text>
            ))}
          </Card>
        </>
      )}

      {(hasIdentityDocument || documents.length > 0) && (
        <Button
          label={strings.profile.addADocument}
          icon={<Icon name="plus" size={18} color={colors.paper} />}
          onPress={store.openSheet}
        />
      )}

      <PrivacyNote>{strings.privacy}</PrivacyNote>

      <UploadSheet />
    </TabScreen>
  );
}

/** A document that could not be classified, or could not be read at all. */
function AttentionCard({ document }: { document: UploadedDocument }) {
  const strings = useStrings();
  const store = useAppStore();

  if (document.status === 'failed') {
    return (
      <Card style={styles.attention} accent={colors.error}>
        <Text variant="cardTitle">{strings.upload.failedTitle}</Text>
        <Text variant="bodySm" color="muted">
          {strings.upload.failedBody}
        </Text>
        <View style={styles.attentionActions}>
          <Button
            label={strings.upload.tryAgain}
            size="md"
            fullWidth={false}
            onPress={() => {
              store.removeDocument(document.id);
              store.openSheet();
            }}
          />
          <Button
            label={strings.profile.remove}
            variant="tertiary"
            size="md"
            fullWidth={false}
            onPress={() => store.removeDocument(document.id)}
          />
        </View>
      </Card>
    );
  }

  // needsType — the classifier declined to guess, so the user picks.
  return (
    <Card style={styles.attention} accent={colors.amber}>
      <Text variant="cardTitle">{strings.upload.whatIsThis}</Text>
      <Text variant="bodySm" color="muted">
        {strings.upload.whatIsThisBody}
      </Text>
      <View style={styles.typeGrid}>
        {selectableDocumentTypes.map((def) => (
          <Badge
            key={def.id}
            label={strings.documents[def.id]}
            shape="pill"
            surface={colors.offWhite}
            color={colors.navy}
            onTouchEnd={() => store.setDocumentType(document.id, def.id)}
            accessibilityRole="button"
            accessibilityLabel={strings.documents[def.id]}
          />
        ))}
      </View>
    </Card>
  );
}

/**
 * The upload sheet.
 *
 * Both options land on the same pipeline because both are the same thing underneath: a file goes
 * to storage, gets classified, gets read, and the original is discarded.
 */
function UploadSheet() {
  const strings = useStrings();
  const store = useAppStore();

  const inFlight = store.documents.find(
    (d) => d.status === 'uploading' || d.status === 'reading',
  );

  return (
    <Sheet
      visible={store.sheet.open}
      onRequestClose={store.closeSheet}
      label={strings.upload.titleGeneric}>
      {inFlight ? (
        <ScanningIndicator
          category={inFlight.type === 'unknown' ? 'other' : documentType(inFlight.type).category}
          title={inFlight.status === 'uploading' ? strings.upload.uploading : strings.upload.reading}
          documentLabel={
            inFlight.type === 'unknown' ? '' : strings.documents[inFlight.type]
          }
        />
      ) : (
        <>
          <Text variant="cardTitle">{strings.upload.titleGeneric}</Text>
          <View style={styles.options}>
            <UploadOptionCard
              icon="camera"
              iconColor={colors.navy}
              title={strings.upload.scan}
              description={strings.upload.scanBody}
              onPress={() => store.upload()}
            />
            <UploadOptionCard
              icon="document"
              iconColor={colors.cyan}
              title={strings.upload.choose}
              description={strings.upload.chooseBody}
              onPress={() => store.upload({ as: 'w2' })}
            />
          </View>

          {/*
            Demo affordances for the two failure paths the design never drew. Real uploads reach
            these on their own; these buttons just make them reachable in a demo.
          */}
          <View style={styles.options}>
            <Button
              label={strings.upload.demoUnknown}
              variant="tertiary"
              size="md"
              onPress={() => store.upload({ simulate: 'unknown' })}
            />
            <Button
              label={strings.upload.demoFailure}
              variant="tertiary"
              size="md"
              onPress={() => store.upload({ simulate: 'failure' })}
            />
          </View>

          <PrivacyNote>{strings.privacy}</PrivacyNote>
          <Button label={strings.upload.cancel} variant="tertiary" onPress={store.closeSheet} />
        </>
      )}
    </Sheet>
  );
}

function initialsOf(name?: string): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return (parts[0][0] + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

const styles = StyleSheet.create({
  options: {
    flexDirection: 'row',
    gap: 12,
  },
  gate: {
    padding: 22,
    gap: 10,
  },
  gateIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.tile,
    backgroundColor: colors.offWhite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attention: {
    padding: 16,
    gap: 10,
  },
  attentionActions: {
    flexDirection: 'row',
    gap: 10,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  missing: {
    padding: 16,
    gap: 6,
  },
});
