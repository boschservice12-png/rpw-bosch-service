<?php

declare(strict_types=1);

namespace App\Controller\Compat;

use App\Application\ApiError;
use App\Application\AuditLog;
use App\Application\AuthService;
use App\Application\ClientUploadService;
use App\Application\JobService;
use App\Domain\Auth\Actor;
use App\Infrastructure\Storage\FileStore;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * A FOTÓTÁROLÓ KAPUJA — a supabase/functions/rpw-storage/core.js szabályaival,
 * ugyanazon a címen (/functions/v1/rpw-storage), így a rpw-photos.js változatlan.
 *
 *   dolgozó (x-rpw-token): sign-upload · sign-read · remove
 *   ügyfél (WhatsApp-link):  client-sign-upload · client-sign-read
 *
 * Hiba esetén a válasz nem árulja el, hogy a munka létezik-e (403 not_allowed).
 */
final class StorageController
{
    public const READ_TTL = 3600;
    public const UPLOAD_TTL = 600;
    public const LIMITS = ['readPaths' => 60, 'removePaths' => 20];
    private const JOB_RE = '/^RPW-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';
    private const REST_RE = '/^(?:[A-Za-z0-9_-]{1,40}\/)?[A-Za-z0-9_.-]{1,160}$/';
    private const CLIENT_NAME_RE = '/^(?:acta_[A-Za-z0-9_-]{1,60}|client)_[0-9]{10,16}_[a-z0-9]{1,8}\.[a-z0-9]{1,6}$/';

    public function __construct(
        private readonly FileStore $store,
        private readonly AuthService $auth,
        private readonly JobService $jobs,
        private readonly ClientUploadService $client,
        private readonly AuditLog $audit,
        private readonly string $bucket = 'rpw-photos',
    ) {
    }

    /** @return ?array{jobId:string, rest:string, path:string} */
    public static function parsePath(mixed $p): ?array
    {
        if (!\is_string($p) || \strlen($p) > 220 || str_contains($p, '..') || str_contains($p, '//') || str_starts_with($p, '/')) {
            return null;
        }
        $i = strpos($p, '/');
        if ($i === false || $i === 0) {
            return null;
        }
        $job = substr($p, 0, $i);
        $rest = substr($p, $i + 1);

        return preg_match(self::JOB_RE, $job) === 1 && preg_match(self::REST_RE, $rest) === 1 ? ['jobId' => $job, 'rest' => $rest, 'path' => $p] : null;
    }

    #[Route('/functions/v1/rpw-storage', name: 'compat_storage_gateway', methods: ['POST'])]
    public function gateway(Request $r): JsonResponse
    {
        $body = json_decode($r->getContent(), true);
        if (!\is_array($body)) {
            return $this->out(400, 'json');
        }
        $op = $body['op'] ?? null;
        $base = $r->getSchemeAndHttpHost();

        if (\in_array($op, ['sign-upload', 'sign-read', 'remove'], true)) {
            $actor = $this->auth->actorFromToken($r->headers->get('x-rpw-token'));
            if ($actor === null) {
                return $this->out(401, 'unauthorized');
            }
            if ($op === 'sign-upload') {
                $x = self::parsePath($body['path'] ?? null);
                if ($x === null) {
                    return $this->out(400, 'bad_path');
                }
                if (!$this->owns($actor, $x['jobId'])) {
                    return $this->out(403, 'not_allowed');
                }

                return $this->uploadTicket($x['path'], true, $base);
            }
            $xs = $this->parseAll($body['paths'] ?? null, $op === 'remove' ? self::LIMITS['removePaths'] : self::LIMITS['readPaths']);
            if ($xs === null) {
                return $this->out(400, 'bad_paths');
            }
            foreach (array_unique(array_column($xs, 'jobId')) as $j) {
                if (!$this->owns($actor, $j)) {
                    return $this->out(403, 'not_allowed');
                }
            }
            if ($op === 'sign-read') {
                return $this->readUrls($xs, $base);
            }
            foreach ($xs as $x) {
                $this->store->remove($this->bucket, $x['path']);
            }
            foreach (array_unique(array_column($xs, 'jobId')) as $j) {
                $this->audit->write($actor->shopId, $j, $actor->name, 'photo_remove', null,
                    ['paths' => array_values(array_column(array_filter($xs, static fn ($x) => $x['jobId'] === $j), 'path'))]);
            }

            return new JsonResponse(['ok' => true, 'removed' => \count($xs)]);
        }

        if ($op === 'client-sign-upload') {
            $x = self::parsePath($body['path'] ?? null);
            if ($x === null) {
                return $this->out(400, 'bad_path');
            }
            if (preg_match(self::CLIENT_NAME_RE, $x['rest']) !== 1 || ($this->client->get($x['jobId'])['ok'] ?? false) !== true) {
                return $this->out(403, 'not_allowed');
            }

            return $this->uploadTicket($x['path'], false, $base);   // az ügyfél meglévő fájlt NEM írhat felül
        }
        if ($op === 'client-sign-read') {
            $xs = $this->parseAll($body['paths'] ?? null, self::LIMITS['readPaths']);
            if ($xs === null) {
                return $this->out(400, 'bad_paths');
            }
            $jobs = array_unique(array_column($xs, 'jobId'));
            foreach ($xs as $x) {
                if (preg_match(self::CLIENT_NAME_RE, $x['rest']) !== 1) {
                    return $this->out(403, 'not_allowed');
                }
            }
            if (\count($jobs) !== 1 || ($this->client->get($jobs[0])['ok'] ?? false) !== true) {
                return $this->out(403, 'not_allowed');
            }

            return $this->readUrls($xs, $base);
        }

        return $this->out(400, 'unknown_op');
    }

    /** supabase-js uploadToSignedUrl: PUT, a fájl névtelen multipart-mezőben vagy nyers törzsként. */
    #[Route('/storage/v1/object/upload/sign/{bucket}/{path}', name: 'compat_storage_upload', methods: ['PUT', 'POST'], requirements: ['path' => '.+'])]
    public function upload(string $bucket, string $path, Request $r): JsonResponse
    {
        $t = $this->store->verify((string) $r->query->get('token', ''), 'upload', $bucket, $path);
        if ($t === null) {
            return new JsonResponse(['statusCode' => '403', 'error' => 'InvalidSignature', 'message' => 'invalid signature'], 403);
        }
        if (!$t['u'] && $this->store->exists($bucket, $path)) {
            return new JsonResponse(['statusCode' => '409', 'error' => 'Duplicate', 'message' => 'The resource already exists'], 409);
        }
        [$bytes, $mime] = self::extractFile($r);
        if ($bytes === null || $bytes === '') {
            return new JsonResponse(['statusCode' => '400', 'error' => 'NoFile', 'message' => 'empty upload'], 400);
        }
        if (\strlen($bytes) > FileStore::MAX_BYTES) {
            return new JsonResponse(['statusCode' => '413', 'error' => 'TooLarge', 'message' => 'file too large'], 413);
        }
        $this->store->put($bucket, $path, $bytes, self::safeMime($mime, $bytes));

        return new JsonResponse(['Key' => $bucket.'/'.$path, 'Id' => hash('sha1', $bucket.'/'.$path)]);
    }

    #[Route('/storage/v1/object/sign/{bucket}/{path}', name: 'compat_storage_read', methods: ['GET'], requirements: ['path' => '.+'])]
    public function read(string $bucket, string $path, Request $r): Response
    {
        $t = $this->store->verify((string) $r->query->get('token', ''), 'read', $bucket, $path);
        $f = $t === null ? null : $this->store->get($bucket, $path);
        if ($f === null) {
            return new JsonResponse(['statusCode' => '400', 'error' => 'not_found', 'message' => 'Object not found'], $t === null ? 403 : 404);
        }
        $res = new BinaryFileResponse($f['file']);
        $res->headers->set('Content-Type', $f['mime']);
        $res->headers->set('Cache-Control', 'private, max-age=3600');
        $res->headers->set('X-Content-Type-Options', 'nosniff');
        $res->headers->set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");

        return $res;
    }

    // ── belső ─────────────────────────────────────────────────────────
    private function uploadTicket(string $path, bool $upsert, string $base): JsonResponse
    {
        $token = $this->store->sign('upload', $this->bucket, $path, self::UPLOAD_TTL, $upsert);

        return new JsonResponse(['ok' => true, 'path' => $path, 'token' => $token,
            'signedUrl' => $base.'/storage/v1/object/upload/sign/'.$this->bucket.'/'.$path.'?token='.$token]);
    }

    private function readUrls(array $xs, string $base): JsonResponse
    {
        return new JsonResponse(['ok' => true, 'urls' => array_map(fn ($x) => ['path' => $x['path'], 'signedUrl' => $this->store->exists($this->bucket, $x['path'])
            ? $base.'/storage/v1/object/sign/'.$this->bucket.'/'.$x['path'].'?token='.$this->store->sign('read', $this->bucket, $x['path'], self::READ_TTL)
            : null], $xs)]);
    }

    private function parseAll(mixed $paths, int $max): ?array
    {
        if (!\is_array($paths) || $paths === [] || \count($paths) > $max) {
            return null;
        }
        $out = [];
        foreach ($paths as $p) {
            $x = self::parsePath($p);
            if ($x === null) {
                return null;
            }
            $out[] = $x;
        }

        return $out;
    }

    private function owns(Actor $a, string $jobId): bool
    {
        try {
            $this->jobs->get($a, $jobId);

            return true;
        } catch (ApiError) {
            return false;
        }
    }

    private function out(int $status, string $code): JsonResponse
    {
        return new JsonResponse(['ok' => false, 'error' => $code], $status);
    }

    /** A PHP a PUT-törzs multipart-ját nem bontja ki — itt tesszük, a fájlrészt keresve. */
    public static function extractFile(Request $r): array
    {
        $ct = (string) $r->headers->get('Content-Type', '');
        $raw = $r->getContent();
        if (preg_match('/^multipart\/form-data;.*boundary="?([^";]+)"?/i', $ct, $m) !== 1) {
            return [$raw, $ct !== '' ? $ct : null];
        }
        foreach (explode('--'.$m[1], $raw) as $part) {
            $part = ltrim($part, "\r\n");
            if ($part === '' || str_starts_with($part, '--')) {
                continue;
            }
            $sep = strpos($part, "\r\n\r\n");
            if ($sep === false) {
                continue;
            }
            $head = substr($part, 0, $sep);
            $body = substr($part, $sep + 4);
            if (str_ends_with($body, "\r\n")) {
                $body = substr($body, 0, -2);
            }
            // a fájlrész: filename= van benne (a cacheControl/metadata mezőkben nincs)
            if (stripos($head, 'filename=') !== false) {
                $mime = preg_match('/Content-Type:\s*([^\r\n]+)/i', $head, $mm) === 1 ? trim($mm[1]) : null;

                return [$body, $mime];
            }
        }

        return [null, null];
    }

    /** Csak képek és PDF — minden más bináris letöltésként szolgálódik ki, nem futtatható tartalomként. */
    private static function safeMime(?string $declared, string $bytes): string
    {
        $sniff = (new \finfo(\FILEINFO_MIME_TYPE))->buffer($bytes) ?: 'application/octet-stream';
        $allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf'];

        return \in_array($sniff, $allowed, true) ? $sniff : (\in_array($declared, $allowed, true) && $sniff === 'application/octet-stream' ? $declared : 'application/octet-stream');
    }
}
