<?php

declare(strict_types=1);

namespace App\Application;

use App\Infrastructure\Db\Sql;
use Doctrine\DBAL\Connection;
use Psr\Clock\ClockInterface;

/** Minden mentés és minden elutasított kísérlet naplója (rpw_audit). */
final class AuditLog
{
    public function __construct(private readonly Connection $db, private readonly ClockInterface $clock)
    {
    }

    public function write(string $shopId, ?string $jobId, ?string $actor, string $action, ?string $phase = null,
        ?array $patch = null, ?int $prev = null, ?int $new = null): void
    {
        $this->db->executeStatement(
            'INSERT INTO rpw_audit (job_id, tenant_id, actor, action, phase, patch, prev_version, new_version, created_at)
             VALUES (:job, :shop, :actor, :action, :phase, '.Sql::json($this->db, 'patch').', :prev, :new, :at)',
            ['job' => $jobId, 'shop' => $shopId, 'actor' => $actor, 'action' => $action, 'phase' => $phase,
                'patch' => $patch === null ? null : Sql::encode($patch), 'prev' => $prev, 'new' => $new,
                'at' => Sql::ts($this->clock->now())],
        );
    }

    /** @var list<array> tranzakción belül keletkezett elutasítások — a visszagörgetés UTÁN íródnak ki */
    private array $pending = [];

    /**
     * Elutasítás naplózása — dokumentumtartalom NÉLKÜL. Tranzakción belül
     * az elutasítás a visszagörgetéssel elveszne, ezért ilyenkor sorba áll,
     * és a flushPending() írja ki. Az audit hibája nem rejti el az eredeti hibát.
     */
    public function deny(string $shopId, ?string $jobId, ?string $actor, ?int $phase, string $op, string $code, array $extra = []): void
    {
        $row = [$shopId, $jobId, $actor, 'denied:'.$code, $phase === null ? null : (string) $phase, ['action' => $op] + $extra];
        if ($this->db->isTransactionActive()) {
            $this->pending[] = $row;

            return;
        }
        $this->safeWrite($row);
    }

    public function flushPending(): void
    {
        $rows = $this->pending;
        $this->pending = [];
        foreach ($rows as $row) {
            $this->safeWrite($row);
        }
    }

    private function safeWrite(array $row): void
    {
        try {
            $this->write(...$row);
        } catch (\Throwable) {
        }
    }

    public function forJob(string $shopId, string $jobId, int $limit = 200): array
    {
        $rows = $this->db->fetchAllAssociative(
            'SELECT id, actor, action, phase, patch, prev_version, new_version, created_at FROM rpw_audit
             WHERE tenant_id = :shop AND job_id = :job ORDER BY id DESC LIMIT '.max(1, min(1000, $limit)),
            ['shop' => $shopId, 'job' => $jobId],
        );

        return array_map(static fn (array $r) => ['patch' => $r['patch'] === null ? null : Sql::decode($r['patch'])] + $r, $rows);
    }
}
