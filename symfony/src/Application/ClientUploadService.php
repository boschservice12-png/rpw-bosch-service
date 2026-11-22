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

    /** Az ügyfél-link mögötti NYITOTT munka cége — vagy null (a kapu ekkor 403-at ad, és nem árulja el, miért). */
    public function openJobShop(string $id): ?string
    {
        if (($this->get($id)['ok'] ?? false) !== true) {
            return null;
        }
        $shop = $this->db->fetchOne('SELECT shop_id FROM rpw_jobs WHERE id = :id AND deleted_at IS NULL', ['id' => $id]);

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
            // felső szintű csere (a régi `data || p_patch` mintája)
            $data = array_merge(Sql::decode($row['data']), $patch);
            $v = (int) $row['version'];
            $this->db->executeStatement('UPDATE rpw_jobs SET data = '.Sql::json($this->db, 'd').', version = version + 1, updated_at = :now WHERE id = :id',
                ['d' => Sql::encode($data), 'now' => Sql::ts($this->clock->now()), 'id' => $id]);
            $this->audit->write($row['shop_id'], $id, 'client_whatsapp', 'client_upload', null, ['keys' => array_keys($patch)], $v, $v + 1);

            return ['ok' => true, 'version' => $v + 1];
        });
    }
}
