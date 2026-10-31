<script lang="ts">
  import { t } from '../core/i18n';
  import type { AuthorityEntity, AuthorityProvider } from '../authorities/types';
  import type { AiEntity } from './ai';

  /** One entity the model named, looked up in its authority so the user can link the right match. */
  interface Props {
    entity: AiEntity;
    provider: AuthorityProvider;
    model: string;
    linked: AuthorityEntity[];
    onlink: (entity: AuthorityEntity) => void;
  }

  let { entity, provider, model, linked, onlink }: Props = $props();

  let matches = $state.raw<AuthorityEntity[]>([]);
  let busy = $state(true);
  let error = $state('');

  $effect(() => {
    const controller = new AbortController();
    busy = true;
    error = '';
    provider
      .search(entity.search_term, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) matches = found.slice(0, 3);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) error = reason instanceof Error ? reason.message : String(reason);
      })
      .finally(() => {
        if (!controller.signal.aborted) busy = false;
      });
    return () => controller.abort();
  });

  const isLinked = (match: AuthorityEntity) => linked.some((selected) => selected.uri === match.uri);
</script>

<li>
  <span class="eyebrow">{entity.kind}: {entity.name}</span>
  {#if entity.evidence}<p class="anno-muted">{entity.evidence}</p>{/if}
  {#if busy}<p class="anno-muted">{$t('annotate.identify.searching', { provider: provider.label })}</p>{/if}
  {#if error}<p class="anno-error">{error}</p>{/if}
  {#each matches as match (match.uri)}
    <button type="button" disabled={isLinked(match)} onclick={() => onlink({ ...match, generator: model })}>
      {isLinked(match) ? $t('annotate.ai.linked') : $t('annotate.ai.link')}
      <strong>{match.label}</strong> <small>{match.id}</small>
    </button>
  {/each}
</li>

<style>
  .eyebrow {
    color: var(--viewer-muted);
    font-size: 12px;
    font-weight: 600;
  }

  p {
    margin: 0;
  }
</style>
