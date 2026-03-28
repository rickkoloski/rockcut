import React from 'react';
import { Select } from '../common';
import { ConstraintType } from '../../models/types';
import { formatDateForInput } from '../../utils/dateUtils';

export interface ConstraintTabProps {
  constraintType: ConstraintType;
  constraintDate: Date | null;
  onChange: (type: ConstraintType, date: Date | null) => void;
}

const CONSTRAINT_OPTIONS = [
  { value: String(ConstraintType.ASAP), label: 'As Soon As Possible (ASAP)' },
  { value: String(ConstraintType.ALAP), label: 'As Late As Possible (ALAP)' },
  { value: String(ConstraintType.SNET), label: 'Start No Earlier Than (SNET)' },
  { value: String(ConstraintType.SNLT), label: 'Start No Later Than (SNLT)' },
  { value: String(ConstraintType.FNET), label: 'Finish No Earlier Than (FNET)' },
  { value: String(ConstraintType.FNLT), label: 'Finish No Later Than (FNLT)' },
  { value: String(ConstraintType.MSO), label: 'Must Start On (MSO)' },
  { value: String(ConstraintType.MFO), label: 'Must Finish On (MFO)' },
];

const CONSTRAINT_DESCRIPTIONS: Record<number, string> = {
  [ConstraintType.ASAP]: 'Task will be scheduled as early as possible based on dependencies.',
  [ConstraintType.ALAP]: 'Task will be scheduled as late as possible without delaying the project.',
  [ConstraintType.SNET]: 'Task will not start before the constraint date.',
  [ConstraintType.SNLT]: 'Task must start on or before the constraint date.',
  [ConstraintType.FNET]: 'Task will not finish before the constraint date.',
  [ConstraintType.FNLT]: 'Task must finish on or before the constraint date.',
  [ConstraintType.MSO]: 'Task must start exactly on the constraint date.',
  [ConstraintType.MFO]: 'Task must finish exactly on the constraint date.',
};

// Constraints that require a date
const DATE_REQUIRED_CONSTRAINTS = [
  ConstraintType.SNET,
  ConstraintType.SNLT,
  ConstraintType.FNET,
  ConstraintType.FNLT,
  ConstraintType.MSO,
  ConstraintType.MFO,
];

export function ConstraintTab({ constraintType, constraintDate, onChange }: ConstraintTabProps) {
  const needsDate = DATE_REQUIRED_CONSTRAINTS.includes(constraintType);

  const handleTypeChange = (value: string) => {
    const newType = parseInt(value) as ConstraintType;
    // Clear date if new type doesn't need it
    const newDate = DATE_REQUIRED_CONSTRAINTS.includes(newType) ? constraintDate : null;
    onChange(newType, newDate);
  };

  const handleDateChange = (value: string) => {
    const date = value ? new Date(value + 'T00:00:00') : null;
    onChange(constraintType, date);
  };

  return (
    <div className="space-y-6">
      <div>
        <Select
          label="Constraint Type"
          value={String(constraintType)}
          onChange={e => handleTypeChange(e.target.value)}
          options={CONSTRAINT_OPTIONS}
          data-testid="select-constraint-type"
        />
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          {CONSTRAINT_DESCRIPTIONS[constraintType]}
        </p>
      </div>

      {needsDate && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Constraint Date
          </label>
          <input
            type="date"
            value={constraintDate ? formatDateForInput(constraintDate) : ''}
            onChange={e => handleDateChange(e.target.value)}
            className="w-48 px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            data-testid="input-constraint-date"
          />
        </div>
      )}
    </div>
  );
}
