<?php

declare(strict_types=1);

namespace App\Infrastructure\Storage;

use Doctrine\DBAL\Connection;

/**
 * A FOTÓK MÁSOLATA EGY MÁSIK SZOLGÁLTATÓNÁL (3-2-1 szabály).
 *
 *  - egy fotó feltöltés után nem változik → EGYSZER kerül át, utána soha többé (nem éjszakai teljes másolás)
 *  - a cél-tárban SOHA nem töröl: a cél-kulcsnak csak írási joga legyen, törlési ne (feltört szerver se törölhessen)
 *  - minden átvitt fájlnál ellenőrzi, hogy VALÓDI JPG / PDF-e (a bájtokból) — az eltérést jelenti, de a másolatot megőrzi
 *  - --reverse: katasztrófa után a másolatból tölti vissza a hiányzó fotókat
 *
 * Forrás: az elsődleges tár — objektumtár (kulcs: <cég>/<munka>/<fájl>) vagy a helyi lemez (a cég a munkából jön).
 * Méret: egy futás a két tár listáját veti össze. ~1 millió fotó fölött egy feltöltési sorra kell váltani (jelezve a TELEPITES-SZERVER.md-ben).
 */
final class ReplicaService
{
    private const BUCKET_DIR = 'rpw-photos';

    public function __construct(
        private readonly ObjectStore $primary,
        private readonly ?S3ObjectStore $replica,
        private readonly Connection $db,
        private readonly string $storageDir,
    ) {
    }

    public function configured(): bool
    {
        return $this->replica !== null;
    }

    /**
     * @return array{source:int, replica_before:int, copied:int, bytes:int, invalid:list<string>, errors:list<string>, missing_after:int}
     */
    public function replicate(bool $dryRun = false): array
    {
        $replica = $this->replica ?? throw new \RuntimeException('a másolat célja nincs beállítva (RPW_REPLICA_*)');
        $have = [];
        foreach ($replica->listKeys() as $k) {
            $have[$k] = true;
        }
        $st = ['source' => 0, 'replica_before' => \count($have), 'copied' => 0, 'bytes' => 0, 'invalid' => [], 'errors' => [], 'missing_after' => 0];
        foreach ($this->sourceKeys() as $key => $read) {
            ++$st['source'];
            if (isset($have[$key])) {
                continue;
            }
            if ($dryRun) {
                ++$st['missing_after'];
                continue;
            }
            try {
                $bytes = $read();
                if ($bytes === null) {
                    continue;   // közben törölték
                }
                if (!self::realFormat($key, $bytes) && \count($st['invalid']) < 50) {
                    $st['invalid'][] = $key;
                }
                $replica->putRaw($key, $bytes, S3ObjectStore::mimeOf($key));
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

    /**
     * Katasztrófa után: a másolatból az elsődleges tárba, ami ott hiányzik. Meglévőt nem ír felül.
     *
     * @return array{replica:int, restored:int, errors:list<string>}
     */
    public function reverse(): array
    {
        $replica = $this->replica ?? throw new \RuntimeException('a másolat célja nincs beállítva (RPW_REPLICA_*)');
        $have = [];
        foreach ($this->sourceKeys() as $k => $_) {
            $have[$k] = true;
        }
        $st = ['replica' => 0, 'restored' => 0, 'errors' => []];
        foreach ($replica->listKeys() as $key) {
            ++$st['replica'];
            if (isset($have[$key])) {
                continue;
            }
            try {
                $bytes = $replica->getRaw($key);
                if ($bytes === null) {
                    continue;
                }
                if ($this->primary instanceof S3ObjectStore) {
                    $this->primary->putRaw($key, $bytes, S3ObjectStore::mimeOf($key));
                } else {
                    $this->writeLocal($key, $bytes);
                }
                ++$st['restored'];
            } catch (\Throwable $e) {
                if (\count($st['errors']) < 20) {
                    $st['errors'][] = $key.': '.mb_substr($e->getMessage(), 0, 120);
                }
            }
        }

        return $st;
    }

    /** A bájtok a kiterjesztésnek megfelelő valódi formátumot hordozzák-e (JPG: FF D8 FF, PDF: %PDF-). */
    public static function realFormat(string $key, string $bytes): bool
    {
        return match (strtolower(pathinfo($key, \PATHINFO_EXTENSION))) {
            'jpg', 'jpeg' => str_starts_with($bytes, "\xFF\xD8\xFF"),
            'pdf' => str_starts_with($bytes, '%PDF-'),
            'png' => str_starts_with($bytes, "\x89PNG"),
            default => true,   // régi, más típusú fájl: megőrizzük, nem ítélünk
        };
    }

    /** @return \Generator<string, callable(): ?string> kulcs → olvasó */
    private function sourceKeys(): \Generator
    {
        if ($this->primary instanceof S3ObjectStore) {
            $p = $this->primary;
            foreach ($p->listKeys() as $k) {
                yield $k => static fn () => $p->getRaw($k);
            }

            return;
        }
        yield from self::localKeys($this->storageDir, $this->shopOf(...));
    }

    /**
     * A helyi fotótár fájljai <cég>/<munka>/<fájl> kulccsal (a cég a munkából).
     *
     * @return \Generator<string, callable(): ?string>
     */
    public static function localKeys(string $storageDir, callable $shopOf): \Generator
    {
        $root = rtrim($storageDir, '/').'/'.self::BUCKET_DIR;
        if (!is_dir($root)) {
            return;
        }
        $shops = [];
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
        foreach ($it as $f) {
            $rel = substr($f->getPathname(), \strlen($root) + 1);
            if (!$f->isFile() || str_ends_with($rel, '.meta') || str_contains($rel, '.tmp-')) {
                continue;
            }
            $job = (string) strtok($rel, '/');
            $shops[$job] ??= $shopOf($job);
            $path = $f->getPathname();
            yield $shops[$job].'/'.$rel => static fn () => is_file($path) ? (string) file_get_contents($path) : null;
        }
    }

    public function shopOf(string $job): string
    {
        $s = $this->db->fetchOne('SELECT shop_id FROM rpw_jobs WHERE id = ?', [$job]);

        return \is_string($s) && $s !== '' ? $s : '_ismeretlen';
    }

    private function writeLocal(string $key, string $bytes): void
    {
        $rel = substr($key, (int) strpos($key, '/') + 1);   // a cég-előtag le (a helyi tár nem használja)
        if (!FileStore::validPath($rel)) {
            throw new \InvalidArgumentException('rossz kulcs');
        }
        $f = rtrim($this->storageDir, '/').'/'.self::BUCKET_DIR.'/'.$rel;
        if (is_file($f)) {
            return;
        }
        if (!is_dir(\dirname($f))) {
            mkdir(\dirname($f), 0770, true);
        }
        file_put_contents($f, $bytes);
        file_put_contents($f.'.meta', json_encode(['mime' => S3ObjectStore::mimeOf($rel), 'size' => \strlen($bytes), 'at' => gmdate(\DATE_ATOM), 'from' => 'replica']));
    }
}
