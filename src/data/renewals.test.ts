import { criteriaFor, programs } from './catalogue';
import { bySoonest, isUpcoming, needsAttention, renewalFor } from './renewals';

/** Programmes whose renewal cadence the City actually states. */
const withRenewal = programs.filter((p) => criteriaFor(p.id)?.renewal);
const rolling = withRenewal.find((p) => !criteriaFor(p.id)!.renewal!.deadlineMonth)!;
const fixed = withRenewal.find((p) => criteriaFor(p.id)!.renewal!.deadlineMonth)!;

describe('what the catalogue states about renewal', () => {
  it('finds renewal requirements in the official text', () => {
    expect(withRenewal.length).toBeGreaterThan(0);
  });

  it('includes SNAP, where recertification is the usual way people lose benefits', () => {
    // Anchored, because "Special Supplemental Nutrition Program for Women, Infants and Children"
    // is a different programme and sorts ahead of this one.
    const snap = programs.find((p) => /^supplemental nutrition assistance/i.test(p.name));
    expect(snap).toBeDefined();
    expect(criteriaFor(snap!.id)?.renewal?.cadenceMonths).toBe(12);
  });

  it('quotes the City for every renewal it asserts', () => {
    for (const program of withRenewal) {
      expect(criteriaFor(program.id)!.renewal!.sourceText).toBeTruthy();
    }
  });
});

describe('renewalFor', () => {
  it('returns nothing for a programme with no stated cadence', () => {
    const silent = programs.find((p) => !criteriaFor(p.id)?.renewal)!;
    // An invented deadline is worse than none, because people act on it.
    expect(renewalFor(silent.id, new Date('2026-01-01'))).toBeNull();
  });

  it('counts an anniversary forward from the submission date', () => {
    const submitted = new Date(2026, 0, 15);
    const window = renewalFor(rolling.id, submitted, new Date(2026, 0, 20));

    expect(window).not.toBeNull();
    expect(window!.dueOn.getFullYear()).toBe(2027);
    expect(window!.dueOn.getMonth()).toBe(0);
    expect(window!.fixedDate).toBe(false);
  });

  it('rolls a fixed calendar deadline to its next occurrence', () => {
    // "Renew every year by March 15" is not an anniversary of applying. Treating it as one
    // would put the reminder up to a year off.
    const submitted = new Date(2026, 0, 1);
    const window = renewalFor(fixed.id, submitted, new Date(2026, 5, 1));

    expect(window!.fixedDate).toBe(true);
    expect(window!.dueOn.getMonth()).toBe(criteriaFor(fixed.id)!.renewal!.deadlineMonth! - 1);
    // June is past March, so the deadline that matters is next year's.
    expect(window!.dueOn.getFullYear()).toBe(2027);
  });

  it('keeps this year’s fixed deadline while it is still ahead', () => {
    const window = renewalFor(fixed.id, new Date(2026, 0, 1), new Date(2026, 0, 10));
    expect(window!.dueOn.getFullYear()).toBe(2026);
  });
});

describe('urgency', () => {
  const submitted = new Date(2026, 0, 1);

  it('is "later" when the deadline is far off', () => {
    const window = renewalFor(rolling.id, submitted, new Date(2026, 0, 2));
    expect(window!.urgency).toBe('later');
  });

  it('is "soon" about two months out, when the packet is posted', () => {
    const window = renewalFor(rolling.id, submitted, new Date(2026, 10, 15));
    expect(window!.urgency).toBe('soon');
  });

  it('is "urgent" inside the last month', () => {
    const window = renewalFor(rolling.id, submitted, new Date(2026, 11, 15));
    expect(window!.urgency).toBe('urgent');
  });

  it('is "overdue" once the date has passed', () => {
    const window = renewalFor(rolling.id, submitted, new Date(2027, 1, 1));
    expect(window!.urgency).toBe('overdue');
    expect(window!.daysUntil).toBeLessThan(0);
  });

  it('counts today as zero days rather than a fraction', () => {
    const dueToday = new Date(2027, 0, 1);
    const window = renewalFor(rolling.id, submitted, dueToday);
    // Clock time must not make a same-day deadline read as already missed.
    expect(window!.daysUntil).toBe(0);
    expect(window!.urgency).toBe('urgent');
  });
});

describe('needsAttention', () => {
  const submitted = new Date(2026, 0, 1);

  it('interrupts only for urgent and overdue', () => {
    expect(needsAttention(renewalFor(rolling.id, submitted, new Date(2026, 0, 2)))).toBe(false);
    expect(needsAttention(renewalFor(rolling.id, submitted, new Date(2026, 11, 15)))).toBe(true);
    expect(needsAttention(renewalFor(rolling.id, submitted, new Date(2027, 1, 1)))).toBe(true);
  });

  it('never interrupts for a programme with no stated renewal', () => {
    expect(needsAttention(null)).toBe(false);
  });
});

describe('isUpcoming', () => {
  const submitted = new Date(2026, 0, 1);

  it('surfaces a renewal from about two months out, when the packet is posted', () => {
    // Waiting for the final month would reproduce the exact failure this feature prevents.
    expect(isUpcoming(renewalFor(rolling.id, submitted, new Date(2026, 10, 15)))).toBe(true);
  });

  it('stays quiet while the deadline is far away', () => {
    expect(isUpcoming(renewalFor(rolling.id, submitted, new Date(2026, 0, 2)))).toBe(false);
  });

  it('still surfaces an overdue renewal', () => {
    expect(isUpcoming(renewalFor(rolling.id, submitted, new Date(2027, 1, 1)))).toBe(true);
  });

  it('is wider than the interrupt threshold', () => {
    const soon = renewalFor(rolling.id, submitted, new Date(2026, 10, 15));
    expect(isUpcoming(soon)).toBe(true);
    expect(needsAttention(soon)).toBe(false);
  });
});

describe('bySoonest', () => {
  it('puts the most pressing renewal first', () => {
    const submitted = new Date(2026, 0, 1);
    const near = renewalFor(rolling.id, submitted, new Date(2026, 11, 15))!;
    const far = renewalFor(rolling.id, submitted, new Date(2026, 0, 2))!;
    expect([far, near].sort(bySoonest)[0]).toBe(near);
  });
});

describe('month-end arithmetic', () => {
  it('does not spill past the end of a short month', () => {
    // new Date(2024, 0, 31).setMonth(+1) is March 2nd, because February has no 31st. On a
    // renewal that silently moves the deadline later and shortens the warning window.
    const jan31 = new Date(2024, 0, 31);
    const window = renewalFor(rolling.id, jan31, new Date(2024, 0, 31));

    expect(window).not.toBeNull();
    // Twelve months on from Jan 31 is Jan 31, and must stay there.
    expect(window!.dueOn.getMonth()).toBe(0);
    expect(window!.dueOn.getDate()).toBe(31);
  });
});
