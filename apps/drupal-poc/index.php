<?php
declare(strict_types=1);

require_once __DIR__ . '/lib/drupal_mock.php';

$roles = drupal_poc_roles();
$nodes = drupal_poc_nodes();

$roleKey = isset($_GET['role']) && isset($roles[$_GET['role']]) ? (string) $_GET['role'] : 'volunteer';
$itemKey = isset($_GET['item']) && isset($nodes[$_GET['item']]) ? (string) $_GET['item'] : 'constabulary';
$mode = (isset($_GET['mode']) && $_GET['mode'] === 'node') ? 'node' : 'annotate';

$role = $roles[$roleKey];
$node = $nodes[$itemKey];
$csrf = drupal_poc_csrf_token();
$manifestUrl = drupal_poc_base_url() . $node['manifest'];

$editorConfig = [
    'theme' => 'light',
    'language' => 'en',
    'annotations' => [
        'languages' => ['en', 'cy'],
        'mediaType' => $node['type'],
        'userId' => $role['userId'],
        'userName' => $role['userName'],
        'permissions' => $role['permissions'],
        'visibility' => $role['visibility'],
        'showExport' => false, // Drupal owns the Save / Submit button.
        'contents' => true,
    ],
];

$buildUrl = static function (array $overrides) use ($roleKey, $itemKey, $mode): string {
    $params = array_merge(['mode' => $mode, 'role' => $roleKey, 'item' => $itemKey], $overrides);
    return '/?' . http_build_query($params);
};
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Fake Drupal — <?= h($node['title']) ?></title>
    <link rel="stylesheet" href="/drupal-poc.css" />
  </head>
  <body>
    <header class="drupal-toolbar">
      <div class="drupal-toolbar__brand">
        <span>Drupal 10/11 Mock</span>
        <span class="drupal-toolbar__badge">Changeset POC</span>
        <span style="color:#cbd5e1;font-weight:400;">Node #<?= (int) $node['nid'] ?></span>
      </div>
      <div class="drupal-toolbar__controls">
        <label>
          Role
          <select id="role-select">
            <?php foreach ($roles as $key => $r): ?>
              <option value="<?= h($key) ?>" <?= $key === $roleKey ? 'selected' : '' ?>><?= h($r['label']) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
        <label>
          Item
          <select id="item-select">
            <?php foreach ($nodes as $key => $n): ?>
              <option value="<?= h($key) ?>" <?= $key === $itemKey ? 'selected' : '' ?>><?= h($n['title']) ?></option>
            <?php endforeach; ?>
          </select>
        </label>
      </div>
    </header>

    <div class="drupal-header">
      <div class="drupal-header__inner">
        <div class="drupal-breadcrumbs">
          <a href="<?= h($buildUrl([])) ?>">Content</a> /
          Node #<?= (int) $node['nid'] ?> /
          <?= $mode === 'node' ? 'Edit' : 'Annotate' ?>
        </div>
        <h1 class="drupal-title"><?= h($node['title']) ?></h1>
        <nav class="drupal-tabs" aria-label="Drupal primary tabs">
          <a class="drupal-tab <?= $mode === 'annotate' ? 'is-active' : '' ?>" href="<?= h($buildUrl(['mode' => 'annotate'])) ?>">
            Annotate (AJAX POST → Thank You)
          </a>
          <a class="drupal-tab <?= $mode === 'node' ? 'is-active' : '' ?>" href="<?= h($buildUrl(['mode' => 'node'])) ?>">
            Edit Node Form (Hidden Field POST → Output)
          </a>
        </nav>
      </div>
    </div>

    <main class="drupal-main">
      <div id="error-banner" class="alert alert--error" hidden></div>

      <?php if ($mode === 'node'): ?>
        <form id="drupal-node-form" method="POST" action="/save.php">
          <input type="hidden" name="_csrf_token" value="<?= h($csrf) ?>" />
          <input type="hidden" name="submit_mode" value="node" />
          <input type="hidden" name="role" value="<?= h($roleKey) ?>" />
          <input type="hidden" name="item" value="<?= h($itemKey) ?>" />
          <input type="hidden" name="changeset_json" id="changeset-input" value="" />

          <section class="card">
            <div class="node-fields">
              <div class="field">
                <label for="node-title">Node Title</label>
                <input id="node-title" name="node_title" type="text" value="<?= h($node['title']) ?>" required />
              </div>
              <div class="field">
                <label for="node-summary">Revision Log / Summary</label>
                <textarea id="node-summary" name="node_summary"><?= h($node['summary']) ?></textarea>
              </div>
            </div>
          </section>

          <section class="card save-bar">
            <div class="save-bar__pills" id="changeset-pills">
              <span class="pill">No annotation changes yet</span>
            </div>
            <div class="save-bar__actions">
              <button type="submit" id="save-btn" class="btn btn--primary">Save Node &amp; Annotations</button>
            </div>
          </section>
        </form>
      <?php else: ?>
        <section class="card save-bar">
          <div class="save-bar__pills" id="changeset-pills">
            <span class="pill">No annotation changes yet</span>
          </div>
          <div class="save-bar__actions">
            <button type="button" id="save-btn" class="btn btn--primary" disabled>Submit Annotations to Drupal</button>
          </div>
        </section>
      <?php endif; ?>

      <section class="editor-frame">
        <mango-annotation-editor id="lychee-editor"></mango-annotation-editor>
      </section>

      <details class="json-drawer">
        <summary>Live Changeset JSON Preview (what will be POSTed to Drupal)</summary>
        <pre class="json-block" id="live-json">{}</pre>
      </details>
    </main>

    <script type="module" src="/dist/mango-annotation-editor.js"></script>
    <script type="module">
      const MODE = <?= json_encode($mode) ?>;
      const ROLE_KEY = <?= json_encode($roleKey) ?>;
      const ITEM_KEY = <?= json_encode($itemKey) ?>;
      const CSRF_TOKEN = <?= json_encode($csrf) ?>;
      const MANIFEST_URL = <?= json_encode($manifestUrl) ?>;
      const EDITOR_CONFIG = <?= json_encode($editorConfig, JSON_UNESCAPED_SLASHES) ?>;

      const editor = document.getElementById('lychee-editor');
      const pillsEl = document.getElementById('changeset-pills');
      const liveJsonEl = document.getElementById('live-json');
      const saveBtn = document.getElementById('save-btn');
      const errorBanner = document.getElementById('error-banner');
      const nodeForm = document.getElementById('drupal-node-form');
      const changesetInput = document.getElementById('changeset-input');

      let latestChangeset = {
        manifestId: MANIFEST_URL,
        created: [],
        updated: [],
        deleted: [],
        structuresChanged: false,
        hasChanges: false,
      };
      let isSubmitting = false;

      // Switch role or item via query params
      for (const [id, param] of [['role-select', 'role'], ['item-select', 'item']]) {
        document.getElementById(id).addEventListener('change', (e) => {
          const url = new URL(window.location.href);
          url.searchParams.set(param, e.target.value);
          window.location.href = url.toString();
        });
      }

      function renderChangesetState(cs) {
        latestChangeset = cs;
        liveJsonEl.textContent = JSON.stringify(cs, null, 2);
        if (changesetInput) {
          changesetInput.value = JSON.stringify(cs);
        }

        const pills = [];
        if (cs.created.length > 0) {
          pills.push(`<span class="pill pill--created">+${cs.created.length} created</span>`);
        }
        if (cs.updated.length > 0) {
          pills.push(`<span class="pill pill--updated">~${cs.updated.length} updated</span>`);
        }
        if (cs.deleted.length > 0) {
          pills.push(`<span class="pill pill--deleted">-${cs.deleted.length} deleted</span>`);
        }
        if (cs.structuresChanged) {
          pills.push(`<span class="pill pill--updated">Contents updated</span>`);
        }
        if (pills.length === 0) {
          pills.push('<span class="pill">No annotation changes yet</span>');
        }
        pillsEl.innerHTML = pills.join('');

        if (MODE === 'annotate') {
          saveBtn.disabled = isSubmitting || !cs.hasChanges;
        }
      }

      // Mount Lychee editor
      editor.config = JSON.stringify(EDITOR_CONFIG);
      editor.manifestId = MANIFEST_URL;

      editor.addEventListener('changesetChange', (event) => {
        renderChangesetState(event.detail);
      });

      // Warn before navigating away with unsaved changes
      window.addEventListener('beforeunload', (event) => {
        if (isSubmitting) return;
        const unsaved = latestChangeset.hasChanges || (typeof editor.hasUnsavedDraft === 'function' && editor.hasUnsavedDraft());
        if (unsaved) {
          event.preventDefault();
          event.returnValue = '';
        }
      });

      function confirmUncommittedDraft() {
        if (typeof editor.hasUnsavedDraft === 'function' && editor.hasUnsavedDraft()) {
          return window.confirm(
            'You have uncommitted text in the sidebar form (or unsaved Contents changes) that has not been saved yet. Submit without it?'
          );
        }
        return true;
      }

      if (MODE === 'node' && nodeForm) {
        nodeForm.addEventListener('submit', (event) => {
          if (!confirmUncommittedDraft()) {
            event.preventDefault();
            return;
          }
          const cs = typeof editor.getChangeset === 'function' ? editor.getChangeset() : latestChangeset;
          changesetInput.value = JSON.stringify(cs);
          isSubmitting = true;
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving Node…';
        });
      } else {
        saveBtn.addEventListener('click', async () => {
          if (!confirmUncommittedDraft()) return;
          errorBanner.hidden = true;
          const cs = typeof editor.getChangeset === 'function' ? editor.getChangeset() : latestChangeset;
          if (!cs.hasChanges) return;

          isSubmitting = true;
          saveBtn.disabled = true;
          saveBtn.textContent = 'Submitting to Drupal…';

          try {
            const response = await fetch('/save.php', {
              method: 'POST',
              credentials: 'same-origin',
              headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': CSRF_TOKEN,
              },
              body: JSON.stringify({
                role: ROLE_KEY,
                item: ITEM_KEY,
                changeset: cs,
              }),
            });
            const data = await response.json();
            if (!response.ok || !data.ok) {
              const messages = (data.errors ?? [{ message: data.error || 'Submission failed.' }])
                .map((e) => `${e.scope ? `[${e.scope}] ` : ''}${e.message}`)
                .join(' · ');
              errorBanner.textContent = `Drupal rejected the submission (${response.status}): ${messages}`;
              errorBanner.hidden = false;
              isSubmitting = false;
              saveBtn.disabled = false;
              saveBtn.textContent = 'Submit Annotations to Drupal';
              return;
            }
            // Redirect to the Thank You / JSON Output page (user can no longer edit stale state).
            window.location.href = data.redirectUrl;
          } catch (err) {
            errorBanner.textContent = `Network error while submitting to Drupal: ${err instanceof Error ? err.message : String(err)}`;
            errorBanner.hidden = false;
            isSubmitting = false;
            saveBtn.disabled = false;
            saveBtn.textContent = 'Submit Annotations to Drupal';
          }
        });
      }
    </script>
  </body>
</html>
