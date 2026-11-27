# Fake Drupal Changeset POC

A lightweight PHP proof of concept demonstrating how a Drupal site can embed `<mango-annotation-editor>`, hide Lychee's built-in file download button (`showExport: false`), track `created` / `updated` / `deleted` annotation changes via Lychee's `getChangeset()` / `changesetChange` API, validate them server-side in PHP, and redirect to a Thank You / JSON Output page.

## Run locally

Build the standalone editor bundle (if you haven't already):

```bash
npm run build:demo
```

Start the PHP built-in server from the repository root:

```bash
php -S 127.0.0.1:8085 -t apps/drupal-poc apps/drupal-poc/router.php
```

Open http://127.0.0.1:8085 in your browser.

## What to try

1. **Annotate mode (`/?mode=annotate`)**:
   - Create a new annotation, edit an existing manifest annotation, or delete one (switch Role to **Admin / Content Owner** to edit/delete any manifest annotation, or **Volunteer — Jane Jones** to edit/delete only Jane's).
   - Watch the pending changeset badges (`+created`, `~updated`, `-deleted`) and the **Live Changeset JSON Preview** update in real time.
   - Click **Submit Annotations to Drupal** → PHP validates the payload, checks permissions, mints canonical HTTP(S) URIs for `urn:uuid:` drafts, stores the submission in `apps/drupal-poc/submissions/`, and redirects to `/output.php?id=...`.
2. **Drupal Node Edit Form mode (`/?mode=node`)**:
   - Edit the fake Node Title / Summary and annotate inside the editor.
   - Click **Save Node & Annotations** → submits the changeset via a hidden form input (`changeset_json`) and redirects to `/output.php?id=...`.
