interface Index<Value> {
  internalSet(key: string, value: Value): void;
  internalDelete(key: string): void;
}

class GroupIndex<Value> implements Index<Value> {
  #store = new Map<string, Map<string, Value>>();
  #groupBy;
  constructor({
    groupBy,
  }: {
    groupBy: (key: string, value: Value) => undefined | string;
  }) {
    this.#groupBy = groupBy;
  }
  internalSet(key: string, value: Value) {
    const groupKey = this.#groupBy(key, value);
    if (groupKey) {
      let group = this.#store.get(groupKey);
      if (group === undefined) {
        group = new Map();
        this.#store.set(groupKey, group);
      }
      group.set(key, value);
    }
  }
  internalDelete(key: string) {
    for (const group of this.#store.values()) {
      group.delete(key);
    }
  }
  get(groupKey: string, key: string) {
    this.#store.get(groupKey)?.get(key);
  }
}

export class IndexableStore<Value> {
  #store = new Map<string, Value>();
  indexes = new Set<GroupIndex<Value>>();
  get(key: string) {
    return this.#store.get(key);
  }
  set(key: string, value: Value) {
    for (const index of this.indexes) {
      index.internalSet(key, value);
    }
    this.#store.set(key, value);
  }
  delete(key: string) {
    for (const index of this.indexes) {
      index.internalDelete(key);
    }
    this.#store.delete(key);
  }
}
