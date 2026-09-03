import { render, screen } from '@testing-library/react-native';

import { StageTracker } from './stage-tracker';

const stages = ['Submitted', 'In review', 'Decision'];

describe('StageTracker', () => {
  it('renders every stage label', () => {
    render(<StageTracker labels={stages} stage={1} />);
    for (const label of stages) expect(screen.getByText(label)).toBeTruthy();
  });

  it('announces position as progress rather than as decoration', () => {
    render(<StageTracker labels={stages} stage={1} />);
    // A screen reader user gets "Stage 2 of 3: In review" instead of three unlabelled dots.
    expect(screen.getByLabelText('Stage 2 of 3: In review')).toBeTruthy();
  });

  it('handles the first stage', () => {
    render(<StageTracker labels={stages} stage={0} />);
    expect(screen.getByLabelText('Stage 1 of 3: Submitted')).toBeTruthy();
  });

  it('handles the final stage', () => {
    render(<StageTracker labels={stages} stage={2} />);
    expect(screen.getByLabelText('Stage 3 of 3: Decision')).toBeTruthy();
  });

  it('degrades gracefully if the stage index is out of range', () => {
    // Server data should never do this, but a crash on the Home tab is a bad way to find out.
    expect(() => render(<StageTracker labels={stages} stage={7} />)).not.toThrow();
  });

  it('works with a translated set of labels', () => {
    render(<StageTracker labels={['Enviada', 'En revisión', 'Decisión']} stage={1} />);
    expect(screen.getByText('En revisión')).toBeTruthy();
  });
});
