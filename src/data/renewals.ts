import { criteriaFor } from './catalogue';

/**
 * When an enrolled programme has to be renewed, and how urgent that is.
 *
 * This is the half of the problem the design never addressed. Reporting on New York benefits
 * finds that two of the commonest reasons people lose food and health coverage have nothing to do
 * with eligibility — a recertification notice buried in the mail, or a portal that fails partway
 * through an upload. Miss the window and benefits stop; fall far enough behind and you reapply
 * from scratch.
 *
 * The app is already holding the documents and already knows which programmes someone is on.
 * Enrolling a person and then letting them quietly fall off solves half of what they came for.
 *
 * Cadences come from the City's own wording via `scripts/derive-criteria.mjs`. A programme with
 * no stated cadence returns `null` — an invented deadline is worse than no deadline, because
 * people act on it.
 */

export type RenewalUrgency = 'overdue' | 'urgent' | 'soon' | 'later';

export type RenewalWindow = {
  dueOn: Date;
  /** Negative once the deadline has passed. */
  daysUntil: number;
  urgency: RenewalUrgency;
  /** The City's sentence stating the renewal requirement, quotable in the UI. */
  sourceText?: string;
  /** True when the programme renews on a fixed calendar date rather than an anniversary. */
  fixedDate: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Agencies post the recertification packet roughly two months out, so "urgent" begins where a
 * person can still act on paperwork that has plausibly already arrived.
 */
const URGENT_DAYS = 30;
const SOON_DAYS = 60;

function urgencyFor(daysUntil: number): RenewalUrgency {
  if (daysUntil < 0) return 'overdue';
  if (daysUntil <= URGENT_DAYS) return 'urgent';
  if (daysUntil <= SOON_DAYS) return 'soon';
  return 'later';
}

/** Whole days between two dates, ignoring clock time so "today" is always 0. */
function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

/**
 * The next renewal date for a programme, given when the application was submitted.
 *
 * Fixed-deadline programmes ("renew every year by March 15") roll forward to the next occurrence
 * of that date, which is not the same as an anniversary of the application and would otherwise be
 * off by up to a year.
 */
export function renewalFor(
  programId: string,
  submittedOn: Date,
  now: Date = new Date(),
): RenewalWindow | null {
  const renewal = criteriaFor(programId)?.renewal;
  if (!renewal) return null;

  let dueOn: Date;

  if (renewal.deadlineMonth !== undefined && renewal.deadlineDay !== undefined) {
    dueOn = new Date(now.getFullYear(), renewal.deadlineMonth - 1, renewal.deadlineDay);
    // Already past this year's date, so the one that matters is next year's.
    if (daysBetween(now, dueOn) < 0) {
      dueOn = new Date(now.getFullYear() + 1, renewal.deadlineMonth - 1, renewal.deadlineDay);
    }
  } else {
    dueOn = new Date(submittedOn);
    dueOn.setMonth(dueOn.getMonth() + renewal.cadenceMonths);
  }

  const daysUntil = daysBetween(now, dueOn);

  return {
    dueOn,
    daysUntil,
    urgency: urgencyFor(daysUntil),
    sourceText: renewal.sourceText,
    fixedDate: renewal.deadlineMonth !== undefined,
  };
}

/**
 * Whether a renewal is close enough to be worth interrupting someone about.
 *
 * Reserved for the loud treatment — a push notification, say. Surfacing on screen uses
 * `isUpcoming`, which starts earlier.
 */
export function needsAttention(window: RenewalWindow | null): boolean {
  return window !== null && (window.urgency === 'urgent' || window.urgency === 'overdue');
}

/**
 * Whether a renewal belongs on screen yet.
 *
 * Deliberately wider than `needsAttention`. Agencies post the recertification packet around two
 * months out, and the whole failure mode this feature exists to prevent is that packet going
 * unnoticed. Waiting until the final month to mention it would reproduce the problem rather than
 * solve it.
 */
export function isUpcoming(window: RenewalWindow | null): boolean {
  return window !== null && window.urgency !== 'later';
}

/** Soonest first, so the most pressing renewal leads the list. */
export function bySoonest(a: RenewalWindow, b: RenewalWindow): number {
  return a.daysUntil - b.daysUntil;
}
