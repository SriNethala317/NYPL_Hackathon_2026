import fs from 'node:fs';
import path from 'node:path';

/**
 * Every tab renders through `TabScreen`, and the reason is the status bar.
 *
 * `AppHeader` derives its top padding from the real safe-area inset. A screen that builds its own
 * `ScrollView` instead gets no inset, and on a notched phone its first row sits underneath the
 * clock, the carrier name and the battery — while looking perfectly correct in a simulator, in a
 * web export, and in every screenshot taken on a device without a notch. That is what makes this
 * worth a test rather than a code review: the failure is invisible everywhere except the hardware
 * people actually hold.
 *
 * The frame carries two more things that are just as easy to forget: `layout.tabBarClearance` at
 * the bottom, without which the last card slides under the floating glass bar, and the content
 * width cap that stops a phone layout stretching across a tablet or a browser window.
 */

const TABS_DIR = path.join(__dirname, '..', 'app', '(tabs)');

/** The navigator itself, which configures the tabs rather than rendering a page inside one. */
const NOT_A_SCREEN = new Set(['_layout.tsx']);

function tabScreenFiles(): string[] {
  return fs
    .readdirSync(TABS_DIR)
    .filter((name) => name.endsWith('.tsx') && !NOT_A_SCREEN.has(name));
}

describe('every tab screen sits inside the shared frame', () => {
  it('finds tab screens to check at all', () => {
    // Guards the guard: a rename of the routes directory would otherwise turn every assertion
    // below into a vacuous pass over an empty list.
    expect(tabScreenFiles().length).toBeGreaterThan(0);
  });

  it('takes its top inset from the shared header, one way or the other', () => {
    /*
     * Two spellings are correct, because `TabScreen` is a header plus a `ScrollView` and one tab
     * cannot use the second half of that. Enrollment renders a `SectionList`, which must not be
     * nested inside a `ScrollView` — doing so breaks virtualization — so it composes `AppHeader`
     * directly and scrolls the list itself.
     *
     * What both spellings share is `AppHeader`, and that is the thing actually being asserted:
     * it is the single place the safe-area inset is applied. A screen reaching for neither is the
     * bug this test exists to catch.
     */
    const offenders = tabScreenFiles().filter((name) => {
      const source = fs.readFileSync(path.join(TABS_DIR, name), 'utf8');
      return !source.includes('<TabScreen') && !source.includes('<AppHeader');
    });

    expect(offenders).toEqual([]);
  });

  it('never rolls its own bare ScrollView, which is how the inset gets lost', () => {
    // The specific regression: this screen was a plain `ScrollView` with `padding` and no inset,
    // so its title sat on top of the clock. A `SectionList` is fine — it carries the header with
    // it — but a raw `ScrollView` at the root of a tab means nobody reserved the status bar.
    const offenders = tabScreenFiles().filter((name) => {
      const source = fs.readFileSync(path.join(TABS_DIR, name), 'utf8');
      return source.includes('<ScrollView');
    });

    expect(offenders).toEqual([]);
  });
});
