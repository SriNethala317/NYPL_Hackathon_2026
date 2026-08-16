import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import type { FillResult, FormTemplate } from './types';

/**
 * Getting the completed PDF into the applicant's hands.
 *
 * There is no public API for submitting a New York City benefits application — ACCESS HRA is a
 * client-facing portal with no third-party write access. Automating a login on someone's behalf
 * would mean holding their government credentials, which is not something this app should ever
 * do.
 *
 * So the honest end of the pipeline is: produce the completed form, hand it over through the
 * system share sheet, and point at the exact submission destination. That removes the part that
 * actually stops people — filling the same twelve boxes again — without pretending to an
 * integration that does not exist.
 */

/** A filename the applicant will still recognise in their downloads a week later. */
export function fileNameFor(template: FormTemplate, fullName?: string): string {
  const who = (fullName ?? 'application').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const form = template.formName.replace(/[^A-Za-z0-9]+/g, '-');
  return `${form}-${who}.pdf`.replace(/-+/g, '-');
}

export type DeliverOutcome =
  | { ok: true; uri: string; shared: boolean }
  | { ok: false; reason: string };

/**
 * Writes the filled PDF to disk and opens the share sheet.
 *
 * Written to the cache directory rather than documents: it is a derived artefact the applicant is
 * about to send somewhere else, and leaving completed benefit forms accumulating in app storage
 * is exactly the kind of retention the rest of this app is built to avoid.
 */
export async function deliverForm(
  template: FormTemplate,
  result: FillResult,
  fullName?: string,
): Promise<DeliverOutcome> {
  try {
    const file = new File(Paths.cache, fileNameFor(template, fullName));

    // Overwrite rather than append: regenerating a form should replace the previous attempt, not
    // leave a stale copy the applicant might send by mistake.
    if (file.exists) file.delete();
    file.create();
    file.write(result.bytes);

    // Web and some simulators have no share sheet. The file still exists and the caller can offer
    // a link instead, so this is a different outcome rather than a failure.
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: true, uri: file.uri, shared: false };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/pdf',
      dialogTitle: template.formName,
      UTI: 'com.adobe.pdf',
    });

    return { ok: true, uri: file.uri, shared: true };
  } catch (error) {
    return { ok: false, reason: String(error) };
  }
}
