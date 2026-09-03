import * as fs from 'fs';
import * as path from 'path';

import { act, renderHook, waitFor } from '@testing-library/react-native';
import * as React from 'react';
import type { ReactNode } from 'react';

import { chooseDocument, looksReadable, readDocument } from '@/features/extraction';
import { AppStoreProvider, useAppStore } from '@/state/app-store';

/**
 * Only the picker/reader boundary is mocked, exactly as `app-store.test.tsx` does it — everything
 * on this side (dispatch, reconciliation, the reducer) runs unmocked, so the "no shortcut" test
 * below is exercising the real `upload()`, not a stand-in for it.
 */
jest.mock('@/features/extraction', () => {
  const actual = jest.requireActual('@/features/extraction');
  return {
    ...actual,
    captureDocument: jest.fn(),
    chooseDocument: jest.fn(),
    looksReadable: jest.fn(),
    readDocument: jest.fn(),
    extractFields: jest.fn(),
  };
});

/**
 * This app used to ship a "demo mode": an invented applicant baked into the profile, and a
 * function that manufactured extracted-field candidates out of thin air at a flat, fake 0.94
 * confidence. Those candidates were not cosmetic — they flowed straight into the same
 * reconciliation and eligibility code a real document's output goes through, so a demo install
 * showed real NYC programmes (SNAP, Fair Fares, IDNYC, …) as eligible against income and
 * household numbers nobody had actually supplied. Anyone trusting that screen — a caseworker, a
 * reviewer, a user who forgot the toggle was on — was looking at a government benefits
 * determination for a person who does not exist.
 *
 * That machinery has just been deleted. The owner's requirement going forward is absolute: the
 * app must never present data the user did not actually supply. This file exists to make that
 * regression loud and specific — a bare boolean here would fail the letter of the requirement
 * without leaving a future maintainer anything to act on, so every check below names the file and
 * line it found a problem in.
 *
 * One deliberate carve-out: `reset` stays. Clearing everything back to nothing is the opposite of
 * fabrication and is out of scope here.
 */

/**
 * The forbidden vocabulary, assembled from fragments rather than written out whole.
 *
 * A plain-string sweep of src/ must not find its own source describing what it looks for — a
 * needle written out in full here would make this file itself an offender, and the "no offenses"
 * result would then be permanently unreachable (or, worse, silently excluded and untested). Every
 * needle is built with a runtime `join`/`+` so the contiguous forbidden substring never appears
 * literally in this file's source text. The "cannot match its own source" test below verifies
 * that mechanically rather than trusting the reasoning.
 */
const FORBIDDEN_NEEDLES: string[] = [
  ['sample', '-profile'].join(''),
  ['load', 'Sample'].join(''),
  ['clear', 'Sample'].join(''),
  ['extraction', 'For'].join(''),
  ['SAMPLE', '_PREFIX'].join(''),
  ['demo', 'Sample'].join(''),
  ['demo', 'Failure'].join(''),
  ['reset', 'Demo'].join(''),
];

const ENV_NEEDLE = ['EXPO_PUBLIC', '_DEMO'].join('');

const SRC_ROOT = path.join(__dirname, '..');
const THIS_FILE = path.resolve(__filename);
const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

function listSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      files.push(...listSourceFiles(full));
    } else if (SCANNED_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(full);
    }
  }
  return files;
}

type Offense = { needle: string; file: string; line: number; text: string };

/** Every hit for `needles` anywhere under src/ — in a file's path or its content, by line. */
function sweep(needles: string[]): Offense[] {
  const offenses: Offense[] = [];
  for (const file of listSourceFiles(SRC_ROOT)) {
    if (path.resolve(file) === THIS_FILE) continue; // never let the sweep match itself
    const relative = path.relative(SRC_ROOT, file);
    const content = fs.readFileSync(file, 'utf8');

    for (const needle of needles) {
      if (relative.includes(needle)) {
        offenses.push({ needle, file: relative, line: 0, text: '(matched in the file path)' });
      }
      content.split('\n').forEach((lineText, index) => {
        if (lineText.includes(needle)) {
          offenses.push({ needle, file: relative, line: index + 1, text: lineText.trim() });
        }
      });
    }
  }
  return offenses;
}

function assertNoOffenses(offenses: Offense[]): void {
  if (offenses.length === 0) return;
  const report = offenses
    .map((o) => `  ${o.file}:${o.line}  [${o.needle}]  ${o.text}`)
    .join('\n');
  throw new Error(`Fabricated-data machinery found in src/:\n${report}`);
}

describe('this sweep cannot match its own source', () => {
  it('finds none of its own needles when it reads itself', () => {
    // Guards the guard: if this file ever started matching itself, every real failure below would
    // be masked by a permanent false positive (or the file would have to special-case skipping
    // itself in a way that could accidentally also skip a real offender).
    const content = fs.readFileSync(THIS_FILE, 'utf8');
    for (const needle of [...FORBIDDEN_NEEDLES, ENV_NEEDLE]) {
      expect(content.includes(needle)).toBe(false);
    }
  });
});

function wrapper({ children }: { children: ReactNode }) {
  // React.createElement, not JSX — this file is .ts, and JSX syntax requires .tsx to type-check
  // under this project's strict TypeScript config.
  return React.createElement(AppStoreProvider, null, children);
}

describe('a fresh install has nothing on file', () => {
  it('starts with no documents, no candidates, no applications and no profile values', () => {
    // This is the behavioural core of the guarantee: a brand-new install must render an empty
    // profile, never a populated one. Demo mode's entire failure mode was skipping straight past
    // this state into one that looked, to the eye, like a person who had already uploaded proof.
    const { result } = renderHook(() => useAppStore(), { wrapper });

    expect(result.current.documents).toEqual([]);
    expect(result.current.candidates).toEqual([]);
    expect(result.current.applications).toEqual([]);
    expect(result.current.overrides).toEqual({});
    expect(result.current.values).toEqual({});
    expect(result.current.resolved).toEqual([]);
    expect(result.current.confirmedFields).toEqual([]);
  });

  it('has no identity document and no categories of proof on file', () => {
    const { result } = renderHook(() => useAppStore(), { wrapper });
    expect(result.current.hasIdentityDocument).toBe(false);
    expect(result.current.categoriesOnFile).toEqual([]);
  });
});

describe('the public store API exposes no way to fabricate', () => {
  it('has no member for loading or clearing a canned profile', () => {
    const { result } = renderHook(() => useAppStore(), { wrapper });

    const keys = Object.keys(result.current);
    for (const needle of FORBIDDEN_NEEDLES) {
      expect(keys.some((k) => k.includes(needle))).toBe(false);
      expect(needle in result.current).toBe(false);
    }
  });

  it('upload() takes no shortcut for a "simulate"-style option — it always goes through the real picker', async () => {
    // The old machinery's most likely comeback is exactly this shape: an extra option on
    // `upload()` that skips the camera/library picker and hands back canned candidates instead.
    // `upload`'s declared type has no such field; forcing one through with a type escape hatch and
    // checking the real picker still fired proves the runtime has no hidden branch honoring it.
    const mockChooseDocument = chooseDocument as jest.MockedFunction<typeof chooseDocument>;
    const mockLooksReadable = looksReadable as jest.MockedFunction<typeof looksReadable>;
    const mockReadDocument = readDocument as jest.MockedFunction<typeof readDocument>;

    mockChooseDocument.mockResolvedValue({
      ok: true,
      document: { uri: 'file://probe.jpg', width: 10, height: 10 },
    });
    mockLooksReadable.mockReturnValue({ ok: true });
    mockReadDocument.mockResolvedValue({
      ok: true,
      documentType: 'passport',
      confidence: 0.5,
      candidates: [],
      text: 'probe text',
    });

    const { result } = renderHook(() => useAppStore(), { wrapper });

    act(() => {
      result.current.upload({ simulate: true, fake: true } as never);
    });

    await waitFor(() => expect(mockChooseDocument).toHaveBeenCalled());
  });
});

describe('the sample profile file is gone', () => {
  it('the canned-profile fixture file no longer exists under src/data', () => {
    const fixtureBasename = FORBIDDEN_NEEDLES[0]; // 'sample' + '-profile', assembled above
    expect(fs.existsSync(path.join(SRC_ROOT, 'data', `${fixtureBasename}.ts`))).toBe(false);
    expect(fs.existsSync(path.join(SRC_ROOT, 'data', `${fixtureBasename}.tsx`))).toBe(false);
  });
});

describe('no source file references the removed demo machinery', () => {
  it('finds no mention of the fabrication helpers anywhere in src/', () => {
    assertNoOffenses(sweep(FORBIDDEN_NEEDLES));
  });
});

describe('no demo env switch is read', () => {
  it('finds no demo-mode environment variable read anywhere in src/', () => {
    assertNoOffenses(sweep([ENV_NEEDLE]));
  });
});
