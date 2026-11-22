<?php

declare(strict_types=1);

namespace App\Infrastructure\Storage;

/**
 * A MEGLÉVŐ FOTÓK ÁTVITELE az objektumtárba — átálláskor, egyszer (újrafuttatható: csak a hiányzót viszi).
 *
 * Forrás:
 *  - helyi lemez (staging, Docker-próba): <tár>/rpw-photos/<munka>/<fájl>
 *  - a RÉGI rendszer Supabase-tára (S3-protokollon): <munka>/<fájl> — cég-előtag nélkül
 * A cél kulcsa mindig <cég>/<munka>/<fájl>; a cég a munkából jön (az adatbázisból) — ezért az ADATOK
 * átvitele után fut. Ismeretlen munka fotója „_ismeretlen/” alá kerül és a jelentésben szerepel: semmi nem vész el.
 * A munkák adatában (photoKeys, dosarActe) lévő utak NEM változnak — a cég-előtagot a kapu teszi hozzá.
 */
final class MigrateService
{
    public function __construct(private readonly ObjectStore $primary, private readonly ReplicaService $replica)
    {
    }

    /**
     * @param iterable<string, callable(): ?string> $source kulcs (<cég>/<munka>/<fájl>) → olvasó
     *
     * @return array{source:int, already:int, copied:int, bytes:int, unknownJob:int, invalid:list<string>, errors:list<string>, missing_after:int, per_shop:array<string,int>}
     */
    public function run(iterable $source, bool $dryRun = false): array
    {
        $target = $this->primary instanceof S3ObjectStore ? $this->primary
            : throw new \RuntimeException('a cél az objektumtár: előbb RPW_STORAGE_BACKEND=s3 (TELEPITES-SZERVER.md 5b)');
        $have = [];
        foreach ($target->listKeys() as $k) {
            $have[$k] = true;
        }
        $st = ['source' => 0, 'already' => 0, 'copied' => 0, 'bytes' => 0, 'unknownJob' => 0, 'invalid' => [], 'errors' => [], 'missing_after' => 0, 'per_shop' => []];
        foreach ($source as $key => $read) {
            ++$st['source'];
            $shop = (string) strtok($key, '/');
            $st['per_shop'][$shop] = ($st['per_shop'][$shop] ?? 0) + 1;
            if ($shop === '_ismeretlen') {
                ++$st['unknownJob'];
            }
            if (isset($have[$key])) {
                ++$st['already'];
                continue;
            }
            if ($dryRun) {
                ++$st['missing_after'];
                continue;
            }
            try {
                $bytes = $read();
                if ($bytes === null) {
                    continue;
                }
                if (!ReplicaService::realFormat($key, $bytes) && \count($st['invalid']) < 50) {
                    $st['invalid'][] = $key;
                }
                $target->putRaw($key, $bytes, S3ObjectStore::mimeOf($key));
                ++$st['copied'];
                $st['bytes'] += \strlen($bytes);
            } catch (\Throwable $e) {
                ++$st['missing_after'];
                if (\count($st['errors']) < 20) {
                    $st['errors'][] = $key.': '.mb_substr($e->getMessage(), 0, 120);
                }
            }
        }

        return $st;
    }

    /** @return \Generator<string, callable(): ?string> */
    public function fromLocal(string $storageDir): \Generator
    {
        yield from ReplicaService::localKeys($storageDir, $this->replica->shopOf(...));
    }

    /**
     * A régi Supabase-tár (vagy bármely S3) kulcsai — cég-előtag nélkül — <cég>/… kulcsra fordítva.
     *
     * @return \Generator<string, callable(): ?string>
     */
    public function fromLegacyS3(S3ObjectStore $legacy): \Generator
    {
        $shops = [];
        foreach ($legacy->listKeys() as $k) {
            if (!FileStore::validPath($k) || !str_contains($k, '/')) {
                continue;   // a régi tárban lehet szemét (pl. „.emptyFolderPlaceholder”) — nem munka-fotó
            }
            $job = (string) strtok($k, '/');
            $shops[$job] ??= $this->replica->shopOf($job);
            yield $shops[$job].'/'.$k => static fn () => $legacy->getRaw($k);
        }
    }
}
