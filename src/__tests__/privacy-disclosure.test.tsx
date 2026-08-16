import { render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import PrivacyScreen from '@/app/privacy';
import { dictionaries } from '@/i18n/strings';
import { AppStoreProvider } from '@/state/app-store';

/**
 * The privacy screen must name where documents go.
 *
 * This is the test that stops the app from repeating the mistake it already made once: the "where
 * it goes" card used to say "nowhere yet — no document has left your phone", and remote OCR makes
 * that a lie the moment it is switched on. The card is generated from the OCR provider that will
 * actually run, and this asserts the generation both ways — the provider is mocked as remote and
 * as local, and the screen has to change its answer.
 *
 * Lives outside `src/app` because that directory is the expo-router routes root.
 */

// `mock`-prefixed so Jest permits it inside the hoisted factory.
const mockSendsImagesTo = { value: null as string | null };

jest.mock('@/features/extraction/ocr-provider', () => ({
  ocrProvider: () => ({
    name: 'mock',
    sendsImagesTo: mockSendsImagesTo.value,
    isAvailable: () => true,
    read: async () => ({ ok: false, reason: 'failed', detail: 'not used' }),
  }),
  canExtract: () => true,
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
}));

function renderPrivacy() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStoreProvider>{children}</AppStoreProvider>
  );
  return render(<PrivacyScreen />, { wrapper });
}

describe('when a remote reader is enabled', () => {
  beforeEach(() => {
    mockSendsImagesTo.value = 'Google Gemini';
  });

  it('names the service the document image is sent to', () => {
    renderPrivacy();
    expect(screen.getByText(/Google Gemini/)).toBeTruthy();
  });

  it('stops claiming the document never leaves the phone', () => {
    renderPrivacy();
    expect(screen.queryByText(dictionaries.en.privacyScreen.whereBody)).toBeNull();
    expect(screen.queryByText(/no image of it has left your phone/i)).toBeNull();
  });

  it('discloses the retention risk rather than only the encryption', () => {
    // "Encrypted connection" is the reassuring half. On the free tier an image can be retained
    // and reviewed by a person, and for somebody weighing whether to photograph an I-20 that is
    // the half that decides it.
    renderPrivacy();
    expect(screen.getByText(/reviewed by a person/i)).toBeTruthy();
  });

  it('says so in Spanish too', () => {
    const { unmount } = renderPrivacy();
    unmount();
    // The copy is switched by the store, but the assertion that matters is that the Spanish
    // dictionary carries the same disclosure rather than the old "a ninguna parte" text.
    expect(dictionaries.es.privacyScreen.whereRemoteBody).toContain('{service}');
    expect(dictionaries.es.privacyScreen.whereRemoteNext).toMatch(/Google/);
    expect(dictionaries.es.privacyScreen.whereRemoteBody).not.toMatch(/a ninguna parte/i);
  });
});

describe('when the document is read on the device', () => {
  beforeEach(() => {
    mockSendsImagesTo.value = null;
  });

  it('says nothing left the phone, and names no service', () => {
    renderPrivacy();
    expect(screen.getByText(/no image of it has left your phone/i)).toBeTruthy();
    expect(screen.queryByText(/Google Gemini/)).toBeNull();
  });
});

describe('the disclosure copy itself', () => {
  it('never promises the image stays on the device', () => {
    // Guards the wording in both languages, in the direction the app has already got wrong once.
    for (const language of ['en', 'es'] as const) {
      const copy = dictionaries[language].privacyScreen;
      expect(copy.whereRemoteBody.toLowerCase()).not.toMatch(
        /never leaves|stays on your phone|no sale de su tel|permanece en su tel/,
      );
    }
  });
});
