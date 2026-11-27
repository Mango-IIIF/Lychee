<?php
declare(strict_types=1);

/**
 * Fake Drupal backend helpers for the Lychee changeset POC:
 * - Mock user roles & permissions
 * - Mock Drupal nodes linked to local test manifests
 * - CSRF token handling
 * - Server-side W3C changeset validation, permission checks, and HTTP(S) URI minting
 */

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function drupal_poc_csrf_token(): string
{
    if (empty($_SESSION['drupal_poc_csrf'])) {
        $_SESSION['drupal_poc_csrf'] = bin2hex(random_bytes(24));
    }
    return (string) $_SESSION['drupal_poc_csrf'];
}

function drupal_poc_verify_csrf(?string $token): bool
{
    $expected = $_SESSION['drupal_poc_csrf'] ?? '';
    return $expected !== '' && is_string($token) && hash_equals($expected, $token);
}

/** @return array<string, array<string, mixed>> */
function drupal_poc_roles(): array
{
    return [
        'admin' => [
            'key' => 'admin',
            'label' => 'Admin / Content Owner (edit all, delete all)',
            'userId' => 'https://www.peoplescollection.wales/user/1',
            'userName' => 'Site Admin',
            'permissions' => ['edit' => 'all', 'delete' => 'all'],
            'visibility' => 'all',
        ],
        'volunteer' => [
            'key' => 'volunteer',
            'label' => 'Volunteer — Jane Jones (edit own, delete own)',
            'userId' => 'https://www.peoplescollection.wales/user/4567',
            'userName' => 'Jane Jones',
            'permissions' => ['edit' => 'own', 'delete' => 'own'],
            'visibility' => 'all',
        ],
        'volunteer_own' => [
            'key' => 'volunteer_own',
            'label' => 'Volunteer — Jane Jones (own visibility only)',
            'userId' => 'https://www.peoplescollection.wales/user/4567',
            'userName' => 'Jane Jones',
            'permissions' => ['edit' => 'own', 'delete' => 'own'],
            'visibility' => 'own',
        ],
        'moderator' => [
            'key' => 'moderator',
            'label' => 'Moderator (edit all, delete own)',
            'userId' => 'https://www.peoplescollection.wales/user/99',
            'userName' => 'Collection Moderator',
            'permissions' => ['edit' => 'all', 'delete' => 'own'],
            'visibility' => 'all',
        ],
    ];
}

/** @return array<string, array<string, mixed>> */
function drupal_poc_nodes(): array
{
    return [
        'constabulary' => [
            'nid' => 1042,
            'key' => 'constabulary',
            'title' => 'Cardiganshire Constabulary register of criminals (1897–1933)',
            'summary' => 'Historic police register from the National Library of Wales with existing test annotations.',
            'manifest' => '/manifests/constabulary.json',
            'type' => 'image',
        ],
        'margaret-young' => [
            'nid' => 550555,
            'key' => 'margaret-young',
            'title' => 'Margaret Young — Voices from the Factory Floor',
            'summary' => 'Oral history recording from Women\'s Archive Wales with transcript, chapters, and draft annotations.',
            'manifest' => '/manifests/iiif-pcw-550555/manifest.json',
            'type' => 'audio',
        ],
        'danny-frisby' => [
            'nid' => 574604,
            'key' => 'danny-frisby',
            'title' => 'Danny Frisby — British Army Veteran',
            'summary' => 'Veteran Films video recording with transcript and draft annotations.',
            'manifest' => '/manifests/iiif-pcw-574604/manifest.json',
            'type' => 'video',
        ],
    ];
}

function drupal_poc_submissions_dir(): string
{
    $dir = dirname(__DIR__) . '/submissions';
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    return $dir;
}

function drupal_poc_base_url(): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1:8085';
    return $scheme . '://' . $host;
}

function drupal_poc_mint_annotation_uri(string $draftId): string
{
    if (preg_match('/^https?:\/\//i', $draftId)) {
        return $draftId;
    }
    if (preg_match('/^urn:uuid:([a-z0-9-]+)$/i', $draftId, $matches)) {
        $slug = strtolower($matches[1]);
    } else {
        $slug = bin2hex(random_bytes(8));
    }
    return 'https://drupal.example.org/iiif/annotations/' . $slug;
}

/** @return list<string> */
function drupal_poc_creator_ids(array $annotation): array
{
    $creator = $annotation['creator'] ?? null;
    if ($creator === null) {
        return [];
    }
    $list = array_is_list((array) $creator) ? (array) $creator : [$creator];
    $ids = [];
    foreach ($list as $entry) {
        if (is_string($entry) && $entry !== '') {
            $ids[] = $entry;
        } elseif (is_array($entry) && !empty($entry['id']) && is_string($entry['id'])) {
            $ids[] = $entry['id'];
        }
    }
    return $ids;
}

/**
 * Simulates Drupal server-side validation, permission checks, and URI minting
 * for a Lychee AnnotationChangeset submission.
 *
 * @param array<string, mixed> $changeset
 * @param array<string, mixed> $role
 * @param array<string, mixed> $nodeMeta
 * @return array{ok: bool, httpStatus: int, errors: list<array<string, mixed>>, record?: array<string, mixed>}
 */
function drupal_poc_process_submission(
    array $changeset,
    array $role,
    array $nodeMeta,
    string $submitMode
): array {
    $errors = [];
    $manifestId = isset($changeset['manifestId']) && is_string($changeset['manifestId'])
        ? trim($changeset['manifestId'])
        : '';

    if ($manifestId === '') {
        $errors[] = ['scope' => 'changeset', 'id' => null, 'message' => 'Missing manifestId in changeset.'];
    }

    $created = is_array($changeset['created'] ?? null) ? $changeset['created'] : [];
    $updated = is_array($changeset['updated'] ?? null) ? $changeset['updated'] : [];
    $deleted = is_array($changeset['deleted'] ?? null) ? $changeset['deleted'] : [];
    $structures = is_array($changeset['structures'] ?? null) ? $changeset['structures'] : null;
    $structuresChanged = !empty($changeset['structuresChanged']);

    $editScope = $role['permissions']['edit'] ?? 'own';
    $deleteScope = $role['permissions']['delete'] ?? 'own';
    $userId = (string) ($role['userId'] ?? '');

    $idMap = [];
    $operations = [];

    foreach ($created as $index => $annotation) {
        if (!is_array($annotation)) {
            $errors[] = ['scope' => 'created', 'id' => "created[$index]", 'message' => 'Annotation must be an object.'];
            continue;
        }
        $draftId = (string) ($annotation['id'] ?? '');
        if (($annotation['type'] ?? null) !== 'Annotation') {
            $errors[] = ['scope' => 'created', 'id' => $draftId, 'message' => 'Missing or invalid type (expected "Annotation").'];
            continue;
        }
        if (empty($annotation['target'])) {
            $errors[] = ['scope' => 'created', 'id' => $draftId, 'message' => 'Missing W3C target.'];
            continue;
        }
        $assignedId = drupal_poc_mint_annotation_uri($draftId);
        $idMap[$draftId] = $assignedId;
        $stored = $annotation;
        $stored['id'] = $assignedId;
        $operations[] = [
            'action' => 'created',
            'status' => 'valid',
            'draftId' => $draftId,
            'assignedId' => $assignedId,
            'motivation' => $annotation['motivation'] ?? null,
            'annotation' => $stored,
        ];
    }

    foreach ($updated as $index => $annotation) {
        if (!is_array($annotation)) {
            $errors[] = ['scope' => 'updated', 'id' => "updated[$index]", 'message' => 'Annotation must be an object.'];
            continue;
        }
        $id = (string) ($annotation['id'] ?? '');
        if ($id === '' || ($annotation['type'] ?? null) !== 'Annotation' || empty($annotation['target'])) {
            $errors[] = ['scope' => 'updated', 'id' => $id, 'message' => 'Updated annotation must have id, type="Annotation", and target.'];
            continue;
        }
        if ($editScope === 'none') {
            $errors[] = ['scope' => 'updated', 'id' => $id, 'message' => 'Current Drupal role is not permitted to edit annotations.'];
            continue;
        }
        if ($editScope === 'own') {
            $creators = drupal_poc_creator_ids($annotation);
            if ($userId === '' || !in_array($userId, $creators, true)) {
                $errors[] = [
                    'scope' => 'updated',
                    'id' => $id,
                    'message' => 'Server permission check failed: volunteer may only update their own annotations.',
                ];
                continue;
            }
        }
        $operations[] = [
            'action' => 'updated',
            'status' => 'valid',
            'draftId' => null,
            'assignedId' => $id,
            'motivation' => $annotation['motivation'] ?? null,
            'annotation' => $annotation,
        ];
    }

    foreach ($deleted as $index => $id) {
        if (!is_string($id) || trim($id) === '') {
            $errors[] = ['scope' => 'deleted', 'id' => "deleted[$index]", 'message' => 'Deleted annotation ID must be a non-empty string.'];
            continue;
        }
        if ($deleteScope === 'none') {
            $errors[] = ['scope' => 'deleted', 'id' => $id, 'message' => 'Current Drupal role is not permitted to delete annotations.'];
            continue;
        }
        $operations[] = [
            'action' => 'deleted',
            'status' => 'valid',
            'draftId' => null,
            'assignedId' => $id,
            'motivation' => null,
            'annotation' => null,
        ];
    }

    if ($errors !== []) {
        return [
            'ok' => false,
            'httpStatus' => 422,
            'errors' => $errors,
        ];
    }

    $submissionId = date('Ymd-His') . '-' . bin2hex(random_bytes(4));
    $record = [
        'submissionId' => $submissionId,
        'submittedAt' => gmdate('c'),
        'submitMode' => $submitMode,
        'drupalUser' => [
            'role' => $role['key'],
            'label' => $role['label'],
            'userId' => $role['userId'],
            'userName' => $role['userName'],
            'permissions' => $role['permissions'],
        ],
        'node' => $nodeMeta,
        'summary' => [
            'createdCount' => count($created),
            'updatedCount' => count($updated),
            'deletedCount' => count($deleted),
            'structuresChanged' => $structuresChanged,
            'structuresCount' => is_array($structures) ? count($structures) : 0,
        ],
        'idMap' => $idMap,
        'operations' => $operations,
        'rawChangeset' => $changeset,
    ];

    $file = drupal_poc_submissions_dir() . '/' . $submissionId . '.json';
    file_put_contents($file, json_encode($record, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

    return [
        'ok' => true,
        'httpStatus' => 200,
        'errors' => [],
        'record' => $record,
    ];
}

/** @return array<string, mixed>|null */
function drupal_poc_load_submission(string $id): ?array
{
    if (!preg_match('/^[a-zA-Z0-9-]+$/', $id)) {
        return null;
    }
    $file = drupal_poc_submissions_dir() . '/' . $id . '.json';
    if (!is_file($file)) {
        return null;
    }
    $decoded = json_decode((string) file_get_contents($file), true);
    return is_array($decoded) ? $decoded : null;
}

/** @return list<array{id: string, submittedAt: string, mode: string, title: string, counts: string}> */
function drupal_poc_recent_submissions(int $limit = 8): array
{
    $files = glob(drupal_poc_submissions_dir() . '/*.json') ?: [];
    rsort($files);
    $recent = [];
    foreach (array_slice($files, 0, $limit) as $file) {
        $data = json_decode((string) file_get_contents($file), true);
        if (!is_array($data)) {
            continue;
        }
        $s = $data['summary'] ?? [];
        $recent[] = [
            'id' => (string) ($data['submissionId'] ?? basename($file, '.json')),
            'submittedAt' => (string) ($data['submittedAt'] ?? ''),
            'mode' => (string) ($data['submitMode'] ?? 'annotate'),
            'title' => (string) ($data['node']['title'] ?? 'Untitled'),
            'counts' => sprintf(
                '+%d / ~%d / -%d',
                (int) ($s['createdCount'] ?? 0),
                (int) ($s['updatedCount'] ?? 0),
                (int) ($s['deletedCount'] ?? 0)
            ),
        ];
    }
    return $recent;
}

function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}
