export enum ResourceType {
  Work = 'work',
  Material = 'material',
  Cost = 'cost',
}

export interface ResourceData {
  id: string;
  name: string;
  type: ResourceType;
  maxUnits: number;
  email?: string;
  role?: string;
  calendarId: string | null;
  color?: string;
}

export class ResourceModel implements ResourceData {
  id: string;
  name: string;
  type: ResourceType;
  maxUnits: number;
  email?: string;
  role?: string;
  calendarId: string | null;
  color?: string;

  constructor(data: ResourceData) {
    this.id = data.id;
    this.name = data.name;
    this.type = data.type;
    this.maxUnits = data.maxUnits;
    this.email = data.email;
    this.role = data.role;
    this.calendarId = data.calendarId;
    this.color = data.color;
  }

  get isWork(): boolean {
    return this.type === ResourceType.Work;
  }

  get isMaterial(): boolean {
    return this.type === ResourceType.Material;
  }

  get isCost(): boolean {
    return this.type === ResourceType.Cost;
  }

  get displayName(): string {
    return this.role ? `${this.name} (${this.role})` : this.name;
  }

  static create(data: Partial<ResourceData>): ResourceModel {
    const fullData: ResourceData = {
      id: data.id ?? crypto.randomUUID(),
      name: data.name ?? 'Resource',
      type: data.type ?? ResourceType.Work,
      maxUnits: data.maxUnits ?? 100,
      email: data.email,
      role: data.role,
      calendarId: data.calendarId ?? null,
      color: data.color,
    };
    return new ResourceModel(fullData);
  }
}
