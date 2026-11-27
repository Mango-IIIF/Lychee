<?php
declare(strict_types=1);

require_once __DIR__ . '/lib/drupal_mock.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => 'Method Not Allowed. Use POST.']);
    exit;
}

$roles = drupal_poc_roles();
$nodes = drupal_poc_nodes();
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
$isJson = str_contains(strtolower($contentType), 'application/json');

if ($isJson) {
    header('Content-Type: application/json; charset=utf-8');
    $csrf = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null;
    if (!drupal_poc_verify_csrf($csrf)) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'errors' => [['scope' => 'csrf', 'message' => 'Invalid or expired Drupal CSRF token.']]]);
        exit;
    }

    $body = json_decode((string) file_get_contents('php://input'), true);
    if (!is_array($body) || !is_array($body['changeset'] ?? null)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'errors' => [['scope' => 'request', 'message' => 'Expected JSON body with a changeset object.']]]);
        exit;
    }

    $roleKey = (string) ($body['role'] ?? 'volunteer');
    $itemKey = (string) ($body['item'] ?? 'constabulary');
    $role = $roles[$roleKey] ?? $roles['volunteer'];
    $node = $nodes[$itemKey] ?? $nodes['constabulary'];

    $result = drupal_poc_process_submission(
        $body['changeset'],
        $role,
        [
            'nid' => $node['nid'],
            'key' => $node['key'],
            'title' => $node['title'],
            'summary' => $node['summary'],
        ],
        'annotate'
    );

    http_response_code($result['httpStatus']);
    if (!$result['ok']) {
        echo json_encode(['ok' => false, 'errors' => $result['errors']]);
        exit;
    }

    $id = $result['record']['submissionId'];
    echo json_encode([
        'ok' => true,
        'id' => $id,
        'redirectUrl' => '/output.php?id=' . urlencode($id),
        'idMap' => $result['record']['idMap'],
        'summary' => $result['record']['summary'],
    ]);
    exit;
}

// Form POST (Node Edit Form mode)
$csrf = isset($_POST['_csrf_token']) ? (string) $_POST['_csrf_token'] : null;
if (!drupal_poc_verify_csrf($csrf)) {
    http_response_code(403);
    header('Content-Type: text/plain; charset=utf-8');
    echo '403 Forbidden: Invalid Drupal form CSRF token.';
    exit;
}

$roleKey = (string) ($_POST['role'] ?? 'volunteer');
$itemKey = (string) ($_POST['item'] ?? 'constabulary');
$role = $roles[$roleKey] ?? $roles['volunteer'];
$node = $nodes[$itemKey] ?? $nodes['constabulary'];

$rawChangeset = (string) ($_POST['changeset_json'] ?? '');
$changeset = json_decode($rawChangeset, true);
if (!is_array($changeset)) {
    $changeset = [
        'manifestId' => drupal_poc_base_url() . $node['manifest'],
        'created' => [],
        'updated' => [],
        'deleted' => [],
        'structuresChanged' => false,
        'hasChanges' => false,
    ];
}

$nodeMeta = [
    'nid' => $node['nid'],
    'key' => $node['key'],
    'title' => trim((string) ($_POST['node_title'] ?? $node['title'])),
    'summary' => trim((string) ($_POST['node_summary'] ?? $node['summary'])),
];

$result = drupal_poc_process_submission($changeset, $role, $nodeMeta, 'node');
if (!$result['ok']) {
    http_response_code($result['httpStatus']);
    header('Content-Type: text/html; charset=utf-8');
    echo '<h1>Drupal Validation Failed</h1><pre>' . h(json_encode($result['errors'], JSON_PRETTY_PRINT)) . '</pre>';
    echo '<p><a href="/?mode=node&role=' . urlencode($roleKey) . '&item=' . urlencode($itemKey) . '">Back to form</a></p>';
    exit;
}

$id = $result['record']['submissionId'];
header('Location: /output.php?id=' . urlencode($id), true, 303);
exit;
