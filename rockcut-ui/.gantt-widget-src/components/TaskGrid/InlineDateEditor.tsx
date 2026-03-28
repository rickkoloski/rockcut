import { useState, useRef, useEffect } from 'react';

export interface InlineDateEditorProps {
  initialValue: Date | null;
  onSave: (value: Date) => void;
  onCancel: () => void;
  minDate?: Date;
  maxDate?: Date;
}

function formatDateForInput(date: Date | null): string {
  if (!date) return '';
  return date.toISOString().split('T')[0];
}

export function InlineDateEditor({
  initialValue,
  onSave,
  onCancel,
  minDate,
  maxDate,
}: InlineDateEditorProps) {
  const [value, setValue] = useState(formatDateForInput(initialValue));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleSave = () => {
    const newDate = new Date(value + 'T00:00:00');
    if (!isNaN(newDate.getTime())) {
      onSave(newDate);
    } else {
      onCancel();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
  };

  return (
    <input
      ref={inputRef}
      type="date"
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      onBlur={handleSave}
      min={minDate ? formatDateForInput(minDate) : undefined}
      max={maxDate ? formatDateForInput(maxDate) : undefined}
      className="w-full px-1 py-1 text-sm border border-blue-500 rounded outline-none focus:ring-2 focus:ring-blue-300"
      data-testid="inline-date-editor"
    />
  );
}
