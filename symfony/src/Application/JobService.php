<?php

declare(strict_types=1);

namespace App\Application;

use App\Domain\Auth\Actor;
use App\Domain\Metrics\WorkMetrics;
use App\Domain\Patch\PatchGuard;
use App\Domain\Workflow\Phase;
use App\Domain\Workflow\PhaseRules;
use App\Domain\Workflow\TransitionDenied;
use App\Domain\Workflow\TransitionEngine;
use App\Infrastructure\Db\Sql;
use Doctrine\DBAL\Connection;
use Psr\Clock\ClockInterface;

/**
 * MUNKÁK — bérlővédetten, verziózárral, auditálva.
 *
 * Minden olvasás és írás a bejelentkezett ember shop_id-jára szűr a
 * SZERVEREN (a régi rendszerben ez kliensoldali szűrés volt: az
 * ARCHITEKTURA „Több-bérlős állapot” ⚠ pontja). Idegen és nem létező
 * munka nem különböztethető meg: mindkettő not_found.
 */
final class JobService
{
    public const ID_PATTERN = '/^[A-Za-z0-9_\-]{1,80}$/';

    public function __construct(
        private readonly Connection $db,
        private readonly AuditLog $audit,
        private readonly TransitionEngine $engine,
        private readonly ClockInterface $clock,
    ) {
    }

    public function list(Actor $a, bool $trashed = false): array
    {
        $rows = $this->db->fetchAllAssociative(
            'SELECT id, data, version, updated_at, deleted_at FROM rpw_jobs WHERE shop_id = :shop AND deleted_at IS '
            .($trashed ? 'NOT NULL' : 'NULL').' ORDER BY updated_at DESC',
            ['shop' => $a->shopId],
        );

        return array_map(fn (array $r) => $this->row($r), $rows);
    }

    public function get(Actor $a, string $id): array
    {
        return $this->row($this->load($a, $id));
    }

    // ── mentés ────────────────────────────────────────────────────────
    public function patch(Actor $a, string $id, array $patch, ?int $expectedVersion, ?string $phase = null): array
    {
        $this->assertId($id);
        if ($patch === [] || array_is_list($patch)) {
            throw new ApiError('bad_request', ['detail' => 'patch must be a non-empty object']);
        }
        $hits = PatchGuard::protectedHits($patch);
        if ($hits !== []) {
            $this->audit->deny($a->shopId, $id, $a->name, null, 'patch', 'protected_workflow_field', ['fields' => $hits]);
            throw new ApiError('protected_workflow_field', ['fields' => $hits]);
        }

        return $this->tx(function () use ($a, $id, $patch, $expectedVersion, $phase) {
            $row = $this->db->fetchAssociative('SELECT shop_id, version, deleted_at FROM rpw_jobs WHERE id = :id'.$this->lock(), ['id' => $id]);

            if ($row === false) {
                if (!$a->can('open')) {
                    $this->audit->deny($a->shopId, $id, $a->name, null, 'create', 'not_allowed', ['need' => 'open']);
                    throw new ApiError('not_allowed', ['need' => 'open']);
                }
                $this->assertPermission($a, $id, $patch);
                $data = PhaseRules::normalize($patch);
                $now = Sql::ts($this->clock->now());
                $this->db->executeStatement(
                    'INSERT INTO rpw_jobs (id, shop_id, data, version, created_at, updated_at) VALUES (:id, :shop, '
                    .Sql::json($this->db, 'data').', 1, :now, :now)',
                    ['id' => $id, 'shop' => $a->shopId, 'data' => Sql::encode($data), 'now' => $now],
                );
                $this->audit->write($a->shopId, $id, $a->name, 'create', $phase, $patch, null, 1);

                return ['id' => $id, 'data' => $data, 'version' => 1];
            }

            if ($row['shop_id'] !== $a->shopId || $row['deleted_at'] !== null) {
                throw new ApiError('not_found');
            }
            $this->assertPermission($a, $id, $patch);
            if ($expectedVersion === null) {
                $this->audit->deny($a->shopId, $id, $a->name, null, 'patch', 'expected_version_required');
                throw new ApiError('expected_version_required');
            }
            $current = $this->load($a, $id);
            $merged = PatchGuard::deepMerge(Sql::decode($current['data']), $patch);

            return $this->save($a, $id, $merged, $expectedVersion, 'patch', $phase, $patch);
        });
    }

    // ── fázisátmenet ──────────────────────────────────────────────────
    public function transition(Actor $a, string $id, int $phase, string $action, ?int $expectedVersion, array $args = []): array
    {
        $this->assertId($id);

        return $this->tx(function () use ($a, $id, $phase, $action, $expectedVersion, $args) {
            $row = $this->load($a, $id, true);
            if ($expectedVersion === null) {
                $this->audit->deny($a->shopId, $id, $a->name, $phase, $action, 'expected_version_required');
                throw new ApiError('expected_version_required');
            }
            try {
                $data = $this->engine->apply(Sql::decode($row['data']), $phase, $action, $a, $this->clock->now(), $args);
            } catch (TransitionDenied $e) {
                $this->audit->deny($a->shopId, $id, $a->name, $phase, $action, $e->errorCode, $e->details);
                throw new ApiError($e->errorCode, $e->details);
            }
            $auditPatch = ['action' => $action, 'reason' => $args['reason'] ?? null, 'rework_id' => $args['rework_id'] ?? null];

            return $this->save($a, $id, $data, $expectedVersion, 'transition:'.$action, (string) $phase, $auditPatch);
        });
    }

    /** UX-előnézet: ugyanaz a lista, amivel a szerver a lezárást dönti el. */
    public function requirements(Actor $a, string $id): array
    {
        $job = PhaseRules::normalize(Sql::decode($this->load($a, $id)['data']));
        $out = [];
        foreach (Phase::ALL as $p) {
            $enter = PhaseRules::canEnter($job, $p);
            $missing = PhaseRules::missing($job, $p);
            $out[(string) $p] = [
                'phase' => $p, 'name' => Phase::name($p), 'status' => PhaseRules::status($job, $p),
                'canEnter' => $enter['allowed'], 'enterReasons' => $enter['reasons'],
                'canComplete' => $missing === [], 'missing' => $missing,
                'blockingWithOverride' => PhaseRules::blocking($job, $p, true),
                'percent' => PhaseRules::percent($job, $p),
            ];
        }

        return ['phase' => $job['phase'], 'inchis' => $job['inchis'], 'phases' => $out];
    }

    public function metrics(Actor $a, string $id): array
    {
        $job = Sql::decode($this->load($a, $id)['data']);
        $now = $this->clock->now();

        return ['work' => WorkMetrics::compute($job, $now), 'insurer' => WorkMetrics::insurerDeadlines($job, $now)];
    }

    public function addGapReason(Actor $a, string $id, string $reason, string $note, ?int $expectedVersion): array
    {
        if (!$a->can('work')) {
            throw new ApiError('not_allowed', ['need' => 'work']);
        }
        if (!\in_array($reason, WorkMetrics::GAP_REASONS, true)) {
            throw new ApiError('unknown_reason', ['allowed' => WorkMetrics::GAP_REASONS]);
        }
        if ($expectedVersion === null) {
            throw new ApiError('expected_version_required');
        }

        return $this->tx(function () use ($a, $id, $reason, $note, $expectedVersion) {
            $row = $this->load($a, $id, true);
            $data = WorkMetrics::withGapReason(Sql::decode($row['data']), $reason, mb_substr($note, 0, 500), $this->clock->now());

            return $this->save($a, $id, $data, $expectedVersion, 'gap_reason', null, ['reason' => $reason]);
        });
    }

    // ── kosár ─────────────────────────────────────────────────────────
    public function trash(Actor $a, string $id): void
    {
        $this->needDelete($a, $id, 'trash');
        $n = $this->db->executeStatement('UPDATE rpw_jobs SET deleted_at = :now, updated_at = :now WHERE id = :id AND shop_id = :shop AND deleted_at IS NULL',
            ['now' => Sql::ts($this->clock->now()), 'id' => $id, 'shop' => $a->shopId]);
        if ($n === 0) {
            $trashed = $this->db->fetchOne('SELECT 1 FROM rpw_jobs WHERE id = :id AND shop_id = :shop AND deleted_at IS NOT NULL', ['id' => $id, 'shop' => $a->shopId]);
            throw new ApiError($trashed ? 'already_trashed' : 'not_found');
        }
        $this->audit->write($a->shopId, $id, $a->name, 'trash');
    }

    public function restore(Actor $a, string $id): void
    {
        $this->needDelete($a, $id, 'restore');
        $n = $this->db->executeStatement('UPDATE rpw_jobs SET deleted_at = NULL, updated_at = :now WHERE id = :id AND shop_id = :shop AND deleted_at IS NOT NULL',
            ['now' => Sql::ts($this->clock->now()), 'id' => $id, 'shop' => $a->shopId]);
        if ($n === 0) {
            throw new ApiError('not_found');
        }
        $this->audit->write($a->shopId, $id, $a->name, 'restore');
    }

    /** Végleges törlés: csak a kosárból, és csak `delete` joggal. */
    public function purge(Actor $a, string $id): void
    {
        $this->needDelete($a, $id, 'purge');
        $n = $this->db->executeStatement('DELETE FROM rpw_jobs WHERE id = :id AND shop_id = :shop AND deleted_at IS NOT NULL', ['id' => $id, 'shop' => $a->shopId]);
        if ($n === 0) {
            throw new ApiError('not_found');
        }
        $this->audit->write($a->shopId, $id, $a->name, 'purge');
    }

    /** Atomi munkaszám: két egyidejű nyitás sem kaphatja ugyanazt. */
    public function nextNumber(Actor $a, string $prefix = 'RPW'): array
    {
        if (!$a->can('open')) {
            throw new ApiError('not_allowed', ['need' => 'open']);
        }
        if (preg_match('/^[A-Z0-9]{1,10}$/', $prefix) !== 1) {
            throw new ApiError('bad_request', ['detail' => 'prefix']);
        }
        $n = (int) $this->db->fetchOne(
            'INSERT INTO rpw_job_counters (shop_id, prefix, n) VALUES (:shop, :prefix, 1)
             ON CONFLICT (shop_id, prefix) DO UPDATE SET n = rpw_job_counters.n + 1 RETURNING n',
            ['shop' => $a->shopId, 'prefix' => $prefix],
        );

        return ['n' => $n, 'number' => $prefix.'-'.str_pad((string) $n, 5, '0', \STR_PAD_LEFT)];
    }

    // ── belső ─────────────────────────────────────────────────────────
    /**
     * ATOMI ÍRÁS: a verziófeltétel az UPDATE-ben van. Ha két ember
     * egyszerre ment, a második version_conflict-ot kap, nem írja felül
     * csendben az elsőt.
     */
    private function save(Actor $a, string $id, array $data, int $expected, string $action, ?string $phase, ?array $auditPatch): array
    {
        $n = $this->db->executeStatement(
            'UPDATE rpw_jobs SET data = '.Sql::json($this->db, 'data').', version = version + 1, updated_at = :now
             WHERE id = :id AND shop_id = :shop AND deleted_at IS NULL AND version = :expected',
            ['data' => Sql::encode($data), 'now' => Sql::ts($this->clock->now()), 'id' => $id, 'shop' => $a->shopId, 'expected' => $expected],
        );
        if ($n === 0) {
            $server = $this->db->fetchOne('SELECT version FROM rpw_jobs WHERE id = :id AND shop_id = :shop AND deleted_at IS NULL', ['id' => $id, 'shop' => $a->shopId]);
            if ($server === false) {
                throw new ApiError('not_found');
            }
            $this->audit->deny($a->shopId, $id, $a->name, null, $action, 'version_conflict', ['server_version' => (int) $server]);
            throw new ApiError('version_conflict', ['server_version' => (int) $server]);
        }
        $this->audit->write($a->shopId, $id, $a->name, $action, $phase, $auditPatch, $expected, $expected + 1);

        return ['id' => $id, 'data' => $data, 'version' => $expected + 1];
    }

    private function load(Actor $a, string $id, bool $forUpdate = false): array
    {
        $this->assertId($id);
        $row = $this->db->fetchAssociative(
            'SELECT id, data, version, updated_at, deleted_at FROM rpw_jobs WHERE id = :id AND shop_id = :shop AND deleted_at IS NULL'.($forUpdate ? $this->lock() : ''),
            ['id' => $id, 'shop' => $a->shopId],
        );
        if ($row === false) {
            throw new ApiError('not_found');
        }

        return $row;
    }

    /** Tranzakció, utána az elutasítás-napló kiírása (siker és hiba esetén is). */
    private function tx(callable $fn): mixed
    {
        try {
            return $this->db->transactional($fn);
        } finally {
            if (!$this->db->isTransactionActive()) {
                $this->audit->flushPending();
            }
        }
    }

    private function lock(): string
    {
        return Sql::isPg($this->db) ? ' FOR UPDATE' : '';
    }

    private function row(array $r): array
    {
        return ['id' => $r['id'], 'data' => Sql::decode($r['data']), 'version' => (int) $r['version'],
            'updated_at' => $r['updated_at'], 'deleted_at' => $r['deleted_at'] ?? null];
    }

    private function assertPermission(Actor $a, string $id, array $patch): void
    {
        $perm = PatchGuard::permission($patch, $a);
        if (!$perm['ok']) {
            $this->audit->deny($a->shopId, $id, $a->name, null, 'patch', 'not_allowed', ['need' => $perm['need'], 'fields' => $perm['fields']]);
            throw new ApiError('not_allowed', ['need' => $perm['need'], 'fields' => $perm['fields']]);
        }
    }

    private function needDelete(Actor $a, string $id, string $op): void
    {
        $this->assertId($id);
        if (!$a->can('delete')) {
            $this->audit->deny($a->shopId, $id, $a->name, null, $op, 'not_allowed', ['need' => 'delete']);
            throw new ApiError('not_allowed', ['need' => 'delete']);
        }
    }

    private function assertId(string $id): void
    {
        if (preg_match(self::ID_PATTERN, $id) !== 1) {
            throw new ApiError('not_found');
        }
    }
}
