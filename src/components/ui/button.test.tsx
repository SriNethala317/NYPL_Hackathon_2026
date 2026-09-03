import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from './button';

describe('Button', () => {
  it('fires onPress when enabled', () => {
    const onPress = jest.fn();
    render(<Button label="Start application" onPress={onPress} />);
    fireEvent.press(screen.getByText('Start application'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('swallows the press when genuinely disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Submit" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Submit'));
    expect(onPress).not.toHaveBeenCalled();
  });

  describe('inactive', () => {
    it('still fires onPress, so the caller can explain what is missing', () => {
      // This is the whole reason `inactive` exists. A truly disabled submit button leaves the
      // user tapping a dead control with no idea which field is incomplete.
      const onPress = jest.fn();
      render(<Button label="Review application" onPress={onPress} inactive />);
      fireEvent.press(screen.getByText('Review application'));
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('is NOT announced as disabled', () => {
      // Assistive tech skips or discourages disabled controls. Since pressing this button is
      // how the user learns which fields are incomplete, it must stay reachable.
      render(<Button label="Review application" inactive />);
      expect(screen.getByRole('button')).toBeEnabled();
    });

    it('carries a hint explaining what is missing', () => {
      render(
        <Button
          label="Review application"
          inactive
          accessibilityHint="Complete every field and certify to continue"
        />,
      );
      expect(
        screen.getByHintText('Complete every field and certify to continue'),
      ).toBeTruthy();
    });
  });

  it('exposes the label as the accessible name', () => {
    render(<Button label="Apply anyway" />);
    expect(screen.getByRole('button', { name: 'Apply anyway' })).toBeTruthy();
  });

  it('renders a leading icon when given one', () => {
    render(<Button label="Add a document" icon={<></>} testID="add" />);
    expect(screen.getByText('Add a document')).toBeTruthy();
  });
});
