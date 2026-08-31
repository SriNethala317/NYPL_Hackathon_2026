import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, View } from 'react-native';

import { Button, Card, DetailScreen, Icon, InfoBanner, SectionLabel, Text } from '@/components';
import { programById } from '@/data/catalogue';
import {
  deliverForm,
  fetchTemplate,
  fillForm,
  templateFor,
  type FillResult,
  type SubmissionChannel,
} from '@/features/forms';
import { fill, useStrings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';
import { colors } from '@/theme';

type Stage =
  | { step: 'fetching' }
  | { step: 'filling' }
  | { step: 'ready'; result: FillResult }
  | { step: 'unavailable'; reason: string };

/**
 * The address, fax number or link a channel needs, if it carries one.
 *
 * Rendered `selectable` by the caller so somebody can copy a PO box straight onto an envelope —
 * a small thing that decides whether the paper route is actually usable on a phone.
 */
function channelDetail(channel: SubmissionChannel): string | undefined {
  switch (channel.kind) {
    case 'mail':
      return channel.address;
    case 'fax':
      return channel.fax;
    case 'email':
      return channel.email;
    case 'online-portal':
    case 'cbo':
      return channel.url;
    case 'in-person':
      return channel.findUrl;
  }
}

/**
 * Turning the applicant's profile into the actual government PDF.
 *
 * This is what the whole document pipeline is for. Everything upstream — reading an ID, merging
 * fields across documents, screening against real criteria — exists so this screen can hand
 * somebody the agency's own form with their details already in it.
 *
 * What it deliberately does not do is submit. There is no public API for filing a NYC benefits
 * application, and the only way to automate it would be to hold the applicant's portal password.
 * The screen says so rather than quietly leaving them to wonder.
 */
export default function FormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const strings = useStrings();
  const { values } = useAppStore();

  const program = programById(id);
  const template = templateFor(id);
  const [stage, setStage] = useState<Stage>({ step: 'fetching' });

  // The first channel that is actually openable, so the button never appears for a form whose
  // only routes are a PO box and a fax machine.
  const portalUrl = template?.channels.find(
    (channel) => channel.kind === 'online-portal' || channel.kind === 'cbo',
  )?.url;

  useEffect(() => {
    if (!template) return;
    let cancelled = false;

    (async () => {
      const fetched = await fetchTemplate(template.url);
      if (cancelled) return;

      if (!fetched.ok) {
        // Link rot is routine here: several PDF URLs in the City's own dataset are already dead.
        setStage({ step: 'unavailable', reason: fetched.reason });
        return;
      }

      setStage({ step: 'filling' });
      try {
        const result = await fillForm(template, fetched.bytes, values);
        if (!cancelled) setStage({ step: 'ready', result });
      } catch (error) {
        if (!cancelled) setStage({ step: 'unavailable', reason: String(error) });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [template, values]);

  const back = () => router.back();

  if (!template || !program) {
    return (
      <DetailScreen backLabel={strings.detail.back} title={strings.form2.title} onBack={back}>
        <Card style={styles.card}>
          <Text variant="cardTitle">{strings.form2.noFormTitle}</Text>
          <Text variant="bodySm" color="muted">
            {strings.form2.noFormBody}
          </Text>
          {program?.applyUrl ? (
            <Button
              label={strings.catalogue.applyOnOfficialSite}
              variant="secondary"
              size="md"
              onPress={() => Linking.openURL(program.applyUrl as string)}
            />
          ) : null}
        </Card>
      </DetailScreen>
    );
  }

  const manual = stage.step === 'ready' ? stage.result.fields.filter((f) => f.status === 'manual') : [];
  const missing =
    stage.step === 'ready'
      ? stage.result.fields.filter((f) => f.status === 'missing' || f.status === 'unknown-field')
      : [];

  return (
    <DetailScreen
      backLabel={strings.detail.back}
      title={program.name}
      onBack={back}
      footer={
        stage.step === 'ready' ? (
          <>
            <Button
              label={strings.form2.download}
              onPress={() => deliverForm(template, stage.result, values.fullName)}
            />
            {portalUrl ? (
              <Button
                label={strings.form2.openPortal}
                variant="secondary"
                onPress={() => Linking.openURL(portalUrl)}
              />
            ) : null}
          </>
        ) : undefined
      }>
      {(stage.step === 'fetching' || stage.step === 'filling') && (
        <Card style={styles.busy}>
          <ActivityIndicator color={colors.navy} />
          <Text variant="bodySm" color="muted">
            {stage.step === 'fetching' ? strings.form2.preparing : strings.form2.filling}
          </Text>
        </Card>
      )}

      {stage.step === 'unavailable' && (
        <Card style={styles.card} accent={colors.amber}>
          <Text variant="cardTitle">{strings.form2.unavailableTitle}</Text>
          <Text variant="bodySm" color="muted">
            {strings.form2.unavailableBody}
          </Text>
          {program.applyUrl ? (
            <Button
              label={strings.catalogue.applyOnOfficialSite}
              variant="secondary"
              size="md"
              onPress={() => Linking.openURL(program.applyUrl as string)}
            />
          ) : null}
        </Card>
      )}

      {stage.step === 'ready' && (
        <>
          <Card style={styles.card} accent={colors.green}>
            <Text variant="cardTitle">
              {fill(strings.form2.readyTitle, { filled: stage.result.filledCount })}
            </Text>
            <Text variant="bodySm" color="muted">
              {fill(strings.form2.readyBody, { formName: template.formName })}
            </Text>
          </Card>

          {/*
            Everything below is the honest accounting. A form that looks finished but is missing a
            signature line or an SSN gets rejected, and the applicant finds out weeks later.
          */}
          <InfoBanner>{strings.form2.signWarning}</InfoBanner>

          {manual.length > 0 && (
            <>
              <SectionLabel label={strings.form2.youMustAdd} dotColor={colors.amber} />
              <Card style={styles.card}>
                {manual.map((field) => (
                  <View key={field.pdfField} style={styles.row}>
                    <Icon name="document" size={14} color={colors.amberText} />
                    <Text variant="bodySm" color="muted" style={styles.rowCopy}>
                      {field.note}
                    </Text>
                  </View>
                ))}
              </Card>
            </>
          )}

          {missing.length > 0 && (
            <>
              <SectionLabel label={strings.form2.weCouldNotFill} dotColor={colors.disabled} />
              <Card style={styles.card}>
                {missing.map((field) => (
                  <Text key={field.pdfField} variant="bodySm" color="muted">
                    · {field.note}
                  </Text>
                ))}
              </Card>
            </>
          )}

          <SectionLabel label={strings.form2.whereToSend} />
          {/*
            Every accepted route, not just the portal. Several NYC programmes take a printed form
            by post or fax with no online account at all — for someone who has never had an email
            address, or who cannot get back into one they made years ago, that is the difference
            between applying and not.
          */}
          {template.channels.map((channel, index) => (
            <Card key={`${channel.kind}-${index}`} style={styles.card}>
              <Text variant="bodySm">{strings.form2.channelNames[channel.kind]}</Text>
              <Text variant="bodySm" color="muted">
                {channel.instructions}
              </Text>
              {channelDetail(channel) ? (
                <Text variant="bodySm" color="muted" selectable>
                  {channelDetail(channel)}
                </Text>
              ) : null}
            </Card>
          ))}
          <Card style={styles.card}>
            <Text variant="caption" color="disabled">
              {strings.form2.noSubmitApi}
            </Text>
          </Card>
        </>
      )}
    </DetailScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 10,
  },
  busy: {
    padding: 24,
    gap: 12,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  rowCopy: {
    flex: 1,
  },
});
