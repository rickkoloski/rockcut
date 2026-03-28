import React, { useState, useRef, useEffect } from 'react';
import type { ColumnState } from '../../hooks';

export interface ColumnVisibilityMenuProps {
  columns: ColumnState[];
  onToggleColumn: (columnId: string, visible: boolean) => void;
}

export function ColumnVisibilityMenu({ columns, onToggleColumn }: ColumnVisibilityMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const visibleCount = columns.filter(c => c.visible).length;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-[var(--color-border)] rounded hover:bg-[var(--color-surface-hover)] transition-colors"
        data-testid="column-visibility-button"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        Columns
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 shadow-lg rounded-md border border-gray-200 dark:border-gray-700 z-50 min-w-[200px] py-1"
          data-testid="column-visibility-menu"
        >
          <div className="px-3 py-2 text-xs font-medium text-gray-500 uppercase border-b border-gray-200 dark:border-gray-700">
            Show/Hide Columns
          </div>

          {columns.map(column => {
            const isLastVisible = column.visible && visibleCount === 1;

            return (
              <label
                key={column.id}
                className={`
                  flex items-center gap-2 px-3 py-2 cursor-pointer
                  ${isLastVisible ? 'opacity-50 cursor-not-allowed' : 'hover:bg-black/5 dark:hover:bg-white/10'}
                `}
              >
                <input
                  type="checkbox"
                  checked={column.visible}
                  onChange={(e) => {
                    if (!isLastVisible) {
                      onToggleColumn(column.id, e.target.checked);
                    }
                  }}
                  disabled={isLastVisible}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  data-testid={`column-toggle-${column.id}`}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {column.header}
                </span>
              </label>
            );
          })}

          <div className="border-t border-gray-200 dark:border-gray-700 mt-1 pt-1">
            <button
              onClick={() => {
                columns.forEach(c => {
                  if (!c.visible) {
                    onToggleColumn(c.id, true);
                  }
                });
              }}
              className="w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-black/5 dark:hover:bg-white/10"
              data-testid="show-all-columns-button"
            >
              Show All Columns
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
