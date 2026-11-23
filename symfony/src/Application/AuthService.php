<?php

declare(strict_types=1);

namespace App\Application;

use App\Domain\Auth\Actor;
use App\Domain\Auth\PinPolicy;
use App\Infrastructure\Db\Sql;
use Doctrine\DBAL\Connection;
use Psr\Clock\ClockInterface;
use Symfony\Component\Uid\Uuid;

/**
 * BELÉPÉS — név + PIN, a 002/007/010 migrációk logikájával.
 *
 *  · a nyers tokent SOHA nem tároljuk, csak a sha256 hash-ét
 *  · 12 órás munkamenet, használatra hosszabbodik (csúszó lejárat)
 *  · 10 rossz PIN / 15 perc → 15 perc zár (dolgozónként)
 *  · a PIN bcrypt; a hash $2a$ előtaggal készül, hogy a régi
 *    rendszer (pgcrypto) is ellenőrizni tudja a párhuzamos üzem alatt
 */
final class AuthService
{
    private const EXTEND_AFTER_SECONDS = 600;

    public function __construct(
        private readonly Connection $db,
        private readonly ClockInterface $clock,
        private readonly SecurityLog $sec,
        // ABSZOLÚT felső határ: a csúszó lejárat sem hosszabbíthat ezen túl (egy műszak + tartalék)
        #[\Symfony\Component\DependencyInjection\Attribute\Autowire('%env(int:default:rpw.session_max_hours:RPW_SESSION_MAX_HOURS)%')]
        private readonly int $sessionMaxHours = 24,
    ) {
    }

    /** Névsor a belépéshez — PIN nélkül, szándékosan nyilvános. */
    public function roster(string $shopId): array
    {
        if (!Uuid::isValid($shopId)) {
            return [];
        }

        return array_map(static fn (array $r) => ['id' => $r['id'], 'name' => $r['name'], 'role' => $r['role'], 'hasPin' => (bool) $r['has_pin']],
            $this->db->fetchAllAssociative(
                'SELECT e.id, e.name, COALESCE(r.label, e.role_code) AS role, CASE WHEN e.pin_hash IS NULL THEN 0 ELSE 1 END AS has_pin
                 FROM rpw_employees e LEFT JOIN rpw_roles r ON r.shop_id = e.shop_id AND r.code = e.role_code
                 WHERE e.shop_id = :shop AND e.active = :t ORDER BY e.name',
                ['shop' => $shopId, 't' => true], ['t' => \Doctrine\DBAL\ParameterType::BOOLEAN],
            ));
    }

    /** @return array{token:string, employee:array} */
    public function login(string $shopId, string $employeeId, string $pin): array
    {
        if (!Uuid::isValid($shopId) || !Uuid::isValid($employeeId)) {
            throw new ApiError('not_found', [], 404);
        }
        $e = $this->db->fetchAssociative('SELECT id, pin_hash FROM rpw_employees WHERE id = :id AND shop_id = :shop AND active = :t',
            ['id' => $employeeId, 'shop' => $shopId, 't' => true], ['t' => \Doctrine\DBAL\ParameterType::BOOLEAN]);
        if ($e === false) {
            $this->sec->event('login_unknown_employee', ['employee' => $employeeId], $shopId);
            throw new ApiError('not_found', [], 404);
        }
        $name = (string) $this->db->fetchOne('SELECT name FROM rpw_employees WHERE id = :id', ['id' => $employeeId]);
        $now = $this->clock->now();
        $windowStart = $now->modify('-'.PinPolicy::LOCK_MINUTES.' minutes');
        $att = $this->db->fetchAssociative('SELECT window_start, n FROM rpw_pin_attempt WHERE employee_id = :id', ['id' => $employeeId]);
        $inWindow = $att !== false && new \DateTimeImmutable((string) $att['window_start']) > $windowStart;
        if ($inWindow && (int) $att['n'] >= PinPolicy::MAX_ATTEMPTS) {
            $this->sec->event('login_while_locked', [], $shopId, $name);
            throw new ApiError('locked');
        }

        if ($e['pin_hash'] === null || !password_verify($pin, (string) $e['pin_hash'])) {
            $this->db->executeStatement(
                'INSERT INTO rpw_pin_attempt (employee_id, window_start, n) VALUES (:id, :now, 1)
                 ON CONFLICT (employee_id) DO UPDATE SET
                   n = CASE WHEN rpw_pin_attempt.window_start > :ws THEN rpw_pin_attempt.n + 1 ELSE 1 END,
                   window_start = CASE WHEN rpw_pin_attempt.window_start > :ws THEN rpw_pin_attempt.window_start ELSE :now END',
                ['id' => $employeeId, 'now' => Sql::ts($now), 'ws' => Sql::ts($windowStart)],
            );
            $n = (int) $this->db->fetchOne('SELECT n FROM rpw_pin_attempt WHERE employee_id = :id', ['id' => $employeeId]);
            $this->sec->event($n >= PinPolicy::MAX_ATTEMPTS ? 'account_locked' : 'bad_pin', ['attempts' => $n], $shopId, $name);
            throw new ApiError('bad_pin');
        }

        $this->db->executeStatement('DELETE FROM rpw_pin_attempt WHERE employee_id = :id', ['id' => $employeeId]);
        $token = bin2hex(random_bytes(32));
        $this->db->executeStatement(
            'INSERT INTO rpw_sessions (token_hash, employee_id, shop_id, created_at, expires_at) VALUES (:h, :e, :s, :now, :exp)',
            ['h' => hash('sha256', $token), 'e' => $employeeId, 's' => $shopId, 'now' => Sql::ts($now),
                'exp' => Sql::ts($now->modify('+'.PinPolicy::SESSION_HOURS.' hours'))],
        );
        $this->db->executeStatement('UPDATE rpw_employees SET last_login = :now WHERE id = :id', ['now' => Sql::ts($now), 'id' => $employeeId]);
        $this->sec->event('login_ok', [], $shopId, $name);

        return ['token' => $token, 'employee' => $this->actorFromToken($token)?->toArray()];
    }

    public function logout(string $token): void
    {
        $a = $this->actorFromToken($token);
        if ($a !== null) {
            $this->sec->event('logout', [], $a->shopId, $a->name);
        }
        $this->db->executeStatement('UPDATE rpw_sessions SET revoked_at = :now WHERE token_hash = :h AND revoked_at IS NULL',
            ['now' => Sql::ts($this->clock->now()), 'h' => hash('sha256', $token)]);
    }

    /** A rpw__ctx megfelelője: érvényes token → Actor, minden más → null. */
    public function actorFromToken(?string $token): ?Actor
    {
        if ($token === null || \strlen($token) < 32 || \strlen($token) > 256) {
            return null;
        }
        $h = hash('sha256', $token);
        $r = $this->db->fetchAssociative(
            'SELECT e.id, e.name, e.shop_id, e.role_code, e.active, ro.can, s.expires_at, s.revoked_at, s.created_at
             FROM rpw_sessions s JOIN rpw_employees e ON e.id = s.employee_id
             LEFT JOIN rpw_roles ro ON ro.shop_id = e.shop_id AND ro.code = e.role_code AND ro.active = :t
             WHERE s.token_hash = :h AND s.shop_id = e.shop_id',
            ['h' => $h, 't' => true], ['t' => \Doctrine\DBAL\ParameterType::BOOLEAN],
        );
        $now = $this->clock->now();
        if ($r === false || $r['revoked_at'] !== null || !$r['active']) {
            return null;
        }
        $exp = new \DateTimeImmutable((string) $r['expires_at']);
        if ($exp <= $now) {
            return null;
        }
        // abszolút határ a létrehozástól — a használat sem tartja életben örökké
        $hardEnd = $r['created_at'] !== null
            ? (new \DateTimeImmutable((string) $r['created_at']))->modify('+'.$this->sessionMaxHours.' hours') : null;
        if ($hardEnd !== null && $hardEnd <= $now) {
            return null;
        }
        // csúszó lejárat — legfeljebb 10 percenként egy írás, de az abszolút határon túl soha
        $fresh = $now->modify('+'.PinPolicy::SESSION_HOURS.' hours');
        if ($hardEnd !== null && $fresh > $hardEnd) {
            $fresh = $hardEnd;
        }
        if ($fresh->getTimestamp() - $exp->getTimestamp() > self::EXTEND_AFTER_SECONDS) {
            $this->db->executeStatement('UPDATE rpw_sessions SET expires_at = :exp WHERE token_hash = :h', ['exp' => Sql::ts($fresh), 'h' => $h]);
        }

        return new Actor((string) $r['id'], (string) $r['name'], (string) $r['shop_id'], $r['role_code'], Actor::normalizeCaps($r['can']));
    }

    /**
     * A felület által várt dolgozói rekord: a `role` a szerepkör FELIRATA
     * (pl. „Műszakvezető”), mert a kliens RPWRoles.mapEmployeeRole ezt képezi le.
     */
    public function employeeInfo(Actor $a): array
    {
        $label = $a->roleCode === null ? null : $this->db->fetchOne(
            'SELECT label FROM rpw_roles WHERE shop_id = :s AND code = :c', ['s' => $a->shopId, 'c' => $a->roleCode]);

        return ['id' => $a->id, 'name' => $a->name, 'shop_id' => $a->shopId, 'role' => $label === false || $label === null ? $a->roleCode : $label,
            'role_code' => $a->roleCode, 'department' => null, 'can' => (object) $a->can];
    }

    /** PIN beállítása: saját mindig, másé csak `team` joggal. Gyenge vagy ütköző PIN tiltva. */
    /** @param ?string $keepToken a hívó saját munkamenete (saját PIN-cserénél megmarad) */
    public function setPin(Actor $a, string $employeeId, string $pin, ?string $keepToken = null): void
    {
        if ($employeeId !== $a->id && !$a->can('team')) {
            throw new ApiError('not_allowed', ['need' => 'team']);
        }
        $pin = trim($pin);
        if (($err = PinPolicy::validate($pin)) !== null) {
            throw new ApiError($err);
        }
        // 2026-11-23 (AUDIT-SYMFONY-LOCALHOST §3.2): NO uniqueness check against colleagues' PINs.
        // Login is by employee + PIN, so uniqueness is not needed — and a "pin_taken" answer let any
        // worker discover a colleague's PIN by trying it as their own (the roster shows whose it is).
        $hash = '$2a$'.substr(password_hash($pin, \PASSWORD_BCRYPT, ['cost' => 10]), 4);
        $now = $this->clock->now();
        $n = $this->db->executeStatement('UPDATE rpw_employees SET pin_hash = :h, pin_set_at = :now WHERE id = :id AND shop_id = :shop AND active = :t',
            ['h' => $hash, 'now' => Sql::ts($now), 'id' => $employeeId, 'shop' => $a->shopId, 't' => true], ['t' => \Doctrine\DBAL\ParameterType::BOOLEAN]);
        if ($n === 0) {
            throw new ApiError('not_found');
        }
        $this->db->executeStatement('DELETE FROM rpw_pin_attempt WHERE employee_id = :id', ['id' => $employeeId]);
        // új PIN → a dolgozó MINDEN más munkamenete megszűnik (pl. egy elveszett telefonon)
        $this->db->executeStatement('UPDATE rpw_sessions SET revoked_at = :now WHERE employee_id = :id AND revoked_at IS NULL AND token_hash <> :keep',
            ['now' => Sql::ts($now), 'id' => $employeeId, 'keep' => $keepToken !== null ? hash('sha256', $keepToken) : '']);
        $this->sec->event('pin_set', ['employee' => $employeeId, 'self' => $a->id === $employeeId], $a->shopId, $a->name);
        $this->db->executeStatement('INSERT INTO rpw_pin_log (shop_id, employee_id, set_by, self_set, created_at) VALUES (:s, :e, :b, :self, :now)',
            ['s' => $a->shopId, 'e' => $employeeId, 'b' => $a->id, 'self' => $a->id === $employeeId, 'now' => Sql::ts($now)],
            ['self' => \Doctrine\DBAL\ParameterType::BOOLEAN]);
    }

    /** Ki hány rossz PIN-nél tart, ki zárolt — csak `team` joggal, csak a saját szervizről. */
    public function pinStatus(Actor $a): array
    {
        if (!$a->can('team')) {
            throw new ApiError('not_allowed', ['need' => 'team']);
        }
        $ws = $this->clock->now()->modify('-'.PinPolicy::LOCK_MINUTES.' minutes');
        $rows = $this->db->fetchAllAssociative(
            'SELECT e.id, e.name, p.n, p.window_start FROM rpw_pin_attempt p JOIN rpw_employees e ON e.id = p.employee_id
             WHERE e.shop_id = :shop AND p.window_start > :ws', ['shop' => $a->shopId, 'ws' => Sql::ts($ws)]);

        $now = $this->clock->now()->getTimestamp();

        return array_map(static fn (array $r) => ['id' => $r['id'], 'name' => $r['name'], 'attempts' => (int) $r['n'],
            'locked' => (int) $r['n'] >= PinPolicy::MAX_ATTEMPTS,
            'minutesLeft' => max(0, (int) ceil(((new \DateTimeImmutable((string) $r['window_start']))->getTimestamp() + PinPolicy::LOCK_MINUTES * 60 - $now) / 60))], $rows);
    }

    /** @return int a törölt próbálkozás-sorok száma */
    public function unlockPin(Actor $a, string $employeeId): int
    {
        if (!$a->can('team')) {
            throw new ApiError('not_allowed', ['need' => 'team']);
        }
        if (!Uuid::isValid($employeeId) || $this->db->fetchOne('SELECT 1 FROM rpw_employees WHERE id = :id AND shop_id = :shop', ['id' => $employeeId, 'shop' => $a->shopId]) === false) {
            throw new ApiError('not_found');
        }

        $n = (int) $this->db->executeStatement('DELETE FROM rpw_pin_attempt WHERE employee_id = :id', ['id' => $employeeId]);
        $this->sec->event('pin_unlock', ['employee' => $employeeId, 'cleared' => $n], $a->shopId, $a->name);

        return $n;
    }
}
