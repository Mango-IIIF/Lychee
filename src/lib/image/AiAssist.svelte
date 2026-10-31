<script lang="ts">
  import { Sparkles } from '@lucide/svelte';
  import { t } from '../core/i18n';
  import type { AuthorityEntity, AuthorityProvider } from '../authorities/types';
  import AiEntitySuggestion from './AiEntitySuggestion.svelte';
  import { requestSuggestions, type AiRequest, type AiResult, type AiSuggestion } from './ai';

  interface Props {
    endpoint: string;
    languages: string[];
    /** `region` or `image`: what is sent. */
    target: 'region' | 'image';
    buildRequest: () => AiRequest;
    providers: AuthorityProvider[];
    /** Whether a suggestion's value is already in the form. */
    isInForm: (suggestion: AiSuggestion) => boolean;
    linked: AuthorityEntity[];
    onuse: (suggestion: AiSuggestion, model: string) => void;
    onlink: (entity: AuthorityEntity) => void;
  }

  let { endpoint, languages, target, buildRequest, providers, isInForm, linked, onuse, onlink }: Props =
    $props();

  let loading = $state(false);
  let error = $state('');
  let result = $state.raw<AiResult | null>(null);

  const run = async () => {
    loading = true;
    error = '';
    result = null;
    try {
      result = await requestSuggestions(endpoint, buildRequest(), languages);
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      loading = false;
    }
  };

  const providerFor = (authority: string) => providers.find((p) => p.id === authority) ?? providers[0];
  const languageName = (language: string) =>
    new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
</script>

<section class="ai" aria-label={$t('annotate.ai.label')}>
  <button type="button" class="ai__button" onclick={run} disabled={loading}>
    <Sparkles size={16} aria-hidden="true" />
    {loading ? $t('annotate.ai.loading') : $t(`annotate.ai.suggest.${target}`)}
  </button>
  <p class="anno-muted">{$t(`annotate.ai.explain.${target}`)}</p>
  {#if error}
    <p class="anno-error" role="alert">{error}</p>
  {/if}

  {#if result}
    {@const model = result.model}
    <ul class="ai__list">
      {#each result.suggestions as suggestion (suggestion.key)}
        <li>
          <span class="ai__eyebrow">
            {$t(`annotate.ai.fields.${suggestion.field}`)} · {languageName(suggestion.language)}
          </span>
          <p lang={suggestion.language}>{suggestion.value}</p>
          {#if isInForm(suggestion)}
            <span class="anno-muted">{$t('annotate.ai.inForm')}</span>
          {:else}
            <button type="button" onclick={() => onuse(suggestion, model)}>{$t('annotate.ai.use')}</button>
          {/if}
        </li>
      {/each}
      {#each result.entities as entity, index (index)}
        {@const provider = providerFor(entity.authority)}
        {#if provider}
          <AiEntitySuggestion {entity} {provider} {model} {linked} {onlink} />
        {/if}
      {/each}
      <li class="anno-muted">{$t('annotate.ai.suggestedBy', { model })}</li>
    </ul>
  {/if}
</section>

<style>
  .ai {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border-radius: 8px;
    background: var(--anno-tint);
  }

  .ai p {
    margin: 0;
  }

  .ai__button {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 6px;
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--anno-accent);
    border-radius: 6px;
    background: transparent;
    color: var(--anno-accent);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .ai__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 4px 0 0;
    padding: 0;
    list-style: none;
    font-size: 14px;
  }

  .ai__list :global(li) {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ai__list :global(button) {
    align-self: flex-start;
    padding: 4px 10px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 6px;
    background: var(--viewer-panel);
    color: inherit;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  .ai__eyebrow {
    color: var(--viewer-muted);
    font-size: 12px;
    font-weight: 600;
  }
</style>
