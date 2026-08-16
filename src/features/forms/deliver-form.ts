import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { FillResult, FormTemplate } from './types';

/**
 * Getting the completed PDF into the applicant's hands, and not leaving it lying around.
 *
 * There is no public API for submitting a New York City benefits application — ACCESS HRA is a
 * client-facing portal with no third-party write access. Automating a login on someone's behalf
 * would mean holding their government credentials, which is not something this app should ever
 * do. So the honest end of the pipeline is: produce the completed form, hand it over through the
 * system share sheet, and point at the exact submission destination.
 *
 * A filled application is the single most sensitive artefact this app produces — name, date of
 * birth, address and income on one page. It exists on disk only for as long as the share sheet
 * needs it, and is deleted the moment that returns.
 */

/** Marks the files this module creates, so they can be found and purged later. */
const GENERATED_PREFIX = 'enroll-nyc-form-';

/** A filename the applicant will still recognise in their downloads a week later. */
export function fileNameFor(template: FormTemplate, fullName?: string): string {
  const who = (fullName ?? 'application').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const form = template.formName.replace(/[^A-Za-z0-9]+/g, '-');
  return `${GENERATED_PREFIX}${form}-${who}.pdf`.replace(/-+/g, '-');
}

export type DeliverOutcome =
  | { ok: true; uri: string; shared: boolean; retained: boolean }
  | { ok: false; reason: string };

/**
 * Writes the filled PDF, opens the share sheet, then deletes it.
 *
 * `shareAsync` resolves once the sheet closes — by then the system has taken its own copy of
 * anything the user chose to send — so deleting immediately after is safe and keeps a completed
 * benefits form from sitting in cache indefinitely.
 *
 * Where no share sheet exists (web, some simulators) the file has to survive for the caller to
 * link to it. `retained` says which happened, so the UI never claims a cleanup that did not run.
 */
export async function deliverForm(
  template: FormTemplate,
  result: FillResult,
  fullName?: string,
): Promise<DeliverOutcome> {
  let file: File | undefined;

  try {
    file = new File(Paths.cache, fileNameFor(template, fullName));

    if (file.exists) file.delete();
    file.create();
    file.write(result.bytes);

    if (!(await Sharing.isAvailableAsync())) {
      return { ok: true, uri: file.uri, shared: false, retained: true };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: template.formName,
      UTI: 'com.adobe.pdf',
    });

    const uri = file.uri;
    if (file.exists) file.delete();
    return { ok: true, uri, shared: true, retained: false };
  } catch (error) {
    // Never leave a half-written application behind because something failed partway.
    try {
      if (file?.exists) file.delete();
    } catch {
      /* best effort; the purge below is the backstop */
    }
    return { ok: false, reason: String(error) };
  }
}

/**
 * Deletes every form this app has generated.
 *
 * Backs "delete everything" on the privacy screen. Without it that button clears only in-memory
 * state while a completed application — the most sensitive thing here — stays on disk, which
 * would make the promise on that screen false.
 *
 * Returns how many files were removed so the UI can report something it actually did.
 */
export function purgeGeneratedForms(): number {
  try {
    const cache = new Directory(Paths.cache);
    if (!cache.exists) return 0;

    let removed = 0;
    for (const entry of cache.list()) {
      if (entry instanceof File && entry.name.startsWith(GENERATED_PREFIX)) {
        entry.delete();
        removed += 1;
      }
    }
    return removed;
  } catch {
    // A cache we cannot enumerate is not a reason to crash the privacy screen.
    return 0;
  }
}
