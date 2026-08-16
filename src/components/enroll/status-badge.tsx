import { Badge, type BadgeProps } from '@/components/ui';
import { eligibility, type EligibilityStatus } from '@/theme';

export type StatusBadgeProps = Omit<BadgeProps, 'surface' | 'color'> & {
  status: EligibilityStatus;
};

/**
 * An eligibility chip. Thin on purpose — its whole job is to pull the right pair out of the
 * `eligibility` map so no screen picks those colors by hand.
 */
export function StatusBadge({ status, ...rest }: StatusBadgeProps) {
  const palette = eligibility[status];
  return <Badge surface={palette.badgeSurface} color={palette.badgeText} {...rest} />;
}
