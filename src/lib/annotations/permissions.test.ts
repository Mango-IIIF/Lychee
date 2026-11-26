import { describe, expect, it } from 'vitest';
import type { Annotation } from '@mango-iiif/annotation';
import { resolveAnnotationPolicy } from './permissions';

const JANE = 'https://example.org/users/jane';
const RHYS = 'https://example.org/users/rhys';
const ADMIN = 'https://example.org/users/admin';

const makeAnnotation = (id: string, creator?: Annotation['creator']): Annotation => ({
  id,
  type: 'Annotation',
  motivation: 'commenting',
  target: 'https://example.org/canvas/1',
  ...(creator !== undefined ? { creator } : {}),
});

const ownManifest = makeAnnotation('a-own', { id: JANE, type: 'Person', name: 'Jane' });
const otherManifest = makeAnnotation('a-other', { id: RHYS, type: 'Person', name: 'Rhys' });
const multiCreator = makeAnnotation('a-multi', [RHYS, { id: JANE, type: 'Person' }]);
const unattributed = makeAnnotation('a-none');
const emptyCreators = makeAnnotation('a-empty', []);
const sessionDraft = makeAnnotation('a-draft', { id: JANE, type: 'Person' });

describe('resolveAnnotationPolicy', () => {
  describe('legacy defaults (permissions omitted)', () => {
    it('edits own and unattributed annotations, deletes session records only', () => {
      const policy = resolveAnnotationPolicy({ userId: JANE });

      expect(policy.visibility).toBe('all');
      expect(policy.isMine(ownManifest, false)).toBe(true);
      expect(policy.isMine(multiCreator, false)).toBe(true);
      expect(policy.isMine(otherManifest, false)).toBe(false);
      expect(policy.isMine(unattributed, false)).toBe(false);
      expect(policy.isMine(sessionDraft, true)).toBe(true);

      expect(policy.canEdit(ownManifest, false)).toBe(true);
      expect(policy.canEdit(unattributed, false)).toBe(true);
      expect(policy.canEdit(emptyCreators, false)).toBe(true);
      expect(policy.canEdit(otherManifest, false)).toBe(false);

      expect(policy.canDelete(sessionDraft, true)).toBe(true);
      expect(policy.canDelete(ownManifest, false)).toBe(false);
      expect(policy.canDelete(otherManifest, false)).toBe(false);
    });

    it('treats signed-out users as owning only session records', () => {
      const policy = resolveAnnotationPolicy({});

      expect(policy.userId).toBeUndefined();
      expect(policy.canEdit(sessionDraft, true)).toBe(true);
      expect(policy.canEdit(unattributed, false)).toBe(true);
      expect(policy.canEdit(ownManifest, false)).toBe(false);
      expect(policy.canDelete(sessionDraft, true)).toBe(true);
      expect(policy.canDelete(unattributed, false)).toBe(false);
    });
  });

  describe('admin / content owner', () => {
    it('allows editing and deleting all annotations when edit is "all"', () => {
      const policy = resolveAnnotationPolicy({
        userId: ADMIN,
        permissions: { edit: 'all' },
      });

      expect(policy.edit).toBe('all');
      expect(policy.delete).toBe('all');

      for (const a of [ownManifest, otherManifest, unattributed, sessionDraft]) {
        expect(policy.canEdit(a, a === sessionDraft)).toBe(true);
        expect(policy.canDelete(a, a === sessionDraft)).toBe(true);
        expect(policy.isVisible(a, a === sessionDraft)).toBe(true);
      }
    });
  });

  describe('volunteer', () => {
    it('restricts editing and deleting strictly to own annotations (not unattributed)', () => {
      const policy = resolveAnnotationPolicy({
        userId: JANE,
        permissions: { edit: 'own', delete: 'own' },
      });

      expect(policy.editUnattributed).toBe(false);

      expect(policy.canEdit(ownManifest, false)).toBe(true);
      expect(policy.canEdit(multiCreator, false)).toBe(true);
      expect(policy.canEdit(sessionDraft, true)).toBe(true);
      expect(policy.canEdit(otherManifest, false)).toBe(false);
      expect(policy.canEdit(unattributed, false)).toBe(false);
      expect(policy.canEdit(emptyCreators, false)).toBe(false);

      expect(policy.canDelete(ownManifest, false)).toBe(true);
      expect(policy.canDelete(sessionDraft, true)).toBe(true);
      expect(policy.canDelete(otherManifest, false)).toBe(false);
      expect(policy.canDelete(unattributed, false)).toBe(false);
    });

    it('allows editing unattributed annotations when editUnattributed is opted in', () => {
      const policy = resolveAnnotationPolicy({
        userId: JANE,
        permissions: { edit: 'own', editUnattributed: true },
      });

      expect(policy.canEdit(unattributed, false)).toBe(true);
      expect(policy.canDelete(unattributed, false)).toBe(true);
      expect(policy.canEdit(otherManifest, false)).toBe(false);
    });
  });

  describe('granular edit / delete splits', () => {
    it('supports moderator mode: edit all, delete own only', () => {
      const policy = resolveAnnotationPolicy({
        userId: JANE,
        permissions: { edit: 'all', delete: 'own' },
      });

      expect(policy.canEdit(otherManifest, false)).toBe(true);
      expect(policy.canEdit(unattributed, false)).toBe(true);
      expect(policy.canDelete(otherManifest, false)).toBe(false);
      expect(policy.canDelete(unattributed, false)).toBe(false);
      expect(policy.canDelete(ownManifest, false)).toBe(true);
      expect(policy.canDelete(sessionDraft, true)).toBe(true);
    });

    it('supports no-delete mode: edit own, delete none', () => {
      const policy = resolveAnnotationPolicy({
        userId: JANE,
        permissions: { edit: 'own', delete: 'none' },
      });

      expect(policy.canEdit(ownManifest, false)).toBe(true);
      expect(policy.canDelete(ownManifest, false)).toBe(false);
      expect(policy.canDelete(sessionDraft, true)).toBe(false);
    });

    it('supports read-only mode: edit none, delete defaults to none', () => {
      const policy = resolveAnnotationPolicy({
        userId: JANE,
        permissions: { edit: 'none' },
      });

      expect(policy.delete).toBe('none');
      expect(policy.canEdit(ownManifest, false)).toBe(false);
      expect(policy.canEdit(sessionDraft, true)).toBe(false);
      expect(policy.canDelete(sessionDraft, true)).toBe(false);
    });
  });

  describe('visibility', () => {
    it('hides other users and unattributed annotations when visibility is "own"', () => {
      const policy = resolveAnnotationPolicy({
        userId: JANE,
        permissions: { edit: 'own' },
        visibility: 'own',
      });

      expect(policy.isVisible(ownManifest, false)).toBe(true);
      expect(policy.isVisible(multiCreator, false)).toBe(true);
      expect(policy.isVisible(sessionDraft, true)).toBe(true);
      expect(policy.isVisible(otherManifest, false)).toBe(false);
      expect(policy.isVisible(unattributed, false)).toBe(false);
    });

    it('fails closed when visibility is "own" without userId', () => {
      const policy = resolveAnnotationPolicy({ visibility: 'own' });

      expect(policy.isVisible(sessionDraft, true)).toBe(true);
      expect(policy.isVisible(ownManifest, false)).toBe(false);
      expect(policy.isVisible(unattributed, false)).toBe(false);
    });
  });

  it('ignores invalid scope values and falls back safely', () => {
    const policy = resolveAnnotationPolicy({
      userId: '  ',
      permissions: { edit: 'superuser' as never, delete: 'bogus' as never },
    });

    expect(policy.userId).toBeUndefined();
    expect(policy.edit).toBe('own');
    expect(policy.delete).toBe('own');
  });
});
