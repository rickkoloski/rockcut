import React, { useState } from 'react';
import type { BaselineStore } from '../../stores/BaselineStore';

interface BaselineToggleProps {
  baselineStore: BaselineStore;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onCapture?: (name: string) => void;
}

/**
 * Toggle component for showing/hiding baseline bars.
 * Includes baseline selector and capture button.
 */
export const BaselineToggle: React.FC<BaselineToggleProps> = ({
  baselineStore,
  enabled,
  onToggle,
  onCapture,
}) => {
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const [newBaselineName, setNewBaselineName] = useState('');

  const baselines = baselineStore.getAllBaselines();
  const activeBaseline = baselineStore.getActiveBaseline();
  const canCapture = !baselineStore.isMaxReached;

  const handleCaptureClick = () => {
    setNewBaselineName(`Baseline ${baselines.length + 1}`);
    setShowCaptureDialog(true);
  };

  const handleCaptureConfirm = () => {
    if (newBaselineName.trim() && onCapture) {
      onCapture(newBaselineName.trim());
      setShowCaptureDialog(false);
      setNewBaselineName('');
    }
  };

  const handleCaptureCancel = () => {
    setShowCaptureDialog(false);
    setNewBaselineName('');
  };

  return (
    <div className="baseline-toggle flex items-center gap-2" data-testid="baseline-toggle">
      {/* Toggle checkbox */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="w-4 h-4"
          data-testid="baseline-toggle-checkbox"
          disabled={baselines.length === 0}
        />
        <span className="text-sm">Show Baseline</span>
      </label>

      {/* Baseline selector */}
      {baselines.length > 0 && (
        <select
          value={activeBaseline?.id || ''}
          onChange={(e) => baselineStore.setActiveBaseline(e.target.value || null)}
          className="text-sm border rounded px-2 py-1 bg-white"
          data-testid="baseline-selector"
          disabled={!enabled}
        >
          {baselines.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      )}

      {/* Capture baseline button */}
      {onCapture && (
        <button
          onClick={handleCaptureClick}
          className="text-sm text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline"
          data-testid="capture-baseline-button"
          disabled={!canCapture}
          title={canCapture ? 'Capture a new baseline' : 'Maximum 3 baselines reached'}
        >
          Capture Baseline
        </button>
      )}

      {/* Capture dialog */}
      {showCaptureDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          data-testid="capture-dialog-backdrop"
          onClick={handleCaptureCancel}
        >
          <div
            className="bg-white rounded-lg p-4 shadow-lg min-w-[300px]"
            onClick={(e) => e.stopPropagation()}
            data-testid="capture-dialog"
          >
            <h3 className="text-lg font-semibold mb-4">Capture Baseline</h3>
            <label className="block mb-4">
              <span className="text-sm text-gray-600">Baseline Name</span>
              <input
                type="text"
                value={newBaselineName}
                onChange={(e) => setNewBaselineName(e.target.value)}
                className="mt-1 block w-full border rounded px-3 py-2"
                placeholder="Enter baseline name"
                data-testid="baseline-name-input"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCaptureConfirm();
                  if (e.key === 'Escape') handleCaptureCancel();
                }}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCaptureCancel}
                className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
                data-testid="capture-cancel-button"
              >
                Cancel
              </button>
              <button
                onClick={handleCaptureConfirm}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                disabled={!newBaselineName.trim()}
                data-testid="capture-confirm-button"
              >
                Capture
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
