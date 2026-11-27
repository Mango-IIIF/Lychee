<?php
declare(strict_types=1);

require_once __DIR__ . '/lib/drupal_mock.php';

$id = isset($_GET['id']) ? (string) $_GET['id'] : '';
$submission = $id !== '' ? drupal_poc_load_submission($id) : null;
$recent = drupal_poc_recent_submissions();
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Thank You — Drupal Submission Output</title>
    <link rel="stylesheet" href="/drupal-poc.css" />
  </head>
  <body>
    <header class="drupal-toolbar">
      <div class="drupal-toolbar__brand">
        <span>Drupal 10/11 Mock</span>
        <span class="drupal-toolbar__badge">Submission Output</span>
      </div>
      <div class="drupal-toolbar__controls">
        <a class="btn btn--secondary" style="padding:5px 12px;font-size:12.5px;" href="/">← Back to Annotate Page</a>
      </div>
    </header>

    <div class="drupal-header">
      <div class="drupal-header__inner">
        <div class="drupal-breadcrumbs">
          <a href="/">Content</a> / Submission Output
        </div>
        <h1 class="drupal-title">
          <?php if ($submission): ?>
            Thank you — changes received by Drupal
          <?php else: ?>
            Submission not found
          <?php endif; ?>
        </h1>
      </div>
    </div>

    <main class="drupal-main">
      <?php if (!$submission): ?>
        <div class="alert alert--error">
          No submission found for ID <code><?= h($id) ?></code>. Make an annotation edit on the fake Drupal page and submit it to inspect the JSON here.
        </div>
      <?php else: ?>
        <?php
          $summary = $submission['summary'] ?? [];
          $operations = $submission['operations'] ?? [];
          $node = $submission['node'] ?? [];
          $user = $submission['drupalUser'] ?? [];
          $rawJson = json_encode($submission['rawChangeset'] ?? [], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
          $processedJson = json_encode($submission, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
          $returnUrl = '/?' . http_build_query([
              'mode' => $submission['submitMode'] ?? 'annotate',
              'role' => $user['role'] ?? 'volunteer',
              'item' => $node['key'] ?? 'constabulary',
          ]);
        ?>

        <div class="alert alert--success">
          <strong>Submission <?= h((string) $submission['submissionId']) ?> accepted.</strong>
          You have been redirected out of the editor so stale draft IDs cannot be re-submitted.
          Submitted via <strong><?= ($submission['submitMode'] ?? '') === 'node' ? 'Drupal Node Form POST' : 'AJAX JSON POST' ?></strong>
          as <strong><?= h((string) ($user['userName'] ?? '')) ?></strong> (<code><?= h((string) ($user['role'] ?? '')) ?></code>)
          at <code><?= h((string) ($submission['submittedAt'] ?? '')) ?></code>.
        </div>

        <div class="summary-grid">
          <div class="stat-card">
            <div class="stat-card__label">Created</div>
            <div class="stat-card__value" style="color:var(--drupal-green-fg);">+<?= (int) ($summary['createdCount'] ?? 0) ?></div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">Updated</div>
            <div class="stat-card__value" style="color:var(--drupal-blue-fg);">~<?= (int) ($summary['updatedCount'] ?? 0) ?></div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">Deleted</div>
            <div class="stat-card__value" style="color:var(--drupal-red-fg);">-<?= (int) ($summary['deletedCount'] ?? 0) ?></div>
          </div>
          <div class="stat-card">
            <div class="stat-card__label">Contents (TOC)</div>
            <div class="stat-card__value" style="font-size:18px;margin-top:10px;">
              <?= !empty($summary['structuresChanged']) ? 'Updated (' . (int) ($summary['structuresCount'] ?? 0) . ')' : 'Unchanged' ?>
            </div>
          </div>
        </div>

        <?php if (($submission['submitMode'] ?? '') === 'node'): ?>
          <section class="card">
            <h2 style="margin:0 0 8px;font-size:16px;">Drupal Node Fields Saved</h2>
            <p style="margin:0 0 6px;"><strong>Node #<?= (int) ($node['nid'] ?? 0) ?> Title:</strong> <?= h((string) ($node['title'] ?? '')) ?></p>
            <p style="margin:0;"><strong>Revision Summary:</strong> <?= h((string) ($node['summary'] ?? '')) ?></p>
          </section>
        <?php endif; ?>

        <section class="card">
          <h2 style="margin:0 0 12px;font-size:16px;">Validated Operations &amp; Minted Drupal URIs</h2>
          <?php if ($operations === []): ?>
            <p style="margin:0;color:var(--drupal-muted);">No annotation operations in this submission.</p>
          <?php else: ?>
            <table class="ops-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Validation</th>
                  <th>Motivation</th>
                  <th>Draft ID → Canonical Drupal ID</th>
                </tr>
              </thead>
              <tbody>
                <?php foreach ($operations as $op): ?>
                  <?php
                    $action = (string) ($op['action'] ?? '');
                    $pillClass = match ($action) {
                        'created' => 'pill--created',
                        'updated' => 'pill--updated',
                        'deleted' => 'pill--deleted',
                        default => '',
                    };
                  ?>
                  <tr>
                    <td><span class="pill <?= $pillClass ?>"><?= h(strtoupper($action)) ?></span></td>
                    <td><span class="pill pill--created"><?= h((string) ($op['status'] ?? 'valid')) ?></span></td>
                    <td><code><?= h((string) ($op['motivation'] ?? '—')) ?></code></td>
                    <td>
                      <?php if (!empty($op['draftId'])): ?>
                        <code><?= h((string) $op['draftId']) ?></code><br />
                        → <code><?= h((string) ($op['assignedId'] ?? '')) ?></code>
                      <?php else: ?>
                        <code><?= h((string) ($op['assignedId'] ?? '')) ?></code>
                      <?php endif; ?>
                    </td>
                  </tr>
                <?php endforeach; ?>
              </tbody>
            </table>
          <?php endif; ?>
        </section>

        <section class="card">
          <div class="json-tabs">
            <div class="json-tabs__buttons">
              <button type="button" class="json-tabs__btn is-active" data-tab="raw">Raw Payload POSTed to Drupal</button>
              <button type="button" class="json-tabs__btn" data-tab="processed">Drupal Processed Record (with Minted IDs)</button>
            </div>
            <div style="display:flex;gap:8px;">
              <button type="button" id="copy-json-btn" class="btn btn--secondary" style="padding:6px 12px;font-size:12.5px;">Copy JSON</button>
              <a class="btn btn--primary" style="padding:6px 12px;font-size:12.5px;" href="<?= h($returnUrl) ?>">Start New Session</a>
            </div>
          </div>
          <pre class="json-block" id="json-raw"><?= h((string) $rawJson) ?></pre>
          <pre class="json-block" id="json-processed" hidden><?= h((string) $processedJson) ?></pre>
        </section>
      <?php endif; ?>

      <?php if ($recent !== []): ?>
        <section class="card">
          <h2 style="margin:0 0 10px;font-size:15px;">Recent POC Submissions</h2>
          <table class="ops-table">
            <thead>
              <tr>
                <th>Submission ID</th>
                <th>Mode</th>
                <th>Node</th>
                <th>Changes</th>
                <th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              <?php foreach ($recent as $row): ?>
                <tr>
                  <td><a href="/output.php?id=<?= urlencode($row['id']) ?>"><code><?= h($row['id']) ?></code></a></td>
                  <td><code><?= h($row['mode']) ?></code></td>
                  <td><?= h($row['title']) ?></td>
                  <td><code><?= h($row['counts']) ?></code></td>
                  <td><code><?= h($row['submittedAt']) ?></code></td>
                </tr>
              <?php endforeach; ?>
            </tbody>
          </table>
        </section>
      <?php endif; ?>
    </main>

    <script>
      const rawEl = document.getElementById('json-raw');
      const processedEl = document.getElementById('json-processed');
      const copyBtn = document.getElementById('copy-json-btn');
      let activeTab = 'raw';

      document.querySelectorAll('.json-tabs__btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          activeTab = btn.dataset.tab;
          document.querySelectorAll('.json-tabs__btn').forEach((b) => b.classList.toggle('is-active', b === btn));
          if (rawEl && processedEl) {
            rawEl.hidden = activeTab !== 'raw';
            processedEl.hidden = activeTab !== 'processed';
          }
        });
      });

      copyBtn?.addEventListener('click', async () => {
        const text = activeTab === 'raw' ? rawEl?.textContent : processedEl?.textContent;
        if (!text) return;
        await navigator.clipboard.writeText(text);
        const orig = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = orig), 1500);
      });
    </script>
  </body>
</html>
