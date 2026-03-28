import { DependencyType, type DurationUnit } from './types';

export interface DependencyData {
  id: string;
  fromTask: string;              // Predecessor task ID
  toTask: string;                // Successor task ID
  type: DependencyType;
  lag: number;                   // Positive = lag, negative = lead
  lagUnit: DurationUnit;
  active: boolean;               // Whether dependency affects scheduling
  cls: string | null;            // CSS class for line styling
}

export class DependencyModel implements DependencyData {
  id: string;
  fromTask: string;
  toTask: string;
  type: DependencyType;
  lag: number;
  lagUnit: DurationUnit;
  active: boolean;
  cls: string | null;

  constructor(data: DependencyData) {
    this.id = data.id;
    this.fromTask = data.fromTask;
    this.toTask = data.toTask;
    this.type = data.type;
    this.lag = data.lag;
    this.lagUnit = data.lagUnit;
    this.active = data.active;
    this.cls = data.cls;
  }

  validate(): string[] {
    const errors: string[] = [];

    // id must be non-empty string
    if (!this.id || this.id.trim() === '') {
      errors.push('id must be a non-empty string');
    }

    // fromTask must be non-empty string
    if (!this.fromTask || this.fromTask.trim() === '') {
      errors.push('fromTask must be a non-empty string');
    }

    // toTask must be non-empty string
    if (!this.toTask || this.toTask.trim() === '') {
      errors.push('toTask must be a non-empty string');
    }

    // No self-dependencies
    if (this.fromTask === this.toTask) {
      errors.push('self-dependency is not allowed (fromTask cannot equal toTask)');
    }

    return errors;
  }

  static create(data: Partial<DependencyData>): DependencyModel {
    const fullData: DependencyData = {
      id: data.id ?? crypto.randomUUID(),
      fromTask: data.fromTask ?? '',
      toTask: data.toTask ?? '',
      type: data.type ?? DependencyType.FinishToStart,
      lag: data.lag ?? 0,
      lagUnit: data.lagUnit ?? 'day',
      active: data.active ?? true,
      cls: data.cls ?? null
    };

    return new DependencyModel(fullData);
  }

  static createFinishToStart(from: string, to: string): DependencyModel {
    return DependencyModel.create({
      fromTask: from,
      toTask: to,
      type: DependencyType.FinishToStart
    });
  }
}
