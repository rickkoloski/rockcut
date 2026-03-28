import React from 'react';

export interface NotesTabProps {
  notes: string;
  onChange: (notes: string) => void;
}

export function NotesTab({ notes, onChange }: NotesTabProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Notes
      </label>
      <textarea
        value={notes}
        onChange={e => onChange(e.target.value)}
        rows={10}
        className="w-full px-3 py-2 border rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        placeholder="Add notes about this task..."
        data-testid="notes-textarea"
      />
      <p className="text-xs text-gray-500 text-right">
        {notes.length} characters
      </p>
    </div>
  );
}
