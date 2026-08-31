import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TabScreen } from '@/components/enroll';
import { Badge, Button, Card, Icon, Text } from '@/components/ui';
import {
  annualIncome,
  captureDocument,
  chooseDocument,
  extractW2,
  type W2Extraction,
} from '@/features/extraction';
import { useLanguageSwitchLabel, useStrings } from '@/i18n/use-strings';
import { useAppStore } from '@/state/app-store';
import { colors } from '@/theme';

/**
 * A development surface for trying the extraction pipeline on real documents.
 *
 * Not part of the design and not part of the product — `docs/design/README.md` fixes three tabs,
 * and this one is hidden outside development builds. It exists because every accuracy number this
 * project has was measured against *rendered* fixtures that were never printed, which makes them an
 * upper bound. The only way to find out what a photograph of a real W-2 does is to photograph one.
 *
 * Deliberately holds no shared state of its own. Every extraction result is `useState` in this
 * file and nothing is persisted, so deleting this screen changes nothing else. The only thing it
 * takes from the store is the language, and the only thing it dispatches is the toggle that the
 * shared header already owns.
 *
 * It renders inside `TabScreen` rather than its own `ScrollView` for a reason worth stating: the
 * status bar is not padding you can guess. `AppHeader` derives its top inset from the real safe
 * area, so a screen that frames itself sits under the clock and the carrier text on a notched
 * phone while looking correct in a simulator. The same frame is also what keeps the last card
 * clear of the floating tab bar and caps the content width on web and tablets.
 *
 * ## Why the arithmetic is the headline
 *
 * The obvious thing to show is the model's confidence. It is worthless: measured across 17 test
 * documents, Gemini reported the same 0.85 for every field it read correctly and every field it got
 * wrong. A W-2 carries a better signal in its own figures — Box 4 is 6.2% of Box 3 and Box 6 is
 * 1.45% of Box 5, so a misread digit breaks the relationship by orders of magnitude. Over the cached
 * evaluation runs, 27 of 27 documents whose arithmetic held had the correct income.
 *
 * So this screen leads with whether the form agreed with itself, and the income figure second.
 */

type State =
  | { phase: 'idle' }
  | { phase: 'reading' }
  | { phase: 'done'; result: W2Extraction; bytes: number; totalMs: number }
  | { phase: 'failed'; detail: string };

export default function ScanScreen() {
  const strings = useStrings();
  const switchLabel = useLanguageSwitchLabel();
  const { language, toggleLanguage } = useAppStore();
  const [state, setState] = useState<State>({ phase: 'idle' });

  const run = async (pick: typeof captureDocument) => {
    setState({ phase: 'reading' });

    const picked = await pick();
    if (!picked.ok) {
      // Backing out of the camera is not a failure and must not look like one.
      setState(picked.reason === 'cancelled' ? { phase: 'idle' } : { phase: 'failed', detail: picked.reason });
      return;
    }

    const outcome = await extractW2(picked.document.uri);
    setState(
      outcome.ok
        ? { phase: 'done', result: outcome.result, bytes: outcome.uploadedBytes, totalMs: outcome.totalMs }
        : { phase: 'failed', detail: outcome.detail },
    );
  };

  return (
    <TabScreen
      title={strings.tabs.scan}
      language={language}
      switchLabel={switchLabel}
      onToggleLanguage={toggleLanguage}>
      <Text variant="bodySm" color="muted">
        Development only. Reads the document through the Edge Function and shows exactly what came
        back — nothing is saved to your profile.
      </Text>

      <View style={styles.actions}>
        <Button
          label="Photograph"
          onPress={() => void run(captureDocument)}
          disabled={state.phase === 'reading'}
        />
        <Button
          label="Choose a file"
          variant="secondary"
          onPress={() => void run(chooseDocument)}
          disabled={state.phase === 'reading'}
        />
      </View>

      {state.phase === 'reading' && (
        <Card style={styles.card}>
          <Text variant="bodySm" color="muted">
            Reading…
          </Text>
        </Card>
      )}

      {state.phase === 'failed' && (
        <Card style={styles.card} accent={colors.error}>
          <Text variant="sectionLabel" style={styles.failedTitle}>
            Could not read it
          </Text>
          <Text variant="bodySm">{state.detail}</Text>
        </Card>
      )}

      {state.phase === 'done' && <Result state={state} />}
    </TabScreen>
  );
}

function Result({ state }: { state: Extract<State, { phase: 'done' }> }) {
  const { result, bytes, totalMs } = state;
  const income = annualIncome(result);
  const { arithmetic: checks } = result;

  return (
    <>
      <Card
        style={styles.card}
        accent={checks.broken ? colors.error : checks.corroborated ? colors.green : colors.amber}
      >
        <View style={styles.row}>
          <Icon name={checks.corroborated ? 'check' : 'document'} size={18} color={colors.ink} />
          <Text variant="sectionLabel" style={styles.checkTitle}>
            {checks.corroborated
              ? 'The form’s own arithmetic agrees'
              : checks.broken
                ? 'The form’s arithmetic does not add up'
                : 'Not enough boxes read to check'}
          </Text>
        </View>
        <Text variant="bodySm" color="muted" style={styles.checkLine}>
          {checks.ss.detail}
        </Text>
        <Text variant="bodySm" color="muted">
          {checks.medicare.detail}
        </Text>
        {checks.broken && (
          <Text variant="bodySm" style={styles.suspectNote}>
            A box was probably misread. Treat the income figure as unconfirmed.
          </Text>
        )}
      </Card>

      <Card style={styles.card}>
        <View style={styles.row}>
          <Text variant="sectionLabel">Income the screener would use</Text>
          {income && (
            <Badge
              label={income.from === 'box5' ? 'Box 5' : 'Box 1 (fallback)'}
              surface={colors.offWhite}
              color={colors.navy}
            />
          )}
        </View>
        <Text variant="screenTitle" style={styles.income}>
          {income ? income.value : '—'}
        </Text>
        <Text variant="bodySm" color="muted">
          Annual. The profile stores gross monthly, so this divides by 12 before it is used.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Field label="Name" value={result.fields.employee_name} />
        <Field label="Address" value={result.fields.employee_address} />
        <Field label="Tax year" value={result.fields.tax_year} />
        <Field label="Box 1 — wages" value={result.fields.box1_wages} />
      </Card>

      <Card style={styles.card}>
        <Text variant="sectionLabel" style={styles.sectionTitle}>
          Checksum boxes
        </Text>
        <Text variant="bodySm" color="muted" style={styles.checkLine}>
          Read only so the arithmetic can be verified. Never stored.
        </Text>
        <Field label="Box 3 — SS wages" value={result.fields.box3_ss_wages} />
        <Field label="Box 4 — SS tax" value={result.fields.box4_ss_tax} />
        <Field label="Box 5 — Medicare wages" value={result.fields.box5_medicare_wages} />
        <Field label="Box 6 — Medicare tax" value={result.fields.box6_medicare_tax} />
      </Card>

      {result.warnings.length > 0 && (
        <Card style={styles.card}>
          <Text variant="sectionLabel" style={styles.sectionTitle}>
            Warnings
          </Text>
          {result.warnings.map((warning) => (
            <Text key={warning} variant="bodySm" color="muted" style={styles.checkLine}>
              {warning}
            </Text>
          ))}
        </Card>
      )}

      <Card style={styles.card}>
        <Text variant="bodySm" color="muted">
          {result.model ?? 'unknown model'} · {(totalMs / 1000).toFixed(1)}s end to end ·{' '}
          {(result.latencyMs / 1000).toFixed(1)}s in the model · {Math.round(bytes / 1024)} KB sent ·{' '}
          {result.tokens.in ?? '?'} in / {result.tokens.out ?? '?'} out
        </Text>
        {result.attempts.length > 0 && (
          <Text variant="bodySm" color="muted" style={styles.checkLine}>
            Models tried and failed first: {result.attempts.join(' | ')}
          </Text>
        )}
      </Card>
    </>
  );
}

/** One extracted value. A missing one shows an em dash rather than nothing, so it reads as absent. */
function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={styles.field}>
      <Text variant="bodySm" color="muted">
        {label}
      </Text>
      <Text variant="bodySm" style={styles.fieldValue}>
        {value ?? '—'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  card: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  checkTitle: { flexShrink: 1 },
  checkLine: { marginBottom: 4 },
  sectionTitle: { marginBottom: 4 },
  income: { marginVertical: 4 },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    paddingVertical: 4,
  },
  fieldValue: { flexShrink: 1, textAlign: 'right' },
  suspectNote: { marginTop: 4, color: colors.error },
  failedTitle: { marginBottom: 4 },
});
