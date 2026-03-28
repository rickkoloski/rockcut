import { Store } from './Store';
import { ResourceModel, ResourceType } from '../models/ResourceModel';

export class ResourceStore extends Store<ResourceModel> {
  constructor() {
    super();
  }

  /**
   * Get all work-type resources.
   */
  getWorkResources(): ResourceModel[] {
    return this.getAll().filter(r => r.type === ResourceType.Work);
  }

  /**
   * Get all material-type resources.
   */
  getMaterialResources(): ResourceModel[] {
    return this.getAll().filter(r => r.type === ResourceType.Material);
  }

  /**
   * Get all cost-type resources.
   */
  getCostResources(): ResourceModel[] {
    return this.getAll().filter(r => r.type === ResourceType.Cost);
  }

  /**
   * Search resources by name (case-insensitive partial match).
   */
  searchByName(query: string): ResourceModel[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(r =>
      r.name.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * Get resource by ID.
   */
  getById(id: string): ResourceModel | undefined {
    return this.getAll().find(r => r.id === id);
  }
}
