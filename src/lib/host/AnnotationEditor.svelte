<script lang="ts">
  import { tick, untrack } from 'svelte';
  import {
    AnnotationSidebar,
    type IdentifySnippetContext,
  } from '@mango-iiif/annotation';
  import '@mango-iiif/annotation/style.css';
  import {
    fetchManifest,
    manifestsStore,
    normaliseViewerConfig,
    parseViewerConfig,
    type ViewerCoreInstance,
    type ViewerPlugin,
  } from '@mango-iiif/iiif-viewer/core';
  import { setLocale, t, translate } from '../core/i18n';
  import type { AnnotateConfig } from '../core/types/config';
  import { providersFor } from '../authorities/endpoint';
  import type { AuthorityEntity, NamedEntity } from '../authorities/types';
  import { wikidataLabels } from '../authorities/wikidata';
  import EntityPicker from '../authorities/EntityPicker.svelte';
  import { needsNames, withFetchedNames } from '../authorities/names';
  import {
    MOTIVATION_OF,
    bodiesOfDraft,
    bodyValue,
    draftProblem,
    emptyDraft,
    hasContent,
    intentOf,
    labelOf,
    readAnnotation,
    tagDrafts,
    type BodyContext,
    type Draft,
    type LoadNote,
  } from '../annotations/intents';
  import { canvasScale as scaleOf, canvasesOf, idOf, label, mediaKindOf, metadataOf } from '../annotations/iiif';
  import { normaliseAuthoringLanguages } from '../annotations/languages';
  import { loadExistingAnnotations } from '../annotations/load';
  import {
    annotationText,
    annotationTitle,
    creatorIds,
    creatorName,
    motivationsOf,
    newId,
    targetSource,
    timeTarget,
  } from '../annotations/model';
  import {
    exportAnnotationPage,
    exportStructures,
    normaliseExportKinds,
    type ExportData,
    type ExportKind,
  } from '../annotations/export';
  import { storeFor } from '../annotations/store.svelte';
  import {
    flattenSections,
    readStructures,
    sectionProblems,
    toStructures,
    type Range,
    type Section,
  } from '../annotations/structures';
  import { formatTime, timeRange, validateTime } from '../annotations/time';
  import type { Annotation, Scope } from '../annotations/types';
  import { recordFromW3C, toW3C, type ExportContext, type UserRecord } from '../annotations/w3c';
  import AVStage, { type AVPlayback } from '../av/AVStage.svelte';
  import { aiImageUrl, type AiSuggestion } from '../image/ai';
  import AiAssist from '../image/AiAssist.svelte';
  import ImageStage from '../image/ImageStage.svelte';
  import type { Tool } from '../image/annotorious';
  import ChapterPanel from '../structures/ChapterPanel.svelte';
  import ContentsPanel from '../structures/ContentsPanel.svelte';
  import AnnotationList, { type AnnotationListItem } from './AnnotationList.svelte';
  import EditorShell from './EditorShell.svelte';
  import { isTheme, storedTheme, storeTheme, type Theme } from './themes';
  import ExportMenu from './ui/ExportMenu.svelte';
  import SettingsMenu from './ui/SettingsMenu.svelte';
  import ViewerHeader from './ui/ViewerHeader.svelte';

  /**
   * The annotation editor: Mango's viewer as the image stage with Annotorious
   * drawing on it, or @mango-iiif/av for audio and video; the intent-first sidebar; and
   * the annotations, listed under the form.
   *
   * This component owns the annotations. The viewer only shows the image.
   */
  interface Props {
    manifestId?: string;
    config?: AnnotateConfig | string | undefined;
    /** Plugins for the embedded viewer's stage (images only). */
    plugins?: ViewerPlugin[];
    /** Where editor events are dispatched as DOM events. */
    eventTarget?: EventTarget | null;
  }

  let { manifestId = $bindable(''), config = undefined, plugins = [], eventTarget = null }: Props = $props();

  let normalisedConfig: AnnotateConfig = $derived(
    normaliseViewerConfig(
      parseViewerConfig(config, (error) => {
        console.warn(translate('annotate.warnings.invalidConfig'), error);
      }),
    ) as AnnotateConfig,
  );
  let options = $derived(normalisedConfig.annotations ?? {});
  let languages = $derived(normaliseAuthoringLanguages(options.languages, normalisedConfig.language ?? 'en'));
  let providers = $derived(providersFor(options));

  $effect(() => {
    if (normalisedConfig.language) setLocale(normalisedConfig.language);
  });

  let root: HTMLDivElement | null = $state(null);

  /* The viewer colour: the user's last choice, else the host's config, else dark. */
  let chosenTheme = $state<Theme | null>(storedTheme());
  let theme: Theme = $derived(
    chosenTheme ?? (isTheme(normalisedConfig.theme) ? normalisedConfig.theme : 'dark'),
  );

  const changeTheme = (next: Theme) => {
    chosenTheme = next;
    storeTheme(next);
    emit('themeChange', { theme: next });
  };

  const emit = (event: string, detail: unknown) => {
    (eventTarget ?? root)?.dispatchEvent(new CustomEvent(event, { detail, bubbles: true, composed: true }));
  };

  /* ------------------------------------------------------------ manifest */

  $effect(() => {
    if (manifestId) void fetchManifest(manifestId);
  });

  let manifestEntry = $derived($manifestsStore[manifestId]);
  let manifest = $derived(manifestEntry?.json as Record<string, unknown> | undefined);
  let kind = $derived(options.mediaType ?? (manifest ? mediaKindOf(manifest) : null));
  let canvases = $derived(manifest ? canvasesOf(manifest) : []);
  let store = $derived(storeFor(manifestId));

  /** The manifest's own identifier, which may differ from the URL it was loaded from. */
  let canonicalId = $derived(idOf(manifest) || manifestId);

  let ctx: ExportContext = $derived({
    manifestId: canonicalId,
    canvasScale: Object.fromEntries(canvases.map((canvas) => [idOf(canvas), scaleOf(canvas)])),
  });

  $effect(() => {
    const json = manifest;
    const target = store;
    if (!json) return;
    const controller = new AbortController();
    loadExistingAnnotations(json, controller.signal).then((annotations) => {
      if (!controller.signal.aborted) target.existing = annotations;
    });
    return () => controller.abort();
  });

  let userAnnotations = $derived(
    store.records.map((record) =>
      toW3C(
        record,
        store.regions.find((region) => region.id === record.regionId),
        ctx,
      ),
    ),
  );

  $effect(() => {
    emit('annotationsChange', { annotations: userAnnotations });
  });

  /* ------------------------------------------------------------ form state */

  let draft = $state<Draft>(emptyDraft());
  let language = $state('');
  let editId = $state<string | null>(null);
  /** The manifest annotation being edited, and the region its shape became. Saving makes it the user's. */
  let sourceEdit = $state<{ id: string; regionId?: string } | null>(null);
  /** A manifest annotation to open once its canvas is showing. */
  let pendingSource: string | null = null;
  let error = $state('');

  $effect(() => {
    if (!languages.includes(language)) language = languages[0];
  });

  /* Image */
  let imageStage: ImageStage | null = $state(null);
  let tool = $state<Tool>('select');
  let canvasId = $state<string | null>(null);
  /** The shape selected on the image. */
  let shapeId = $state<string | undefined>(undefined);
  /** The shape the form is about; survives clicking away so you can pan while writing. */
  let regionId = $state<string | undefined>(undefined);
  let scope = $state<Scope>('region');
  /** "Draw a box" draws one box, then returns to selecting. */
  let drawingOnce = false;

  /* Audio / video */
  let avStage: AVStage | null = $state(null);
  let canvasIndex = $state(0);
  let playback = $state<AVPlayback>({ time: 0, duration: 0, ready: false, playing: false, error: false });
  let start = $state('0');
  let end = $state('');

  let avCanvasId = $derived(idOf(canvases[canvasIndex]));
  let currentCanvasId = $derived(kind === 'image' ? canvasId : avCanvasId);
  let region = $derived(store.regions.find((r) => r.id === regionId));
  let regionBounds = $state<{ x: number; y: number; w: number; h: number } | undefined>(undefined);

  $effect(() => {
    void region;
    regionBounds = regionId ? imageStage?.getBounds(regionId) : undefined;
  });

  const sourceOf = (id: string | null | undefined) => store.existing.find((a) => a.id === id);

  /** An unsaved edit of a manifest annotation is dropped: its shape goes back to being the manifest's. */
  const releaseSource = () => {
    const editing = sourceEdit;
    sourceEdit = null;
    if (!editing?.regionId) return;
    store.removeRegion(editing.regionId);
    const annotation = sourceOf(editing.id);
    if (annotation) imageStage?.releaseExisting(annotation, editing.regionId);
    if (regionId === editing.regionId) regionId = undefined;
    if (shapeId === editing.regionId) shapeId = undefined;
  };

  const resetForm = () => {
    releaseSource();
    editId = null;
    draft = emptyDraft();
    error = '';
  };

  /*
   * A message is about what the form was doing: "write something", "draw a shape first", or what
   * saving a loaded annotation would change. Choosing another intent or scope makes it stale, so
   * clear it. edit() records the intent and scope it sets, so its own message stays.
   */
  let messageIntent: Draft['intent'] = null;
  let messageScope: Scope = 'region';
  $effect(() => {
    const intent = draft.intent;
    const current = scope;
    untrack(() => {
      if (intent === messageIntent && current === messageScope) return;
      messageIntent = intent;
      messageScope = current;
      error = '';
    });
  });

  /* A new canvas starts a new annotation, unless it is about the whole item. */
  let lastCanvas: string | null = null;
  $effect(() => {
    const id = currentCanvasId;
    untrack(() => {
      if (id === lastCanvas) return;
      lastCanvas = id;
      shapeId = undefined;
      regionId = undefined;
      if (scope !== 'manifest') resetForm();
      end = '';
      // A manifest annotation chosen on another canvas opens once that canvas's shapes are drawn.
      const next = pendingSource;
      pendingSource = null;
      if (next) requestAnimationFrame(() => editSource(next));
    });
  });

  const recordOf = (id: string | null | undefined) => store.records.find((r) => r.id === id);

  const onShapeSelect = (id: string | undefined) => {
    shapeId = id;
    if (!id) return;
    // One of the manifest's shapes: open it for editing, outside Annotorious's selection handler.
    if (sourceOf(id)) {
      queueMicrotask(() => editSource(id));
      return;
    }
    scope = 'region';
    regionId = id;
    // Choosing another shape starts a new annotation on it.
    const editing = recordOf(editId);
    if ((editing && editing.regionId !== id) || (sourceEdit && sourceEdit.regionId !== id)) resetForm();
  };

  const onRegionDelete = (id: string) => {
    for (const removed of store.removeRegion(id)) emit('annotationDelete', { id: removed });
    if (regionId === id) regionId = undefined;
    if (shapeId === id) shapeId = undefined;
    if (editId && !recordOf(editId) && !sourceEdit) resetForm();
  };

  const drawBox = () => {
    scope = 'region';
    // Redrawing replaces a shape nobody has annotated yet.
    if (regionId && !store.records.some((r) => r.regionId === regionId)) {
      imageStage?.removeRegion(regionId);
      onRegionDelete(regionId);
    }
    regionId = undefined;
    shapeId = undefined;
    drawingOnce = true;
    tool = 'rectangle';
  };

  const onRegionCreate = () => {
    if (!drawingOnce) return;
    drawingOnce = false;
    tool = 'select';
  };

  const deleteShape = () => {
    if (!regionId) return;
    imageStage?.removeRegion(regionId);
    onRegionDelete(regionId);
  };

  /* ------------------------------------------------------------ saving */

  /** A link to one of this item's canvases is written as `{ id, type: 'Canvas', partOf }` (IIIF Cookbook recipe 0022). */
  let bodyContext: BodyContext = $derived({
    manifestOf: (url: string) => (url in ctx.canvasScale ? canonicalId : undefined),
  });

  /** The draft as an annotation. Fields of `previous` the form does not edit are kept. */
  const buildAnnotation = (
    id: string,
    previous?: Partial<Annotation>,
    from: Draft = draft,
  ): Omit<Annotation, 'target'> & { target?: Annotation['target'] } => {
    const now = new Date().toISOString();
    const intent = from.intent ?? 'note';
    const label = labelOf(from, languages);
    const body = bodyValue(bodiesOfDraft(from, languages, bodyContext));
    const { target: _t, label: _l, body: _b, motivation: _m, modified: _mo, ...kept } = previous ?? {};
    const created = previous ? previous.created : now;
    // The user is the creator of what they write; an annotation that already has one keeps it.
    const creator = options.userId && !kept.creator ? { id: options.userId, type: 'Person' } : undefined;
    return {
      ...kept,
      id,
      type: 'Annotation',
      ...(creator ? { creator } : {}),
      motivation: MOTIVATION_OF[intent],
      ...(label ? { label } : {}),
      ...(body ? { body } : {}),
      ...(created ? { created } : {}),
      ...(previous ? { modified: now } : {}),
      ...(kind !== 'image' && avCanvasId ? { target: timeTarget(avCanvasId, start, end) } : {}),
    };
  };

  let preview: Annotation | null = $derived.by(() => {
    if (!options.showJson || !draft.intent) return null;
    const id = editId ?? 'urn:uuid:…';
    const record: UserRecord = {
      id,
      scope: kind === 'image' ? scope : 'time',
      canvasId: currentCanvasId ?? undefined,
      regionId,
      annotation: buildAnnotation(id, recordOf(editId)?.annotation ?? sourceOf(sourceEdit?.id)),
    };
    return toW3C(record, region, ctx);
  });

  const save = () => {
    const problem = draftProblem(draft, languages);
    if (problem) {
      error = $t(`annotate.problems.${problem}`);
      return;
    }
    if (kind === 'image' && scope === 'region' && !region) {
      error = $t('annotate.problems.noRegion');
      return;
    }
    if (kind !== 'image') {
      const timeProblem = validateTime(start, end, playback.duration);
      if (timeProblem) {
        error = $t(`annotate.problems.time.${timeProblem}`);
        return;
      }
    }
    const existing = recordOf(editId);
    const source = sourceOf(sourceEdit?.id);
    // One tagging annotation per keyword (IIIF Cookbook recipe 0021); the first replaces the one being edited.
    const drafts = draft.intent === 'tag' ? tagDrafts(draft, languages) : [draft];
    drafts.forEach((one, index) => {
      const first = index === 0;
      const id = (first && (existing?.id ?? source?.id)) || newId();
      const record: UserRecord = {
        id,
        scope: kind === 'image' ? scope : 'time',
        canvasId: scope === 'manifest' && kind === 'image' ? undefined : (currentCanvasId ?? undefined),
        regionId: kind === 'image' && scope === 'region' ? region?.id : undefined,
        annotation: buildAnnotation(id, first ? (existing?.annotation ?? source) : undefined, one),
      };
      const action = store.saveRecord(record);
      const annotation = toW3C(record, region, ctx);
      emit(action === 'create' && !(first && source) ? 'annotationCreate' : 'annotationUpdate', { annotation });
    });
    if (source) {
      // Updated, the manifest's annotation becomes one of the user's, keeping its id and its new shape.
      sourceEdit = null;
      store.existing = store.existing.filter((a) => a.id !== source.id);
    }
    // Keep the target, so another annotation on the same shape or moment can follow.
    resetForm();
    end = '';
  };

  const edit = (id: string) => {
    const record = recordOf(id);
    if (!record) return;
    const annotation = userAnnotations.find((a) => a.id === id);
    if (!annotation) return;
    if (sourceEdit) resetForm();
    editId = id;
    const read = readAnnotation(annotation, languages, language);
    draft = read.draft;
    // Say what saving from the form would change, rather than changing it silently.
    error = read.notes.length ? describeNotes(read.notes) : '';
    if (kind === 'image') scope = record.scope === 'time' ? 'region' : record.scope;
    // The note above is about this annotation: keep it when the intent and scope change to match.
    messageIntent = draft.intent;
    messageScope = scope;
    if (kind === 'image') {
      if (record.canvasId && record.canvasId !== canvasId) imageStage?.goToCanvas(record.canvasId);
      if (record.regionId) {
        regionId = record.regionId;
        shapeId = record.regionId;
        imageStage?.fitTo(record.regionId);
      }
    } else {
      const range = timeRange(annotation.target);
      if (range) {
        start = String(range.start);
        end = range.end == null ? '' : String(range.end);
      }
    }
  };

  /** Opens one of the manifest's annotations in the form; its shape or time range can then be changed too. */
  const editSource = (id: string) => {
    const annotation = sourceOf(id);
    // Someone else's annotation is theirs to change: it can be read and found, not edited.
    if (!annotation || !canEdit(annotation)) return;
    const { record, region: shape } = recordFromW3C(annotation, ctx);
    const source = record.canvasId;
    if (kind === 'image' && source && source !== canvasId) {
      pendingSource = id;
      imageStage?.goToCanvas(source);
      return;
    }
    if (kind !== 'image' && source && source !== avCanvasId) {
      const index = canvases.findIndex((c) => idOf(c) === source);
      if (index >= 0) {
        pendingSource = id;
        canvasIndex = index;
        return;
      }
    }
    resetForm();
    editId = id;
    sourceEdit = { id, regionId: shape?.id };
    const read = readAnnotation(annotation, languages, language);
    draft = read.draft;
    // Say what saving from the form would change, rather than changing it silently.
    error = read.notes.length ? describeNotes(read.notes) : '';
    if (kind === 'image') scope = record.scope === 'time' ? 'region' : record.scope;
    // The note above is about this annotation: keep it when the intent and scope change to match.
    messageIntent = draft.intent;
    messageScope = scope;
    if (kind === 'image') {
      if (shape) {
        store.upsertRegion(shape);
        imageStage?.adoptExisting(id, shape);
        regionId = shape.id;
        shapeId = shape.id;
        imageStage?.fitTo(shape.id);
      }
    } else {
      const range = timeRange(annotation.target);
      if (range) {
        start = String(range.start);
        end = range.end == null ? '' : String(range.end);
      }
    }
  };

  const remove = (id: string) => {
    if (!store.removeRecord(id)) return;
    emit('annotationDelete', { id });
    if (editId === id) resetForm();
  };

  /** The sidebar's scrolling pane, with the form at its top. */
  let annotatePane: HTMLDivElement | null = $state(null);

  /**
   * Brings the form back into view, so what an Edit opened can be seen. After the form has
   * filled in: WebKit drops a smooth scroll when the layout changes under it.
   */
  const showForm = async () => {
    await tick();
    const pane = annotatePane;
    if (!pane) return;
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = smooth ? 'smooth' : 'auto';
    // Side by side the pane scrolls itself; stacked on a phone it is the editor that scrolls.
    if (pane.scrollHeight > pane.clientHeight) pane.scrollTo({ top: 0, behavior });
    else pane.scrollIntoView({ block: 'nearest', behavior });
  };

  /** Opens an annotation in the form: one of the user's, else one of the manifest's they may edit; else just goes to it. */
  const openAnnotation = (id: string) => {
    sidePanel = 'annotate';
    const source = sourceOf(id);
    if (recordOf(id)) edit(id);
    else if (source && canEdit(source)) editSource(id);
    else return locate(id);
    void showForm();
  };

  const locate = (id: string) => {
    const annotation = [...userAnnotations, ...store.existing].find((a) => a.id === id);
    if (!annotation) return;
    if (kind === 'image') {
      const source = targetSource(annotation.target);
      if (source !== canvasId && source in ctx.canvasScale) imageStage?.goToCanvas(source);
      const target = recordOf(id)?.regionId ?? id;
      shapeId = recordOf(id)?.regionId ?? shapeId;
      // After a canvas change the shapes are drawn on the next frame.
      requestAnimationFrame(() => imageStage?.fitTo(target));
    } else {
      const range = timeRange(annotation.target);
      if (range) avStage?.seek(range.start);
    }
  };

  /* ------------------------------------------------------------ AI */

  let aiTarget = $derived<'region' | 'image'>(scope === 'region' && region ? 'region' : 'image');

  const buildAiRequest = () => {
    const canvas = canvases.find((c) => idOf(c) === canvasId);
    const bounds = aiTarget === 'region' && regionId ? imageStage?.getBounds(regionId) : undefined;
    const { url, cropped } = aiImageUrl(canvas, bounds);
    return {
      imageUrl: url,
      region:
        cropped && bounds
          ? `x=${Math.round(bounds.x)}, y=${Math.round(bounds.y)}, ${Math.round(bounds.w)}×${Math.round(bounds.h)}px`
          : undefined,
      context: {
        title: label(manifest?.label, language),
        canvasLabel: label(canvas?.label, language),
        metadata: metadataOf(manifest),
      },
    };
  };

  /** Switching intent leaves the current one's text unsaved: ask first when there is any. */
  const mayReplace = (intent: Draft['intent']) =>
    !draft.intent ||
    draft.intent === intent ||
    !hasContent(draft, languages) ||
    window.confirm(
      $t('annotate.confirmSwitch', {
        from: $t(`annotate.intents.${draft.intent}.label`),
        to: $t(`annotate.intents.${intent}.label`),
      }),
    );

  const useSuggestion = (suggestion: AiSuggestion, model: string) => {
    if (!mayReplace(suggestion.intent)) return;
    if (draft.intent !== suggestion.intent) draft = { ...emptyDraft(), intent: suggestion.intent };
    draft.texts[suggestion.field][suggestion.language] = suggestion.value;
    draft.generators[`${suggestion.field}.${suggestion.language}`] = model;
    language = suggestion.language;
  };

  const linkSuggested = (entity: AuthorityEntity) => {
    if (!mayReplace('identify')) return;
    if (draft.intent !== 'identify') draft = { ...emptyDraft(), intent: 'identify' };
    draft.entities = [...draft.entities, entity];
  };

  /*
   * A Wikidata entity starts with its Wikidata label in each language (`label: { en, cy }`). They
   * are suggestions: the Identify panel lets the user set or add each name, and a name typed while
   * the labels load is kept.
   */
  $effect(() => {
    const missing = (draft.entities as NamedEntity[]).filter(needsNames);
    if (!missing.length) return;
    const wanted = languages;
    const controller = new AbortController();
    for (const entity of missing) {
      wikidataLabels(entity.id, wanted, controller.signal)
        .catch(() => ({}) as Record<string, string>)
        .then((labels) => {
          if (controller.signal.aborted) return;
          draft.entities = (draft.entities as NamedEntity[]).map((e) => (e.uri === entity.uri ? withFetchedNames(e, labels) : e));
        });
    }
    return () => controller.abort();
  });

  const describeNotes = (notes: LoadNote[]): string =>
    $t('annotate.loadNotes.intro') +
    ' ' +
    notes
      .map((note) => {
        switch (note.kind) {
          case 'motivations':
            return $t('annotate.loadNotes.motivations', { values: note.values.join(', ') });
          case 'bodies':
            return $t('annotate.loadNotes.bodies', { count: note.count });
          case 'joined':
            return $t('annotate.loadNotes.joined');
          case 'language':
            return $t('annotate.loadNotes.language', { from: note.from.join(', '), to: note.to });
        }
      })
      .join(' ');

  /* ------------------------------------------------------------ lists */

  const scopeLabel = (record: UserRecord) => $t(`annotate.scope.short.${record.scope}`);

  const intentLabel = (annotation: Annotation) => {
    const intent = intentOf(annotation);
    return intent ? $t(`annotate.intents.${intent}.label`) : (motivationsOf(annotation)[0] ?? '');
  };

  const timeLabel = (annotation: Annotation) => {
    const range = timeRange(annotation.target);
    if (!range) return $t('annotate.scope.short.manifest');
    return formatTime(range.start) + (range.end != null ? ` – ${formatTime(range.end)}` : '');
  };

  /*
   * The sidebar lists every annotation on what is showing (the page, or the
   * recording, and the whole item), the user's and the item's: recordings in time order.
   * With a user id it is split into Your annotations and All annotations.
   */
  const isMine = (annotation: Annotation) =>
    Boolean(recordOf(annotation.id)) ||
    Boolean(options.userId && creatorIds(annotation).includes(options.userId));

  /**
   * The user's own can be edited, and so can the item's that nobody is named
   * as making. One with someone else as its creator cannot.
   */
  const canEdit = (annotation: Annotation) => isMine(annotation) || annotation.creator == null;

  const hasSelector = (annotation: Annotation) =>
    typeof annotation.target === 'object' && 'selector' in annotation.target && Boolean(annotation.target.selector);

  /** Where on the image: an area, the whole image, or the whole item. */
  const imageScopeLabel = (annotation: Annotation) => {
    const record = recordOf(annotation.id);
    if (record) return scopeLabel(record);
    if (targetSource(annotation.target) === canonicalId) return $t('annotate.scope.short.manifest');
    return $t(`annotate.scope.short.${hasSelector(annotation) ? 'region' : 'canvas'}`);
  };

  let listItems: AnnotationListItem[] = $derived.by(() => {
    const showing = [
      ...userAnnotations,
      ...store.existing.filter((annotation) => !annotation.body || annotationText(annotation)),
    ].filter((annotation) => {
      const source = targetSource(annotation.target);
      return source === currentCanvasId || source === canonicalId;
    });
    if (kind !== 'image') {
      const startOf = (annotation: Annotation) => timeRange(annotation.target)?.start ?? -1;
      showing.sort((a, b) => startOf(a) - startOf(b));
    }
    return showing.map((annotation) => {
      const record = recordOf(annotation.id);
      return {
        id: annotation.id,
        eyebrow: `${kind === 'image' ? imageScopeLabel(annotation) : timeLabel(annotation)} · ${intentLabel(annotation)}`,
        title: annotationTitle(annotation),
        text: annotationText(annotation),
        by: creatorName(annotation),
        mine: isMine(annotation),
        editable: canEdit(annotation),
        deletable: Boolean(record),
        locate:
          kind !== 'image' ? 'jump' : (record ? record.regionId : hasSelector(annotation)) ? 'show' : undefined,
      } satisfies AnnotationListItem;
    });
  });

  let regionCount = $derived(regionId ? store.records.filter((r) => r.regionId === regionId).length : 0);

  /* ------------------------------------------------------------ contents */

  /*
   * The table of contents opens from the manifest's own `structures` and goes
   * back to the host whole, as Ranges, with `structuresSave`: the host stores it
   * and publishes it as the manifest's `structures`. It is not an annotation.
   */
  let contentsEnabled = $derived(options.contents !== false);
  let sidePanel = $state<'annotate' | 'contents'>('annotate');
  let contentsStatus = $state('');
  /** The recording's chapter open in the sidebar. */
  let selectedChapter = $state<string | null>(null);

  $effect(() => {
    if (!contentsEnabled && sidePanel === 'contents') sidePanel = 'annotate';
  });

  $effect(() => {
    const json = manifest;
    const target = store;
    if (!json || target.sectionsLoaded) return;
    untrack(() => target.setSections(readStructures(json.structures)));
  });

  let structures: Range[] = $derived(toStructures(store.sections, languages));
  let savedStructures: Range[] = $derived(toStructures(store.savedSections, languages));
  let contentsCanvases = $derived(
    canvases.map((canvas, index) => ({
      id: idOf(canvas),
      label:
        label(canvas.label, language) ||
        (kind === 'image' ? $t('annotate.table.canvasN', { n: index + 1 }) : $t('annotate.av.recordingN', { n: index + 1 })),
    })),
  );
  let contentsProblems = $derived(
    sectionProblems(store.sections, {
      canvasIds: canvases.map(idOf),
      durations: Object.fromEntries(
        canvases.map((canvas) => [
          idOf(canvas),
          idOf(canvas) === avCanvasId && playback.duration ? playback.duration : Number(canvas.duration) || 0,
        ]),
      ),
    }),
  );
  let contentsDirty = $derived(JSON.stringify(structures) !== JSON.stringify(savedStructures));

  $effect(() => {
    emit('structuresChange', { structures });
  });

  $effect(() => {
    if (contentsDirty) contentsStatus = '';
  });

  /** Hands the host the whole table of contents; an empty one removes it. */
  const saveContents = () => {
    store.savedSections = store.sections;
    emit('structuresSave', { structures, manifestId: canonicalId });
    contentsStatus = $t('annotate.contents.saved');
  };

  /** A recording chosen from the contents is seeked once its player is ready. */
  let pendingSeek = $state<number | null>(null);
  $effect(() => {
    if (pendingSeek == null || !playback.ready) return;
    avStage?.seek(pendingSeek);
    pendingSeek = null;
  });

  const jumpTo = (section: Section) => {
    const first = flattenSections([section])
      .map((entry) => entry.section)
      .find((s) => s.pages.length || s.time);
    if (!first) return;
    if (kind === 'image') {
      if (first.pages[0]) imageStage?.goToCanvas(first.pages[0]);
      return;
    }
    if (!first.time) return;
    const index = canvases.findIndex((canvas) => idOf(canvas) === first.time!.canvasId);
    if (index >= 0 && index !== canvasIndex) {
      pendingSeek = first.time.start;
      canvasIndex = index;
    } else {
      avStage?.seek(first.time.start);
    }
  };

  /* ------------------------------------------------------------ export */

  let exportStatus = $state('');
  let exportKinds = $derived(normaliseExportKinds(options.export));

  /**
   * Hands the host what `include` names, one event per kind, so each can go to
   * its own endpoint: `exportAnnotationPage` for the annotations, then
   * `exportStructures` for the saved table of contents.
   */
  const exportData = (include: ExportKind[]): ExportData => {
    const result: ExportData = {};
    if (include.includes('annotations')) {
      const annotations = exportAnnotationPage(userAnnotations, { pageId: options.pageId, manifestId: canonicalId });
      result.annotations = annotations;
      emit('exportAnnotationPage', {
        page: annotations.page,
        publicationValid: annotations.publicationValid,
        unresolvedIdentities: annotations.unresolvedIdentities,
        unresolvedPageIdentity: annotations.unresolvedPageIdentity,
      });
    }
    if (include.includes('structures')) {
      result.structures = exportStructures(savedStructures);
      emit('exportStructures', result.structures);
    }
    return result;
  };

  const download = (page: unknown, name: string) => {
    const blob = new Blob([JSON.stringify(page, null, 2)], { type: 'application/ld+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  };

  /*
   * One file: the AnnotationPage (it opens again with `setAnnotations`), the
   * table of contents as `{ structures }` (with `setStructures`), or both as
   * `{ annotations, structures }`.
   */
  const handleExport = (include: ExportKind[]) => {
    const result = exportData(include);
    const structuresOut = { structures: result.structures?.structures ?? [] };
    // The button does something visible even when no host is listening.
    if (result.annotations && result.structures) {
      download({ annotations: result.annotations.page, ...structuresOut }, 'annotations-and-contents-draft.json');
    } else if (result.annotations) {
      download(result.annotations.page, 'annotations-draft.json');
    } else {
      download(structuresOut, 'contents-draft.json');
    }
    const valid = [result.annotations, result.structures].every((part) => !part || part.publicationValid);
    exportStatus = valid ? $t('annotate.export.ready') : $t('annotate.export.draft');
  };

  /* ------------------------------------------------------------ API */

  /** The embedded viewer, for pan, zoom and canvas control. Null for audio and video. */
  export function getViewer(): ViewerCoreInstance | null {
    return imageStage?.getViewer() ?? null;
  }

  /** The current canvas's annotations: the manifest's and the user's own. */
  export function getAnnotations(): Annotation[] {
    const id = currentCanvasId;
    return [...store.existing, ...userAnnotations].filter((a) => {
      const source = targetSource(a.target);
      return source === id || source === canonicalId;
    });
  }

  /** Every annotation the user has made, across all canvases. */
  export function getUserAnnotations(): Annotation[] {
    return userAnnotations;
  }

  /** The table of contents being written, as IIIF Ranges for the manifest's `structures`. */
  export function getStructures(): Range[] {
    return structures;
  }

  /**
   * Opens a table of contents as the saved one, replacing what is being written:
   * what the host stored, or its canonical form after `structuresSave`.
   */
  export function setStructures(ranges: unknown[]): void {
    store.setSections(readStructures(ranges));
    selectedChapter = null;
    contentsStatus = '';
  }

  /**
   * Sends the host what `include` names, as the download does but without the
   * file: `exportAnnotationPage` and/or `exportStructures`. Defaults to the kinds the config allows.
   */
  export function exportToHost(include: ExportKind[] = exportKinds): ExportData {
    return exportData(normaliseExportKinds(include).filter((kind) => exportKinds.includes(kind)));
  }

  const importAnnotation = (annotation: Annotation) => {
    const { record, region } = recordFromW3C(annotation, ctx);
    if (region) store.upsertRegion(region);
    store.saveRecord(record);
  };

  export function addAnnotation(annotation: Annotation): void {
    importAnnotation(annotation);
  }

  /** Replaces the user's annotations. */
  export function setAnnotations(annotations: Annotation[]): void {
    store.clear();
    resetForm();
    annotations.forEach(importAnnotation);
  }

  export function removeAnnotation(id: string): void {
    const record = recordOf(id);
    remove(id);
    // A shape imported with the annotation goes with it.
    if (record?.regionId && !store.records.some((r) => r.regionId === record.regionId)) {
      imageStage?.removeRegion(record.regionId);
      store.removeRegion(record.regionId);
    }
  }
</script>

<EditorShell {theme} bind:root>
  {#snippet title()}
    <ViewerHeader {manifestId} {manifestEntry} />
  {/snippet}

  {#snippet actions()}
    {#if exportStatus}
      <span class="annotation-editor__export-status" role="status">{exportStatus}</span>
    {/if}
    <ExportMenu
      kinds={exportKinds}
      annotationCount={userAnnotations.length}
      hasStructures={savedStructures.length > 0}
      structuresUnsaved={contentsDirty}
      onexport={handleExport}
    />
    {#if normalisedConfig.showSettings !== false}
      <SettingsMenu {theme} onthemechange={changeTheme} />
    {/if}
  {/snippet}

  <div class="annotation-editor">
    <main class="annotation-editor__stage" aria-label={$t('annotate.stage')}>
      {#if kind === 'image'}
        <ImageStage
          bind:this={imageStage}
          bind:manifestId
          bind:tool
          bind:canvasId
          config={normalisedConfig}
          {plugins}
          {store}
          canvasScale={ctx.canvasScale}
          annotatedIds={store.records.flatMap((r) => (r.regionId ? [r.regionId] : []))}
          annotatedCanvasIds={store.records.flatMap((r) => (r.canvasId ? [r.canvasId] : []))}
          selectedRegionId={shapeId}
          onselect={onShapeSelect}
          onregioncreate={onRegionCreate}
          onregiondelete={onRegionDelete}
          eventTarget={eventTarget ?? root}
          {theme}
        />
      {:else if kind && manifest}
        <AVStage
          bind:this={avStage}
          bind:canvasIndex
          bind:playback
          {manifest}
          language={normalisedConfig.language}
          chapters={!contentsEnabled}
        />
      {:else if manifestEntry?.error}
        <p class="annotation-editor__status" role="alert">{$t('annotate.loadError')}</p>
      {:else}
        <p class="annotation-editor__status" role="status">{$t('annotate.loading')}</p>
      {/if}
    </main>

    {#if kind}
      <div class="annotation-editor__side" class:annotation-editor__side--tabs={contentsEnabled}>
      {#if contentsEnabled}
        <div class="annotation-editor__tabs" role="tablist" aria-label={$t('annotate.contents.panels')}>
          <button
            type="button"
            role="tab"
            aria-selected={sidePanel === 'annotate'}
            class:active={sidePanel === 'annotate'}
            onclick={() => (sidePanel = 'annotate')}>{$t('annotate.sidebar.label')}</button
          >
          <button
            type="button"
            role="tab"
            aria-selected={sidePanel === 'contents'}
            class:active={sidePanel === 'contents'}
            onclick={() => (sidePanel = 'contents')}>{$t('annotate.contents.label')}</button
          >
        </div>
      {/if}
      {#if sidePanel === 'contents'}
        <div class="annotation-editor__contents">
          {#if kind === 'image'}
            <ContentsPanel
              {languages}
              bind:language
              sections={store.sections}
              canvases={contentsCanvases}
              {currentCanvasId}
              problems={contentsProblems}
              dirty={contentsDirty}
              status={contentsStatus}
              onchange={(next) => (store.sections = next)}
              onjump={jumpTo}
              onsave={saveContents}
            />
          {:else}
            <ChapterPanel
              {languages}
              bind:language
              bind:selectedId={selectedChapter}
              sections={store.sections}
              canvases={contentsCanvases}
              {currentCanvasId}
              currentTime={playback.time}
              playbackReady={playback.ready}
              problems={contentsProblems}
              dirty={contentsDirty}
              status={contentsStatus}
              onchange={(next) => (store.sections = next)}
              onplay={jumpTo}
              onsave={saveContents}
            />
          {/if}
        </div>
      {:else}
      <div class="annotation-editor__annotate" bind:this={annotatePane}>
      <AnnotationSidebar
        kind={kind === 'image' ? 'image' : 'av'}
        visibility={{ annotations: false }}
        {languages}
        bind:draft
        bind:language
        bind:scope
        bind:start
        bind:end
        region={scope === 'region' ? regionBounds : undefined}
        {regionCount}
        drawing={tool !== 'select'}
        currentTime={playback.time}
        playbackReady={playback.ready}
        editing={Boolean(editId)}
        {error}
        {providers}
        {preview}
        cards={[]}
        selectedId={editId}
        ondrawbox={drawBox}
        ondeleteshape={deleteShape}
        onsave={save}
        oncancel={resetForm}
        onedit={edit}
        ondelete={remove}
        onlocate={locate}
      >
        {#snippet identify({ value, onchange, providers: sources }: IdentifySnippetContext)}
          <EntityPicker {value} {onchange} providers={sources} {languages} />
        {/snippet}
        {#snippet assist()}
          {#if options.ai?.endpoint}
            <AiAssist
              endpoint={options.ai.endpoint}
              {languages}
              target={aiTarget}
              buildRequest={buildAiRequest}
              {providers}
              linked={draft.entities}
              isInForm={(s) => draft.texts[s.field][s.language] === s.value}
              onuse={useSuggestion}
              onlink={linkSuggested}
            />
          {/if}
        {/snippet}
      </AnnotationSidebar>
      <AnnotationList
        items={listItems}
        kind={kind === 'image' ? 'image' : 'av'}
        split={Boolean(options.userId)}
        selectedId={editId}
        onlocate={locate}
        onedit={openAnnotation}
        ondelete={remove}
      />
      </div>
      {/if}
      </div>
    {/if}
  </div>
</EditorShell>

<style>
  /*
   * The editor's own palette, one per Mango theme, so the sidebar, list and page
   * strip change with the viewer around them. Surfaces come from the theme's
   * `--viewer-*` tokens; each theme picks an accent dark or light enough for its
   * label colour (`--anno-on-accent`) to read on it. Light is ui-test's green.
   */
  :global(.viewer--annotation-editor) {
    --anno-accent: #2ac7ff;
    --anno-on-accent: #06141d;
    --anno-surface: var(--viewer-panel);
    --anno-raised: var(--viewer-panel-strong);
    --anno-tint: color-mix(in srgb, var(--anno-accent) 12%, var(--anno-surface));
    --anno-input-border: color-mix(in srgb, var(--viewer-text) 28%, transparent);
    --anno-dashed: color-mix(in srgb, var(--anno-accent) 60%, transparent);
    --anno-code-bg: rgba(0, 0, 0, 0.35);
    --anno-code-text: var(--viewer-text);
  }

  :global(.viewer--annotation-editor[data-theme='midnight']) {
    --anno-accent: #a78bfa;
    --anno-on-accent: #120b2b;
  }

  :global(.viewer--annotation-editor[data-theme='light']) {
    --anno-accent: #1f5c4f;
    --anno-on-accent: #ffffff;
    --anno-surface: #ffffff;
    --anno-raised: #ffffff;
    --anno-tint: #eef3f0;
    --anno-input-border: #b9c3be;
    --anno-dashed: #8fa39a;
    --anno-code-bg: #1b2420;
    --anno-code-text: #dfe9e3;
  }

  :global(.viewer--annotation-editor[data-theme='sepia']) {
    --anno-accent: #8d451f;
    --anno-on-accent: #fffaf0;
    --anno-surface: var(--viewer-surface);
    --anno-raised: #fffaf0;
    --anno-input-border: rgba(76, 58, 35, 0.32);
    --anno-code-bg: #3d3023;
    --anno-code-text: #f7f0e3;
  }

  :global(.viewer--annotation-editor[data-theme='ringo']) {
    --anno-accent: #a8232b;
    --anno-on-accent: #fff4b8;
    --anno-surface: var(--viewer-surface);
    --anno-raised: #fffbe0;
    --anno-input-border: rgba(74, 48, 0, 0.36);
    --anno-code-bg: #2e2000;
    --anno-code-text: #fff4b8;
  }

  .annotation-editor {
    --mango-viewer-av-player-max-width: calc((100cqh - 24px) * 16 / 9);

    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 400px);
    grid-template-rows: minmax(0, 1fr);
    grid-template-areas: 'stage sidebar';
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .annotation-editor__stage {
    grid-area: stage;
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  /* Annotate and Contents share the sidebar, one at a time. */
  .annotation-editor__side {
    grid-area: sidebar;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
  }

  .annotation-editor__side--tabs {
    grid-template-rows: auto minmax(0, 1fr);
  }

  /* The form and the list under it scroll together. */
  .annotation-editor__annotate {
    min-height: 0;
    overflow: auto;
    border-left: 1px solid var(--viewer-panel-border);
    background: var(--anno-surface);
  }

  .annotation-editor__annotate :global(.anno-sidebar) {
    height: auto;
    overflow: visible;
    border-left: 0;
  }

  .annotation-editor__tabs {
    display: flex;
    gap: 4px;
    padding: 10px 20px 0;
    border-left: 1px solid var(--viewer-panel-border);
    border-bottom: 1px solid var(--viewer-panel-border);
    background: var(--anno-surface);
  }

  .annotation-editor__tabs button {
    margin-bottom: -1px;
    padding: 8px 12px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--viewer-muted);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .annotation-editor__tabs button.active {
    border-bottom-color: var(--anno-accent);
    color: var(--viewer-text);
  }

  .annotation-editor__contents {
    box-sizing: border-box;
    min-height: 0;
    padding: 20px;
    overflow: auto;
    border-left: 1px solid var(--viewer-panel-border);
    background: var(--anno-surface);
  }

  .annotation-editor__status {
    margin: 0;
    padding: 24px;
    color: var(--viewer-muted);
  }

  .annotation-editor__export-status {
    max-width: 34ch;
    color: var(--viewer-muted, #9aa6b2);
    font-size: 11px;
    line-height: 1.3;
  }

  /* Narrow: the stage, then the form, then the list, in one scrolling column. */
  @container mango-viewer (max-width: 860px) {
    .annotation-editor {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(320px, 55cqh) auto;
      grid-template-areas: 'stage' 'sidebar';
      overflow: auto;
    }

    .annotation-editor__annotate {
      overflow: visible;
      border-left: 0;
    }

    .annotation-editor :global(.anno-sidebar),
    .annotation-editor__contents {
      height: auto;
      overflow: visible;
      border-left: 0;
    }

    .annotation-editor__tabs {
      border-left: 0;
      border-top: 1px solid var(--viewer-panel-border);
    }
  }
</style>
