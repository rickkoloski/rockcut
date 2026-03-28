export type StoreEventType = 'add' | 'remove' | 'update' | 'batch';

export interface StoreEvent<T> {
  type: StoreEventType;
  items: T[];
  changes?: Partial<T>;
}

export type StoreListener<T> = (event: StoreEvent<T>) => void;

export class Store<T extends { id: string }> {
  protected items: Map<string, T> = new Map();
  protected listeners: Set<StoreListener<T>> = new Set();
  private batching = false;
  private batchedItems: T[] = [];

  // CRUD - add single item
  add(item: T): void;
  // CRUD - add multiple items
  add(items: T[]): void;
  add(itemOrItems: T | T[]): void {
    const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
    items.forEach(item => this.items.set(item.id, item));
    this.emitOrBatch('add', items);
  }

  // CRUD - remove by single id
  remove(id: string): void;
  // CRUD - remove by multiple ids
  remove(ids: string[]): void;
  remove(idOrIds: string | string[]): void {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    const removed = ids.map(id => this.items.get(id)).filter(Boolean) as T[];
    ids.forEach(id => this.items.delete(id));
    if (removed.length > 0) {
      this.emitOrBatch('remove', removed);
    }
  }

  update(id: string, changes: Partial<T>): void {
    const item = this.items.get(id);
    if (item) {
      Object.assign(item, changes);
      this.emitOrBatch('update', [item], changes);
    }
  }

  getById(id: string): T | undefined {
    return this.items.get(id);
  }

  getAll(): T[] {
    return Array.from(this.items.values());
  }

  // Events
  on(listener: StoreListener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  off(listener: StoreListener<T>): void {
    this.listeners.delete(listener);
  }

  protected emit(event: StoreEvent<T>): void {
    this.listeners.forEach(listener => listener(event));
  }

  private emitOrBatch(type: StoreEventType, items: T[], changes?: Partial<T>): void {
    if (this.batching) {
      this.batchedItems.push(...items);
    } else {
      this.emit({ type, items, changes });
    }
  }

  // Batch - defers events until fn completes
  batch(fn: () => void): void {
    this.batching = true;
    this.batchedItems = [];
    try {
      fn();
    } finally {
      this.batching = false;
      if (this.batchedItems.length > 0) {
        this.emit({ type: 'batch', items: this.batchedItems });
      }
    }
  }

  // Query
  filter(predicate: (item: T) => boolean): T[] {
    return this.getAll().filter(predicate);
  }

  find(predicate: (item: T) => boolean): T | undefined {
    return this.getAll().find(predicate);
  }

  // State
  get count(): number {
    return this.items.size;
  }

  get isEmpty(): boolean {
    return this.items.size === 0;
  }

  clear(): void {
    const items = this.getAll();
    this.items.clear();
    if (items.length > 0) {
      this.emit({ type: 'remove', items });
    }
  }
}
