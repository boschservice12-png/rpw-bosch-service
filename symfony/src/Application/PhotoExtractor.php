<?php

declare(strict_types=1);

namespace App\Application;

use App\Infrastructure\Db\Sql;
use App\Infrastructure\Storage\ObjectStore;
use Doctrine\DBAL\Connection;

/**
 * A MUNKÁBA ÁGYAZOTT RÉGI FOTÓK KIKÖLTÖZTETÉSE a tárba — átálláskor, a régi adat átvitele után.
 *
 * Miért: a mentés a TELJES munkát küldi, az új szerver 2 MB fölött nem fogad (JsonInput::MAX_BYTES).
 * A régi rendszerben a fotók egy része base64-ként a munka adatában ült → ezek a munkák nem lennének menthetők.
 *
 * Mit visz ki (ahol a felület a tárolt fotót IS kezeli — ellenőrizve 2026-11-22):
 *   reconstPhotos[] · closingPhotos[] · photos[] · docs[]   — objektum `data` mezővel → `path` lesz
 *   reconst.rows[].photos[]                                  — szöveg (data:…) → {path}
 * Mást NEM módosít, csak jelent (pl. elements.*.photo — azt a felület szövegként várja).
 *
 * Biztonság:
 *  - előbb a fotó a tárba, VISSZAELLENŐRIZVE — csak utána változik a munka (egy munka egy tranzakció)
 *  - verziózár: ha közben valaki szerkesztette a munkát, kihagyja (újrafuttatva bepótolja)
 *  - tartalom-alapú név (b64_<sha256>.jpg): újrafuttatható, ugyanaz a fotó kétszer nem kerül fel
 *  - csak valódi JPG / PNG / PDF (a bájtokból); minden más marad, és a jelentésben szerepel
 *  - auditsor munkánként; a parancs előtte teljes mentést készít
 */
final class PhotoExtractor
{
    private const ARRAYS = ['reconstPhotos', 'closingPhotos', 'photos', 'docs'];

    public function __construct(private readonly Connection $db, private readonly ObjectStore $store, private readonly AuditLog $audit)
    {
    }

    /**
     * @return array{jobs:int, changed:int, photos:int, before:int, after:int, skipped:list<string>, untouched:list<string>, errors:list<string>, largest:list<array{0:string,1:int,2:int}>}
     */
    public function run(bool $dryRun = false, ?string $onlyJob = null): array
    {
        $st = ['jobs' => 0, 'changed' => 0, 'photos' => 0, 'before' => 0, 'after' => 0, 'skipped' => [], 'untouched' => [], 'errors' => [], 'largest' => []];
        // munkánként külön olvasva: sok és nagy munkánál sem kell mindet egyszerre a memóriában tartani
        $ids = $this->db->fetchFirstColumn('SELECT id FROM rpw_jobs WHERE deleted_at IS NULL'.($onlyJob !== null ? ' AND id = :id' : '').' ORDER BY id',
            $onlyJob !== null ? ['id' => $onlyJob] : []);
        foreach ($ids as $id) {
            $row = $this->db->fetchAssociative('SELECT id, shop_id, data, version FROM rpw_jobs WHERE id = :id', ['id' => $id]);
            if ($row === false) {
                continue;
            }
            ++$st['jobs'];
            $raw = \is_string($row['data']) ? $row['data'] : Sql::encode($row['data']);
            if (!str_contains($raw, 'data:image/') && !str_contains($raw, 'data:application/pdf')) {
                continue;
            }
            try {
                $r = $this->job((string) $row['id'], (string) $row['shop_id'], Sql::decode($row['data']), (int) $row['version'], \strlen($raw), $dryRun);
            } catch (\Throwable $e) {
                $st['errors'][] = $row['id'].': '.mb_substr($e->getMessage(), 0, 160);
                continue;
            }
            $st['before'] += \strlen($raw);
            $st['after'] += $r['after'];
            $st['photos'] += $r['photos'];
            $st['changed'] += $r['photos'] > 0 && !$r['skipped'] ? 1 : 0;
            if ($r['skipped']) {
                $st['skipped'][] = (string) $row['id'];
            }
            foreach ($r['untouched'] as $u) {
                $st['untouched'][] = $row['id'].' '.$u;
            }
            $st['largest'][] = [(string) $row['id'], \strlen($raw), $r['after']];
        }
        usort($st['largest'], static fn ($a, $b) => $b[1] <=> $a[1]);
        $st['largest'] = \array_slice($st['largest'], 0, 10);

        return $st;
    }

    /** @return array{photos:int, after:int, skipped:bool, untouched:list<string>} */
    private function job(string $id, string $shop, array $data, int $version, int $before, bool $dryRun): array
    {
        $n = 0;
        foreach (self::ARRAYS as $arr) {
            if (!\is_array($data[$arr] ?? null)) {
                continue;
            }
            foreach ($data[$arr] as $i => $it) {
                if (\is_array($it) && \is_string($it['data'] ?? null) && ($ref = $this->extract($id, $shop, $it['data'], $dryRun)) !== null) {
                    unset($it['data']);
                    $data[$arr][$i] = $it + $ref;
                    ++$n;
                }
            }
        }
        if (\is_array($data['reconst']['rows'] ?? null)) {
            foreach ($data['reconst']['rows'] as $ri => $row) {
                foreach (\is_array($row['photos'] ?? null) ? $row['photos'] : [] as $pi => $p) {
                    if (\is_string($p) && ($ref = $this->extract($id, $shop, $p, $dryRun)) !== null) {
                        $data['reconst']['rows'][$ri]['photos'][$pi] = $ref;
                        ++$n;
                    }
                }
            }
        }
        $json = Sql::encode($data);
        $untouched = self::findDataUrls($data);
        if ($n === 0 || $dryRun) {
            return ['photos' => $n, 'after' => $dryRun ? \strlen($json) : $before, 'skipped' => false, 'untouched' => $untouched];
        }
        $ok = $this->db->transactional(function () use ($id, $json, $version, $shop, $n, $before) {
            $c = $this->db->executeStatement('UPDATE rpw_jobs SET data = '.Sql::json($this->db, 'data').', version = version + 1 WHERE id = :id AND version = :v AND deleted_at IS NULL',
                ['data' => $json, 'id' => $id, 'v' => $version]);
            if ($c === 1) {
                $this->audit->write($shop, $id, 'system:photo-extract', 'photos_extracted', null, ['photos' => $n, 'bytes_before' => $before, 'bytes_after' => \strlen($json)], $version, $version + 1);
            }

            return $c === 1;
        });

        return ['photos' => $n, 'after' => $ok ? \strlen($json) : $before, 'skipped' => !$ok, 'untouched' => $untouched];
    }

    /** data:…;base64 → a tárba (ellenőrizve), és a hivatkozás. Ami nem valódi JPG/PNG/PDF: null (marad). */
    private function extract(string $job, string $shop, string $dataUrl, bool $dryRun): ?array
    {
        if (preg_match('#^data:([a-z0-9.+/-]+);base64,(.+)$#is', $dataUrl, $m) !== 1) {
            return null;
        }
        $bytes = base64_decode($m[2], true);
        if ($bytes === false || $bytes === '') {
            return null;
        }
        [$ext, $mime] = match (true) {
            str_starts_with($bytes, "\xFF\xD8\xFF") => ['jpg', 'image/jpeg'],
            str_starts_with($bytes, "\x89PNG") => ['png', 'image/png'],
            str_starts_with($bytes, '%PDF-') => ['pdf', 'application/pdf'],
            default => [null, null],
        };
        if ($ext === null) {
            return null;
        }
        $sha = hash('sha256', $bytes);
        $path = $job.'/b64_'.substr($sha, 0, 16).'.'.$ext;
        if (!$dryRun) {
            if (!$this->store->exists($shop, $path)) {
                $this->store->putBytes($shop, $path, $bytes, $mime);
            }
            if (!$this->store->exists($shop, $path)) {
                throw new \RuntimeException('a feltöltés nem igazolható: '.$path.' — a munka változatlan');
            }
        }

        return ['path' => $path, 'mimeType' => $mime, 'size' => \strlen($bytes), 'checksum' => 'sha256:'.$sha, 'migratedFrom' => 'base64'];
    }

    /** @return list<string> a munkában maradt data:-URL-ek helye (JSON-útvonal) — csak jelentéshez */
    private static function findDataUrls(mixed $v, string $at = ''): array
    {
        if (\is_string($v)) {
            return str_starts_with($v, 'data:image/') || str_starts_with($v, 'data:application/') ? [$at.' ('.round(\strlen($v) / 1024).' KB)'] : [];
        }
        $out = [];
        if (\is_array($v)) {
            foreach ($v as $k => $x) {
                array_push($out, ...self::findDataUrls($x, $at.'/'.$k));
            }
        }

        return $out;
    }
}
