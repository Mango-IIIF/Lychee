import type { Region, UserRecord } from './w3c';
import type { Section } from './structures';
import type { Annotation } from './types';

/*
 * The editor's annotations: shapes drawn in Annotorious and the user's
 * annotations about them (or about a canvas, the manifest, a time range) are
 * kept apart, so several annotations can share one shape and moving the shape
 * moves them all. `existing` holds the manifest's own annotations, read-only.
 *
 * Drafts last for the page visit: leaving a manifest and coming back keeps
 * them; reloading clears them. Hosts persist through the export events.
 */
export class AnnotationStore {
  regions = $state.raw<Region[]>([]);
  records = $state.raw<UserRecord[]>([]);
  existing = $state.raw<Annotation[]>([]);
  /** The table of contents the user is writing. */
  sections = $state.raw<Section[]>([]);
  /** The table of contents as it was opened or last saved. */
  savedSections = $state.raw<Section[]>([]);
  /** The manifest's own `structures` have been opened (or the host set them). */
  sectionsLoaded = false;

  /** Opens a table of contents, as the one saved. */
  setSections(sections: Section[]): void {
    this.sections = sections;
    this.savedSections = sections;
    this.sectionsLoaded = true;
  }

  upsertRegion(region: Region): void {
    this.regions = this.regions.some((r) => r.id === region.id)
      ? this.regions.map((r) => (r.id === region.id ? region : r))
      : [...this.regions, region];
  }

  /** Removing a shape removes the annotations about it. */
  removeRegion(id: string): string[] {
    const removed = this.records.filter((r) => r.regionId === id).map((r) => r.id);
    this.regions = this.regions.filter((r) => r.id !== id);
    this.records = this.records.filter((r) => r.regionId !== id);
    return removed;
  }

  saveRecord(record: UserRecord): 'create' | 'update' {
    const exists = this.records.some((r) => r.id === record.id);
    this.records = exists
      ? this.records.map((r) => (r.id === record.id ? record : r))
      : [...this.records, record];
    return exists ? 'update' : 'create';
  }

  removeRecord(id: string): boolean {
    const before = this.records.length;
    this.records = this.records.filter((r) => r.id !== id);
    return this.records.length !== before;
  }

  clear(): void {
    this.regions = [];
    this.records = [];
  }
}

const session = new Map<string, AnnotationStore>();

export const storeFor = (manifestId: string): AnnotationStore => {
  let store = session.get(manifestId);
  if (!store) {
    store = new AnnotationStore();
    session.set(manifestId, store);
  }
  return store;
};
