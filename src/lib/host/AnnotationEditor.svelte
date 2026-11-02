<script lang="ts">
  import { untrack } from 'svelte';
  import {
    AnnotationSidebar,
    type AnnotationSidebarCard as Card,
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
  import { annotationText, annotationTitle, motivationsOf, newId, targetSource, timeTarget } from '../annotations/model';
  import { exportAnnotationPage } from '../annotations/export';
  import { storeFor } from '../annotations/store.svelte';
  import { formatTime, timeRange, validateTime } from '../annotations/time';
  import type { Annotation, Scope } from '../annotations/types';
  import { recordFromW3C, toW3C, type ExportContext, type UserRecord } from '../annotations/w3c';
  import AVStage, { type AVPlayback } from '../av/AVStage.svelte';
  import { aiImageUrl, type AiSuggestion } from '../image/ai';
  import AiAssist from '../image/AiAssist.svelte';
  import ImageStage from '../image/ImageStage.svelte';
  import type { Tool } from '../image/annotorious';
  import AnnotationBrowserTable from '../table/AnnotationBrowserTable.svelte';
  import type { TableRow } from '../table/types';
  import EditorShell from './EditorShell.svelte';
  import { isTheme, storedTheme, storeTheme, type Theme } from './themes';
  import SettingsMenu from './ui/SettingsMenu.svelte';
  import ViewerHeader from './ui/ViewerHeader.svelte';

  /**
   * The annotation editor: Mango's viewer as the image stage with Annotorious
   * drawing on it, or @mango-iiif/av for audio and video; the intent-first sidebar; and
   * the browser table underneath.
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

  const resetForm = () => {
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
    });
  });

  const recordOf = (id: string | null | undefined) => store.records.find((r) => r.id === id);

  const onShapeSelect = (id: string | undefined) => {
    shapeId = id;
    if (!id) return;
    scope = 'region';
    regionId = id;
    // Choosing another shape starts a new annotation on it.
    const editing = recordOf(editId);
    if (editing && editing.regionId !== id) resetForm();
  };

  const onRegionDelete = (id: string) => {
    for (const removed of store.removeRegion(id)) emit('annotationDelete', { id: removed });
    if (regionId === id) regionId = undefined;
    if (shapeId === id) shapeId = undefined;
    if (editId && !recordOf(editId)) resetForm();
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

  const buildAnnotation = (
    id: string,
    existing?: UserRecord,
    from: Draft = draft,
  ): Omit<Annotation, 'target'> & { target?: Annotation['target'] } => {
    const now = new Date().toISOString();
    const intent = from.intent ?? 'note';
    const label = labelOf(from, languages);
    const body = bodyValue(bodiesOfDraft(from, languages, bodyContext));
    return {
      id,
      type: 'Annotation',
      motivation: MOTIVATION_OF[intent],
      ...(label ? { label } : {}),
      ...(body ? { body } : {}),
      created: existing?.annotation.created ?? now,
      ...(existing ? { modified: now } : {}),
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
      annotation: buildAnnotation(id, recordOf(editId)),
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
    // One tagging annotation per keyword (IIIF Cookbook recipe 0021); the first replaces the one being edited.
    const drafts = draft.intent === 'tag' ? tagDrafts(draft, languages) : [draft];
    drafts.forEach((one, index) => {
      const previous = index === 0 ? existing : undefined;
      const id = previous?.id ?? newId();
      const record: UserRecord = {
        id,
        scope: kind === 'image' ? scope : 'time',
        canvasId: scope === 'manifest' && kind === 'image' ? undefined : (currentCanvasId ?? undefined),
        regionId: kind === 'image' && scope === 'region' ? region?.id : undefined,
        annotation: buildAnnotation(id, previous, one),
      };
      const action = store.saveRecord(record);
      const annotation = toW3C(record, region, ctx);
      emit(action === 'create' ? 'annotationCreate' : 'annotationUpdate', { annotation });
    });
    // Keep the target, so another annotation on the same shape or moment can follow.
    resetForm();
    end = '';
  };

  const edit = (id: string) => {
    const record = recordOf(id);
    if (!record) return;
    const annotation = userAnnotations.find((a) => a.id === id);
    if (!annotation) return;
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

  const remove = (id: string) => {
    if (!store.removeRecord(id)) return;
    emit('annotationDelete', { id });
    if (editId === id) resetForm();
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

  let cards: Card[] = $derived(
    userAnnotations
      .filter((annotation) => {
        const record = recordOf(annotation.id);
        return record?.scope === 'manifest' || record?.canvasId === currentCanvasId;
      })
      .map((annotation) => {
        const record = recordOf(annotation.id)!;
        return {
          annotation,
          title: annotationTitle(annotation),
          text: annotationText(annotation),
          eyebrow: `${kind === 'image' ? scopeLabel(record) : timeLabel(annotation)} · ${intentLabel(annotation)}`,
          locate: kind === 'image' ? (record.regionId ? 'show' : undefined) : 'jump',
        } satisfies Card;
      }),
  );

  let regionCount = $derived(regionId ? store.records.filter((r) => r.regionId === regionId).length : 0);

  const canvasName = (id: string) => {
    const index = canvases.findIndex((c) => idOf(c) === id);
    return label(canvases[index]?.label, language) || $t('annotate.table.canvasN', { n: index + 1 });
  };

  const whereOf = (annotation: Annotation, record?: UserRecord) => {
    if (kind !== 'image') return timeLabel(annotation);
    const source = targetSource(annotation.target);
    if (record?.scope === 'manifest' || source === canonicalId) return $t('annotate.scope.short.manifest');
    const scopeName = record ? scopeLabel(record) : $t('annotate.scope.short.region');
    return `${scopeName} · ${canvasName(source)}`;
  };

  let rows: TableRow[] = $derived([
    ...userAnnotations.map((annotation) => ({
      id: annotation.id,
      title: annotationTitle(annotation),
      text: annotationText(annotation),
      motivation: intentLabel(annotation),
      where: whereOf(annotation, recordOf(annotation.id)),
      origin: 'mine' as const,
    })),
    ...store.existing
      .filter((annotation) => !annotation.body || annotationText(annotation))
      .map((annotation) => ({
        id: annotation.id,
        title: annotationTitle(annotation),
        text: annotationText(annotation),
        motivation: intentLabel(annotation),
        where: whereOf(annotation),
        origin: 'source' as const,
      })),
  ]);

  let tableOpen = $state(false);

  const setListHostState = (open: boolean): void => {
    const node = root?.getRootNode();
    const host = node instanceof ShadowRoot ? node.host : null;
    if (!host) return;
    if (open) host.setAttribute('data-annotation-list', 'open');
    else host.removeAttribute('data-annotation-list');
  };

  /* ------------------------------------------------------------ export */

  let exportStatus = $state('');

  const handleExport = () => {
    const result = exportAnnotationPage(userAnnotations, { pageId: options.pageId, manifestId: canonicalId });
    emit('exportAnnotationPage', {
      page: result.page,
      publicationValid: result.publicationValid,
      unresolvedIdentities: result.unresolvedIdentities,
      unresolvedPageIdentity: result.unresolvedPageIdentity,
    });
    // The button does something visible even when no host is listening.
    const blob = new Blob([JSON.stringify(result.page, null, 2)], { type: 'application/ld+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'annotations-draft.json';
    link.click();
    URL.revokeObjectURL(url);
    exportStatus = result.publicationValid ? $t('annotate.export.ready') : $t('annotate.export.draft');
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
    <button
      type="button"
      class="annotation-editor__export-btn"
      disabled={!userAnnotations.length}
      onclick={handleExport}
    >
      {$t('annotate.export.button', { count: userAnnotations.length })}
    </button>
    {#if normalisedConfig.showSettings !== false}
      <SettingsMenu {theme} onthemechange={changeTheme} />
    {/if}
  {/snippet}

  <div class="annotation-editor" data-table={tableOpen ? 'open' : 'closed'}>
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
        />
      {:else if manifestEntry?.error}
        <p class="annotation-editor__status" role="alert">{$t('annotate.loadError')}</p>
      {:else}
        <p class="annotation-editor__status" role="status">{$t('annotate.loading')}</p>
      {/if}
    </main>

    {#if kind}
      <AnnotationSidebar
        kind={kind === 'image' ? 'image' : 'av'}
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
        {cards}
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
    {/if}

    <div class="annotation-editor__table">
      <AnnotationBrowserTable
        {rows}
        activeId={editId}
        open={tableOpen}
        ontoggle={() => {
          tableOpen = !tableOpen;
          setListHostState(tableOpen);
        }}
        onselect={({ id }) => (recordOf(id) ? edit(id) : locate(id))}
      />
    </div>
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
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
      'stage sidebar'
      'table table';
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

  .annotation-editor :global(.anno-sidebar) {
    grid-area: sidebar;
  }

  .annotation-editor__table {
    grid-area: table;
    min-height: 0;
  }

  .annotation-editor__status {
    margin: 0;
    padding: 24px;
    color: var(--viewer-muted);
  }

  .annotation-editor__export-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: var(--anno-accent);
    color: var(--anno-on-accent);
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .annotation-editor__export-btn:disabled {
    opacity: 0.5;
    cursor: default;
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
      grid-template-rows: minmax(320px, 55cqh) auto auto;
      grid-template-areas: 'stage' 'sidebar' 'table';
      overflow: auto;
    }

    .annotation-editor :global(.anno-sidebar) {
      height: auto;
      overflow: visible;
      border-left: 0;
      border-top: 1px solid var(--viewer-panel-border);
    }
  }
</style>
