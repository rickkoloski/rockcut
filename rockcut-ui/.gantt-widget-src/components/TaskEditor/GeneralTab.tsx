import React from 'react';
import { Input } from '../common';
import type { TaskData } from '../../models/TaskModel';
import { formatDateForInput } from '../../utils/dateUtils';

export interface GeneralTabProps {
  draft: Partial<TaskData>;
  onChange: (changes: Partial<TaskData>) => void;
  errors: Record<string, string>;
}

export function GeneralTab({ draft, onChange, errors }: GeneralTabProps) {
  const handleDateChange = (field: 'startDate' | 'endDate', value: string) => {
    const date = value ? new Date(value + 'T00:00:00') : null;
    onChange({ [field]: date });
  };

  return (
    <div className="space-y-4">
      <Input
        label="Task Name"
        value={draft.name || ''}
        onChange={e => onChange({ name: e.target.value })}
        error={errors.name}
        required
        data-testid="input-name"
      />

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Start Date"
          type="date"
          value={draft.startDate ? formatDateForInput(draft.startDate) : ''}
          onChange={e => handleDateChange('startDate', e.target.value)}
          error={errors.startDate}
          data-testid="input-start-date"
        />

        <Input
          label="End Date"
          type="date"
          value={draft.endDate ? formatDateForInput(draft.endDate) : ''}
          onChange={e => handleDateChange('endDate', e.target.value)}
          error={errors.endDate}
          data-testid="input-end-date"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Duration (days)"
          type="number"
          min={0}
          value={draft.duration ?? ''}
          onChange={e => onChange({ duration: parseInt(e.target.value) || 0 })}
          error={errors.duration}
          data-testid="input-duration"
        />

        <Input
          label="% Complete"
          type="number"
          min={0}
          max={100}
          value={draft.percentDone ?? 0}
          onChange={e => onChange({ percentDone: parseInt(e.target.value) || 0 })}
          error={errors.percentDone}
          data-testid="input-percent-done"
        />
      </div>

      {/* Progress bar preview */}
      <div className="mt-2">
        <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all"
            style={{ width: `${draft.percentDone || 0}%` }}
          />
        </div>
      </div>

      <div className="flex gap-6 mt-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.milestone || false}
            onChange={e => onChange({ milestone: e.target.checked, duration: e.target.checked ? 0 : draft.duration })}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            data-testid="checkbox-milestone"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Milestone</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={draft.manuallyScheduled || false}
            onChange={e => onChange({ manuallyScheduled: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            data-testid="checkbox-manually-scheduled"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">Manually Scheduled</span>
        </label>
      </div>
    </div>
  );
}
