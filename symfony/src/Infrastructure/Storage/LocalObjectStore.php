<?php

declare(strict_types=1);

namespace App\Infrastructure\Storage;

/**
 * Helyi lemez — a mai viselkedés VÁLTOZATLANUL (supabase-js-kompatibilis aláírt URL-ek a saját
 * szerverre). A cég azonosítóját nem teszi az útba: a helyi tár egy géphez, egy pilothoz tartozik,
 * és a meglévő próbaadat így olvasható marad.
 */
final class LocalObjectStore implements ObjectStore
{
    public function __construct(private readonly FileStore $files, private readonly string $bucket = 'rpw-photos')
    {
    }

    public function uploadTicket(string $shop, string $path, bool $upsert, string $baseUrl): array
    {
        $token = $this->files->sign('upload', $this->bucket, $path, self::UPLOAD_TTL, $upsert);

        return ['signedUrl' => $baseUrl.'/storage/v1/object/upload/sign/'.$this->bucket.'/'.$path.'?token='.$token,
            'token' => $token, 'direct' => false, 'contentType' => null];
    }

    public function readUrls(string $shop, array $paths, string $baseUrl): array
    {
        $out = [];
        foreach ($paths as $p) {
            $out[$p] = $this->files->exists($this->bucket, $p)
                ? $baseUrl.'/storage/v1/object/sign/'.$this->bucket.'/'.$p.'?token='.$this->files->sign('read', $this->bucket, $p, self::READ_TTL)
                : null;
        }

        return $out;
    }

    public function exists(string $shop, string $path): bool
    {
        return $this->files->exists($this->bucket, $path);
    }

    public function remove(string $shop, string $path): void
    {
        $this->files->remove($this->bucket, $path);
    }

    public function browserOrigin(): ?string
    {
        return null;
    }
}
