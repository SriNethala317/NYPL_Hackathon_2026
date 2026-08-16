import { Children, Fragment, type ReactNode } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { Card } from './card';
import { Divider } from './divider';
import { Text } from './text';

import { colors } from '@/theme';

export type DataRowProps = {
  label: string;
  value: ReactNode;
  /** Reference numbers and filenames read better fixed-width. */
  mono?: boolean;
};

/**
 * One label-left / value-right line. Used by the program detail facts card and by the review
 * summary card — same row, two screens.
 */
export function DataRow({ label, value, mono = false }: DataRowProps) {
  return (
    <View style={styles.row}>
      <Text variant="labelRegular" color="muted" style={styles.label}>
        {label}
      </Text>
      {typeof value === 'string' ? (
        <Text variant="label" mono={mono} align="right" style={styles.value}>
          {value}
        </Text>
      ) : (
        <View style={styles.value}>{value}</View>
      )}
    </View>
  );
}

export type RowGroupProps = ViewProps & {
  children: ReactNode;
};

/**
 * Wraps rows in a card and draws a hairline *between* them — never above the first or below
 * the last, which is the detail that makes a stack of rows look intentional.
 */
export function RowGroup({ children, style, ...rest }: RowGroupProps) {
  const rows = Children.toArray(children);

  return (
    <Card style={style} {...rest}>
      {rows.map((row, index) => (
        // Index keys are safe here: these lists are static field definitions, never reordered.
        <Fragment key={index}>
          {index > 0 && <Divider />}
          {row}
        </Fragment>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: colors.paper,
  },
  label: {
    flexShrink: 1,
  },
  // Values win the space fight — a long address should wrap before the label does.
  value: {
    flexShrink: 0,
    maxWidth: '60%',
  },
});
