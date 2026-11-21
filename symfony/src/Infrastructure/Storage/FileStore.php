<?php

declare(strict_types=1);

namespace App\Infrastructure\Storage;

/**
 * FÁJLTÁROLÓ helyi lemezen, aláírt, időkorlátos, egy fájlra szóló tokenekkel.
 *
 * A token HMAC-SHA256 (APP_SECRET-ből levezetett kulccsal) a művelet, a
 * tároló, az út, a lejárat és az upsert-jelző fölött — sem az utat, sem a
 * lejáratot nem lehet átírni anélkül, hogy az aláírás elromlana.
 * Az út a kapuban már ellenőrzött (RPW-<uuid>/név); itt még egyszer
 * kizárjuk a kilépést a gyökérből.
 */
final class FileStore
{
    public const BUCKETS = ['rpw-photos'];
    public const MAX_BYTES = 25 * 1024 * 1024;

    private readonly string $key;

    public function __construct(private readonly string $root, string $secret)
    {
        if ($secret === '' || $secret === 'change-me-in-env-local') {
            // fejlesztésben is legyen kulcs, de élesben a .env.local-ból kell jönnie
            $secret = 'rpw-dev-'.$root;
        }
        $this->key = hash_hmac('sha256', 'rpw-storage-v1', $secret, true);
    }

    public static function validBucket(string $b): bool
    {
        return \in_array($b, self::BUCKETS, true);
    }

    public static function validPath(string $p): bool
    {
        return $p !== '' && \strlen($p) <= 220 && !str_contains($p, '..') && !str_contains($p, '//') && !str_starts_with($p, '/')
            && preg_match('#^[A-Za-z0-9_./-]+$#', $p) === 1;
    }

    public function sign(string $op, string $bucket, string $path, int $ttl, bool $upsert = false): string
    {
        $payload = rtrim(strtr(base64_encode(json_encode(['o' => $op, 'b' => $bucket, 'p' => $path, 'e' => time() + $ttl, 'u' => $upsert], \JSON_THROW_ON_ERROR)), '+/', '-_'), '=');

        return $payload.'.'.rtrim(strtr(base64_encode(hash_hmac('sha256', $payload, $this->key, true)), '+/', '-_'), '=');
    }

    /** @return ?array{o:string,b:string,p:string,e:int,u:bool} érvényes token tartalma, vagy null */
    public function verify(string $token, string $op, string $bucket, string $path): ?array
    {
        $parts = explode('.', $token);
        if (\count($parts) !== 2) {
            return null;
        }
        $expect = rtrim(strtr(base64_encode(hash_hmac('sha256', $parts[0], $this->key, true)), '+/', '-_'), '=');
        if (!hash_equals($expect, $parts[1])) {
            return null;
        }
        $d = json_decode((string) base64_decode(strtr($parts[0], '-_', '+/'), true), true);
        if (!\is_array($d) || ($d['o'] ?? null) !== $op || ($d['b'] ?? null) !== $bucket || ($d['p'] ?? null) !== $path || (int) ($d['e'] ?? 0) < time()) {
            return null;
        }

        return $d;
    }

    public function exists(string $bucket, string $path): bool
    {
        return is_file($this->file($bucket, $path));
    }

    public function put(string $bucket, string $path, string $bytes, string $mime): void
    {
        $f = $this->file($bucket, $path);
        if (!is_dir(\dirname($f)) && !mkdir(\dirname($f), 0770, true) && !is_dir(\dirname($f))) {
            throw new \RuntimeException('storage mkdir');
        }
        $tmp = $f.'.tmp-'.bin2hex(random_bytes(4));
        if (file_put_contents($tmp, $bytes) === false || !rename($tmp, $f)) {
            @unlink($tmp);
            throw new \RuntimeException('storage write');
        }
        file_put_contents($f.'.meta', json_encode(['mime' => $mime, 'size' => \strlen($bytes), 'at' => gmdate(\DATE_ATOM)]));
    }

    /** @return ?array{file:string, mime:string} */
    public function get(string $bucket, string $path): ?array
    {
        $f = $this->file($bucket, $path);
        if (!is_file($f)) {
            return null;
        }
        $meta = is_file($f.'.meta') ? json_decode((string) file_get_contents($f.'.meta'), true) : null;

        return ['file' => $f, 'mime' => \is_array($meta) && \is_string($meta['mime'] ?? null) ? $meta['mime'] : 'application/octet-stream'];
    }

    public function remove(string $bucket, string $path): bool
    {
        $f = $this->file($bucket, $path);
        @unlink($f.'.meta');

        return is_file($f) && unlink($f);
    }

    private function file(string $bucket, string $path): string
    {
        if (!self::validBucket($bucket) || !self::validPath($path)) {
            throw new \InvalidArgumentException('bad path');
        }

        return rtrim($this->root, '/').'/'.$bucket.'/'.$path;
    }
}
