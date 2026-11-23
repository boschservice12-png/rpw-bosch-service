<?php

declare(strict_types=1);

namespace App\Application;

use App\Infrastructure\Db\Sql;
use Doctrine\DBAL\Connection;
use Psr\Clock\ClockInterface;

/**
 * ÜGYFÉL-ÚT (WhatsApp-link, belépés nélkül) — a 009_client_upload_path.sql szabályaival.
 * Olvasni csak a feltöltő lap mezőit lehet (telefonszámot, belső jegyzetet NEM),
 * írni csak három kulcsot. A munka azonosítója véletlen UUID: ez a link titka.
 */
final class ClientUploadService
{
    public const ALLOWED = ['clientUploads', 'dosarActe', 'clientGata'];
    /** Caps per job (a client link must not be able to bloat the job record). */
    public const MAX_PER_SLOT = 30;
    public const MAX_UPLOADS = 200;
    private const ENTRY_KEYS = ['key', 'path', 'url', 'name', 'type', 'ts', 'src'];
    private const JOB_RE = '/^RPW-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/';

    public function __construct(private readonly Connection $db, private readonly AuditLog $audit, private readonly ClockInterface $clock)
    {
    }

    public static function validJobId(string $id): bool
    {
        return preg_match(self::JOB_RE, $id) === 1;
    }

    public function get(string $id): array
    {
        $row = self::validJobId($id) ? $this->db->fetchAssociative('SELECT id, data, version FROM rpw_jobs WHERE id = :id AND deleted_at IS NULL', ['id' => $id]) : false;
        if ($row === false) {
            return ['ok' => false, 'error' => 'not_found'];
        }
        $d = Sql::decode($row['data']);

        return ['ok' => true, 'id' => $row['id'], 'version' => (int) $row['version'], 'data' => array_filter([
            'number' => $d['number'] ?? null, 'plate' => $d['plate'] ?? null, 'brand' => $d['brand'] ?? ($d['auto'] ?? null),
            'dosarActe' => $d['dosarActe'] ?? (object) [], 'clientUploads' => $d['clientUploads'] ?? [], 'clientGata' => $d['clientGata'] ?? null,
        ], static fn ($v) => $v !== null)];
    }

    /**
     * Applies what the client link may change:
     *  - dosarActe: per slot, the staff's entries (anything not src=whatsapp) are KEPT; the client's own
     *    entries are replaced by the valid client entries it sends (path <job>/acta_…, src whatsapp).
     *  - clientUploads: append-only union by path (path <job>/client_…).
     *  - clientGata: {at, files} only.
     *
     * @return array{data?: array, error?: string}
     */
    public static function mergeClientPatch(array $data, array $patch, string $jobId): array
    {
        $clean = static function (mixed $e, string $prefix) use ($jobId): ?array {
            if (!\is_array($e) || !\is_string($e['path'] ?? null)) {
                return null;
            }
            if (preg_match('#^'.preg_quote($jobId, '#').'/'.$prefix.'[A-Za-z0-9_.-]{1,160}$#', $e['path']) !== 1) {
                return null;
            }
            $out = [];
            foreach (self::ENTRY_KEYS as $k) {
                if (isset($e[$k]) && \is_scalar($e[$k])) {
                    $out[$k] = mb_substr((string) $e[$k], 0, 2000);
                }
            }
            $out['src'] = 'whatsapp';

            return $out;
        };
        $list = static fn (mixed $v): array => \is_array($v) ? (array_is_list($v) ? $v : [$v]) : [];

        if (\array_key_exists('dosarActe', $patch)) {
            if (!\is_array($patch['dosarActe']) || ($patch['dosarActe'] !== [] && array_is_list($patch['dosarActe']))) {
                return ['error' => 'bad_request'];
            }
            $acte = \is_array($data['dosarActe'] ?? null) ? $data['dosarActe'] : [];
            foreach ($patch['dosarActe'] as $slot => $incoming) {
                if (!\is_string($slot) || preg_match('/^[A-Za-z0-9_]{1,40}$/', $slot) !== 1) {
                    return ['error' => 'bad_request'];
                }
                $staff = array_values(array_filter($list($acte[$slot] ?? null), static fn ($e) => !\is_array($e) || ($e['src'] ?? null) !== 'whatsapp'));
                // The staff also uses the acta_ prefix (rpw-dosar.html) and the client page sends the slot back
                // in full — so an entry whose path the staff already holds is the staff's, never re-tagged.
                $staffPaths = array_flip(array_filter(array_map(static fn ($e) => \is_array($e) && \is_string($e['path'] ?? null) ? $e['path'] : null, $staff)));
                $mine = [];
                foreach ($list($incoming) as $e) {
                    $c = $clean($e, 'acta_');
                    if ($c !== null && !isset($staffPaths[$c['path']])) {
                        $mine[$c['path']] = $c;
                    }
                }
                $mine = array_values($mine);
                $acte[$slot] = \array_slice(array_merge($staff, $mine), 0, max(\count($staff), self::MAX_PER_SLOT));
            }
            $data['dosarActe'] = $acte;
        }
        if (\array_key_exists('clientUploads', $patch)) {
            if (!\is_array($patch['clientUploads'])) {
                return ['error' => 'bad_request'];
            }
            $have = $list($data['clientUploads'] ?? []);
            $seen = [];
            foreach ($have as $e) {
                if (\is_array($e) && \is_string($e['path'] ?? null)) {
                    $seen[$e['path']] = true;
                }
            }
            foreach ($list($patch['clientUploads']) as $e) {
                $c = $clean($e, 'client_');
                if ($c !== null && !isset($seen[$c['path']]) && \count($have) < self::MAX_UPLOADS) {
                    $have[] = $c;
                    $seen[$c['path']] = true;
                }
            }
            $data['clientUploads'] = $have;
        }
        if (\array_key_exists('clientGata', $patch)) {
            $g = $patch['clientGata'];
            if (!\is_array($g) || !\is_string($g['at'] ?? null) || mb_strlen($g['at']) > 40 || !\is_int($g['files'] ?? null) || $g['files'] < 0 || $g['files'] > 1000) {
                return ['error' => 'bad_request'];
            }
            $data['clientGata'] = ['at' => $g['at'], 'files' => $g['files']];
        }

        return ['data' => $data];
    }

    /** Az ügyfél-link mögötti NYITOTT munka cége — vagy null (a kapu ekkor 403-at ad, és nem árulja el, miért). */
    public function openJobShop(string $id): ?string
    {
        if (($this->get($id)['ok'] ?? false) !== true) {
            return null;
        }
        $row = $this->db->fetchAssociative('SELECT shop_id, data FROM rpw_jobs WHERE id = :id AND deleted_at IS NULL', ['id' => $id]);
        if ($row === false || ((Sql::decode($row['data'])['inchis'] ?? false) === true)) {
            return null;   // 2026-11-23: a closed job takes no more client files (the storage gateway answers 403)
        }
        $shop = $row['shop_id'];

        return \is_string($shop) && $shop !== '' ? $shop : null;
    }

    public function upload(string $id, mixed $patch): array
    {
        if (!\is_array($patch) || $patch === [] || array_is_list($patch)) {
            return ['ok' => false, 'error' => 'bad_request'];
        }
        foreach (array_keys($patch) as $k) {
            if (!\in_array($k, self::ALLOWED, true)) {
                return ['ok' => false, 'error' => 'forbidden_field', 'field' => $k];
            }
        }

        return $this->db->transactional(function () use ($id, $patch) {
            $row = self::validJobId($id) ? $this->db->fetchAssociative('SELECT shop_id, data, version FROM rpw_jobs WHERE id = :id AND deleted_at IS NULL'
                .(Sql::isPg($this->db) ? ' FOR UPDATE' : ''), ['id' => $id]) : false;
            if ($row === false) {
                return ['ok' => false, 'error' => 'not_found'];
            }
            // 2026-11-23 (AUDIT-SYMFONY-LOCALHOST §4): NO top-level replace any more. A closed job takes
            // nothing; the staff's documents are never overwritten; only valid client entries are kept.
            $data = Sql::decode($row['data']);
            if (($data['inchis'] ?? false) === true) {
                return ['ok' => false, 'error' => 'closed'];
            }
            $merged = self::mergeClientPatch($data, $patch, $id);
            if (isset($merged['error'])) {
                return ['ok' => false, 'error' => $merged['error']];
            }
            $data = $merged['data'];
            $v = (int) $row['version'];
            $this->db->executeStatement('UPDATE rpw_jobs SET data = '.Sql::json($this->db, 'd').', version = version + 1, updated_at = :now WHERE id = :id',
                ['d' => Sql::encode($data), 'now' => Sql::ts($this->clock->now()), 'id' => $id]);
            $this->audit->write($row['shop_id'], $id, 'client_whatsapp', 'client_upload', null, ['keys' => array_keys($patch)], $v, $v + 1);

            return ['ok' => true, 'version' => $v + 1];
        });
    }
}
