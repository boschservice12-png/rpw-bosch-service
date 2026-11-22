<?php

declare(strict_types=1);

namespace App\Infrastructure\Storage;

/**
 * A FOTÓTÁR egységes felülete — a kapu (StorageController) csak ezt látja.
 *
 *   local  — a szerver lemeze (pilot, próba, Docker): a fájl a szerveren át jön-megy
 *   s3     — objektumtár (Contabo / Hetzner / AWS): a telefon KÖZVETLENÜL a tárba tölt
 *            és onnan olvas, előre aláírt, egy fájlra szóló, rövid életű URL-lel
 *
 * A jogosultságot (ki, melyik munka) a kapu dönti el MIELŐTT ide ér; itt már csak a
 * cég ($shop) és az út (RPW-<uuid>/név) érkezik. Az s3 a cég azonosítóját a kulcs elejére
 * teszi: <cég>/<munka>/<fájl> — a cégek adata elkülönül, mérhető, egyben kiadható/törölhető.
 */
interface ObjectStore
{
    public const UPLOAD_TTL = 600;
    public const READ_TTL = 3600;

    /** @return array{signedUrl:string, token:string, direct:bool, contentType:?string} */
    public function uploadTicket(string $shop, string $path, bool $upsert, string $baseUrl): array;

    /**
     * @param list<string> $paths
     *
     * @return array<string, ?string> út → olvasási URL (null: nincs ilyen fájl)
     */
    public function readUrls(string $shop, array $paths, string $baseUrl): array;

    public function exists(string $shop, string $path): bool;

    public function remove(string $shop, string $path): void;

    /** A böngészőnek engedélyezendő külső eredet (CSP), vagy null, ha minden a saját szerveren megy. */
    public function browserOrigin(): ?string;
}
