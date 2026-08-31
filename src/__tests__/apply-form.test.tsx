import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import ApplicationFormScreen from '@/app/apply/[id]';

import { AppStoreProvider } from '@/state/app-store';

/**
 * Lives outside `src/app` on purpose: that directory is the expo-router routes root, so any file
 * placed there becomes a route and Metro tries to bundle its imports into the app.
 */

// `mock`-prefixed so Jest allows it inside the hoisted factory below.
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    navigate: jest.fn(),
    replace: jest.fn(),
    dismissTo: jest.fn(),
  },
  useLocalSearchParams: () => ({ id: 'fair_fares' }),
}));

function renderForm() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppStoreProvider>{children}</AppStoreProvider>
  );
  return render(<ApplicationFormScreen />, { wrapper });
}

beforeEach(() => mockPush.mockClear());

describe('the application form', () => {
  it('shows every Master Profile field', () => {
    renderForm();
    for (const label of [
      'Full name',
      'Date of birth',
      'Home address',
      'People in household',
      'Monthly income',
    ]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('tells the applicant which fields a machine filled in', () => {
    // They are about to certify these values as true, so provenance is not decoration.
    renderForm();
    expect(screen.getAllByText('Enter this yourself').length).toBeGreaterThan(0);
  });

  it('does not advance while fields are empty', () => {
    renderForm();
    fireEvent.press(screen.getByText('Review application'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('reveals the errors instead of failing silently', () => {
    renderForm();
    expect(screen.queryAllByText('Required')).toHaveLength(0);

    // The button is muted but still pressable — that press is the only way to find out why.
    fireEvent.press(screen.getByText('Review application'));

    expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
  });

  it('refuses to continue on consent alone', () => {
    renderForm();
    fireEvent.press(screen.getByLabelText(/I certify/));
    fireEvent.press(screen.getByText('Review application'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('refuses to continue on a complete form without consent', () => {
    // Certification is a legal attestation; it must never be implied by filling the fields.
    renderForm();
    fillEveryField();
    fireEvent.press(screen.getByText('Review application'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('advances once every field is filled and consent is given', () => {
    renderForm();
    fillEveryField();
    fireEvent.press(screen.getByLabelText(/I certify/));

    fireEvent.press(screen.getByText('Review application'));

    expect(mockPush).toHaveBeenCalledWith({ pathname: '/review', params: { id: 'fair_fares' } });
  });

  it('rejects whitespace as a filled field', () => {
    renderForm();
    fillEveryField();
    act(() => {
      fireEvent.changeText(screen.getByLabelText('Full name'), '   ');
    });
    fireEvent.press(screen.getByLabelText(/I certify/));
    fireEvent.press(screen.getByText('Review application'));

    expect(mockPush).not.toHaveBeenCalled();
  });
});

function fillEveryField() {
  const values: [string, string][] = [
    ['Full name', 'Maria Reyes'],
    ['Date of birth', '04/18/1991'],
    ['Home address', '1240 Grand Concourse, Bronx, NY 10456'],
    ['People in household', '3'],
    ['Monthly income', '2310'],
  ];
  for (const [label, value] of values) {
    act(() => {
      fireEvent.changeText(screen.getByLabelText(label), value);
    });
  }
}
