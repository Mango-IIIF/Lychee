<script lang="ts">
  import { X } from '@lucide/svelte';
  import { t } from '../core/i18n';
  import { namesFor, withName } from './names';
  import type { AuthorityEntity, AuthorityProvider, NamedEntity } from './types';

  /**
   * The Identify panel, given to the sidebar as its `identify` snippet: search a reference source,
   * link entities, and set each entity's name in every language. The source only suggests the
   * names (Wikidata may have no Welsh label); what is in the boxes is what is saved.
   */
  interface Props {
    value: AuthorityEntity[];
    onchange: (value: AuthorityEntity[]) => void;
    providers: AuthorityProvider[];
    languages: readonly string[];
  }

  let { value, onchange, providers, languages }: Props = $props();

  let providerId = $state('');
  let query = $state('');
  let results = $state.raw<AuthorityEntity[]>([]);
  let busy = $state(false);
  let error = $state('');

  let provider = $derived(providers.find((p) => p.id === providerId) ?? providers[0]);
  let entities = $derived(value as NamedEntity[]);

  /* Search as the user types, after a short pause. */
  $effect(() => {
    const search = query.trim();
    const source = provider;
    results = [];
    error = '';
    if (!source || search.length < 2) {
      busy = false;
      return;
    }
    const controller = new AbortController();
    busy = true;
    const timer = setTimeout(() => {
      source
        .search(search, controller.signal)
        .then((found) => {
          if (!controller.signal.aborted) results = found;
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted) error = reason instanceof Error ? reason.message : String(reason);
        })
        .finally(() => {
          if (!controller.signal.aborted) busy = false;
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  });

  const isLinked = (entity: AuthorityEntity) => entities.some((e) => e.uri === entity.uri);
  const add = (entity: AuthorityEntity) => {
    onchange([...entities, entity]);
    query = '';
  };
  const removeEntity = (uri: string) => onchange(entities.filter((e) => e.uri !== uri));
  const rename = (entity: NamedEntity, language: string, name: string) =>
    onchange(entities.map((e) => (e.uri === entity.uri ? withName(e, languages, language, name) : e)));

  const languageName = (language: string) =>
    new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
  const providerLabel = (entity: AuthorityEntity) => providers.find((p) => p.id === entity.provider)?.label ?? entity.provider;
</script>

{#if !providers.length}
  <p class="anno-muted">{$t('annotate.identify.none')}</p>
{:else}
  <div class="picker">
    <span class="anno-field-label">{$t('annotate.identify.question')}</span>

    {#if providers.length > 1}
      <label class="anno-field">
        <span class="anno-field-label">{$t('annotate.identify.source')}</span>
        <select class="anno-input" bind:value={providerId}>
          {#each providers as option (option.id)}
            <option value={option.id}>{option.label}</option>
          {/each}
        </select>
      </label>
    {/if}

    <label class="anno-field">
      <span class="anno-field-label">{$t('annotate.identify.search', { provider: provider.label })}</span>
      <input class="anno-input" type="search" bind:value={query} placeholder={$t('annotate.identify.placeholder')} />
    </label>

    {#if busy}<p class="anno-muted">{$t('annotate.identify.searching', { provider: provider.label })}</p>{/if}
    {#if error}<p class="anno-error" role="alert">{error}</p>{/if}
    {#if !busy && !error && query.trim().length >= 2 && !results.length}
      <p class="anno-muted">{$t('annotate.identify.noResults')}</p>
    {/if}

    {#if results.length}
      <ul class="results">
        {#each results as result (result.uri)}
          <li>
            <button type="button" disabled={isLinked(result)} onclick={() => add(result)}>
              <strong>{result.label}</strong>
              <small>{result.id}</small>
              {#if result.description}<span class="anno-muted">{result.description}</span>{/if}
              {#if isLinked(result)}<span class="anno-muted">{$t('annotate.identify.linked')}</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#each entities as entity (entity.uri)}
      {@const names = namesFor(entity, languages)}
      <section class="entity" aria-label={entity.label}>
        <div class="entity__head">
          <a href={entity.uri} target="_blank" rel="noreferrer">{entity.label}</a>
          <small>{providerLabel(entity)} · {entity.id}</small>
          {#if entity.generator}<span class="anno-ai-flag">{$t('annotate.ai.flag')}</span>{/if}
          <button
            type="button"
            class="anno-icon-btn"
            aria-label={$t('annotate.identify.remove', { label: entity.label })}
            onclick={() => removeEntity(entity.uri)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
        {#each languages as language (language)}
          <label class="anno-field">
            <span class="anno-field-label">{$t('annotate.identify.name', { language: languageName(language) })}</span>
            <input
              class="anno-input"
              type="text"
              lang={language}
              value={names[language]}
              oninput={(event) => rename(entity, language, event.currentTarget.value)}
            />
            {#if !names[language]?.trim()}
              <span class="anno-muted">
                {$t('annotate.identify.missing', { provider: providerLabel(entity), language: languageName(language) })}
              </span>
            {/if}
          </label>
        {/each}
      </section>
    {/each}
  </div>
{/if}

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  p {
    margin: 0;
  }

  .results {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .results button {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 6px;
    background: var(--viewer-panel);
    color: inherit;
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }

  .results button:disabled {
    cursor: default;
    opacity: 0.7;
  }

  .entity {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
  }

  .entity__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
  }

  .entity__head a {
    color: inherit;
    font-weight: 600;
  }

  .entity__head small {
    color: var(--viewer-muted);
  }

  .entity__head button {
    margin-left: auto;
  }
</style>
