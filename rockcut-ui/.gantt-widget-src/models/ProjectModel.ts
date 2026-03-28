import { TaskModel } from './TaskModel';
import { DependencyModel } from './DependencyModel';

export interface ProjectData {
  id: string;
  name: string;
  startDate: Date;
  calendar: string | null;       // Default calendar ID
}

export class ProjectModel implements ProjectData {
  id: string;
  name: string;
  startDate: Date;
  calendar: string | null;

  // Collections - will be managed by stores in D2
  tasks: TaskModel[] = [];
  dependencies: DependencyModel[] = [];

  constructor(data: ProjectData) {
    this.id = data.id;
    this.name = data.name;
    this.startDate = data.startDate;
    this.calendar = data.calendar;
  }

  static create(data: Partial<ProjectData>): ProjectModel {
    const fullData: ProjectData = {
      id: data.id ?? crypto.randomUUID(),
      name: data.name ?? '',
      startDate: data.startDate ?? new Date(),
      calendar: data.calendar ?? null
    };

    return new ProjectModel(fullData);
  }
}
