<?php
declare(strict_types=1);

/**
 * Router for PHP's built-in server:
 *   php -S 127.0.0.1:8085 -t apps/drupal-poc apps/drupal-poc/router.php
 *
 * Serves:
 * - /dist/*      -> apps/demo/dist/*      (built <mango-annotation-editor> bundle & workers)
 * - /manifests/* -> apps/demo/manifests/* (with localhost:5173 URLs rebased to this server)
 * - /images/*    -> apps/demo/images/*
 * - PHP routes   -> apps/drupal-poc/*.php
 */

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$pocRoot = __DIR__;
$repoRoot = dirname(__DIR__, 2);
$demoRoot = $repoRoot . '/apps/demo';

$mimeTypes = [
    'js' => 'application/javascript; charset=utf-8',
    'mjs' => 'application/javascript; charset=utf-8',
    'css' => 'text/css; charset=utf-8',
    'json' => 'application/json; charset=utf-8',
    'jsonld' => 'application/ld+json; charset=utf-8',
    'svg' => 'image/svg+xml',
    'png' => 'image/png',
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
    'wasm' => 'application/wasm',
    'vtt' => 'text/vtt; charset=utf-8',
    'map' => 'application/json; charset=utf-8',
];

$serveFile = static function (string $filePath, bool $rebaseManifestJson = false) use ($mimeTypes): bool {
    $real = realpath($filePath);
    if ($real === false || !is_file($real)) {
        return false;
    }
    $ext = strtolower(pathinfo($real, PATHINFO_EXTENSION));
    $contentType = $mimeTypes[$ext] ?? 'application/octet-stream';
    header('Content-Type: ' . $contentType);
    header('Access-Control-Allow-Origin: *');
    header('Cache-Control: no-cache');

    if ($rebaseManifestJson && ($ext === 'json' || $ext === 'jsonld')) {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1:8085';
        $base = $scheme . '://' . $host;
        $contents = file_get_contents($real);
        if ($contents === false) {
            http_response_code(500);
            echo 'Unable to read manifest.';
            return true;
        }
        // Rebase demo dev URLs onto the local PHP server so AV manifests & annotation pages resolve.
        $contents = str_replace(
            ['http://localhost:5173/manifests/', 'http://localhost:5173/'],
            [$base . '/manifests/', $base . '/manifests/'],
            $contents
        );
        echo $contents;
        return true;
    }

    readfile($real);
    return true;
};

// Static assets shared from apps/demo
foreach (['/dist/' => false, '/manifests/' => true, '/images/' => false] as $prefix => $rebase) {
    if (str_starts_with($uri, $prefix)) {
        $relative = ltrim(substr($uri, 1), '/');
        $target = $demoRoot . '/' . $relative;
        $realDemo = realpath($demoRoot);
        $realTarget = realpath($target);
        if ($realDemo !== false && $realTarget !== false && str_starts_with($realTarget, $realDemo)) {
            if ($serveFile($realTarget, $rebase)) {
                return true;
            }
        }
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo "Not found: {$uri}";
        return true;
    }
}

// Static files inside apps/drupal-poc (CSS, etc.)
$localFile = $pocRoot . $uri;
if ($uri !== '/' && is_file($localFile) && !str_ends_with($localFile, '.php')) {
    return false; // Let PHP's built-in server serve it directly.
}

if ($uri === '/' || $uri === '/index.php') {
    require $pocRoot . '/index.php';
    return true;
}

if ($uri === '/save' || $uri === '/save.php') {
    require $pocRoot . '/save.php';
    return true;
}

if ($uri === '/output' || $uri === '/output.php') {
    require $pocRoot . '/output.php';
    return true;
}

http_response_code(404);
header('Content-Type: text/plain; charset=utf-8');
echo "Not found: {$uri}";
return true;
