<?php

declare(strict_types=1);

namespace App\Application;

use App\Domain\Auth\Actor;
use App\Infrastructure\Db\Sql;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;
use Doctrine\DBAL\Types\Types;
use Psr\Clock\ClockInterface;
use Symfony\Component\Uid\Uuid;

/**
 * CSAPAT, SZEREPKÖRÖK, POSZTOK — a 004_staff_posts_legacy.sql szabályaival.
 *
 *  · a szerviz nem maradhat csapatkezelő (`team` jog) nélkül
 *  · kilépéskor a PIN törlődik, a munkamenetek visszavonódnak
 *  · idegen szerviz dolgozója nem tehető posztra
 */
final class TeamService
{
    private const B = ['t' => ParameterType::BOOLEAN];

    public function __construct(private readonly Connection $db, private readonly ClockInterface $clock, private readonly AuditLog $audit)
    {
    }

    public function team(Actor $a, bool $includeLeft): array
    {
        $this->need($a, 'team');
        $emps = $this->db->fetchAllAssociative(
            'SELECT id, name, role_code, phone, active, pin_hash, pin_set_at, last_login, left_at FROM rpw_employees
             WHERE shop_id = :s'.($includeLeft ? '' : ' AND active = :t').' ORDER BY active DESC, name',
            ['s' => $a->shopId] + ($includeLeft ? [] : ['t' => true]), $includeLeft ? [] : self::B);
        $roles = $this->db->fetchAllAssociative('SELECT code, label, can, sort_order, active FROM rpw_roles WHERE shop_id = :s ORDER BY sort_order, code', ['s' => $a->shopId]);

        return [
            'employees' => array_map(static fn (array $e) => ['id' => $e['id'], 'name' => $e['name'], 'role_code' => $e['role_code'],
                'phone' => $e['phone'], 'active' => (bool) $e['active'], 'hasPin' => $e['pin_hash'] !== null,
                'pin_set_at' => $e['pin_set_at'], 'last_login' => $e['last_login'], 'left_at' => $e['left_at']], $emps),
            'roles' => array_map(static fn (array $r) => ['code' => $r['code'], 'label' => $r['label'], 'can' => (object) Sql::decode($r['can']),
                'sort_order' => (int) $r['sort_order'], 'active' => (bool) $r['active']], $roles),
        ];
    }

    public function saveEmployee(Actor $a, ?string $id, ?string $name, ?string $roleCode, ?string $phone, ?bool $active): string
    {
        $this->need($a, 'team');
        $name = $name === null ? null : trim($name);
        if ($id === null) {
            if ($name === null || $name === '') {
                throw new ApiError('bad_request', ['detail' => 'name']);
            }
            $nid = Uuid::v4()->toRfc4122();
            $this->db->insert('rpw_employees', ['id' => $nid, 'shop_id' => $a->shopId, 'name' => $name, 'role_code' => $roleCode,
                'phone' => $phone, 'active' => $active ?? true], ['active' => ParameterType::BOOLEAN]);
            $this->audit->write($a->shopId, null, $a->name, 'employee_create', null, ['employee_id' => $nid, 'role_code' => $roleCode]);

            return $nid;
        }
        if (!Uuid::isValid($id)) {
            throw new ApiError('not_found');
        }

        return $this->db->transactional(function () use ($a, $id, $name, $roleCode, $phone, $active) {
            if ($active === false || $roleCode !== null) {
                // marad-e más aktív csapatkezelő, ha ez az ember kiesik / szerepet vált?
                $others = 0;
                foreach ($this->db->fetchAllAssociative('SELECT e.id, r.can FROM rpw_employees e JOIN rpw_roles r ON r.shop_id = e.shop_id AND r.code = e.role_code
                    WHERE e.shop_id = :s AND e.active = :t AND e.id <> :id', ['s' => $a->shopId, 't' => true, 'id' => $id], self::B) as $r) {
                    $others += (int) ((Sql::decode($r['can'])['team'] ?? false) === true);
                }
                $newRoleHasTeam = $roleCode === null ? null : ((Sql::decode($this->db->fetchOne('SELECT can FROM rpw_roles WHERE shop_id = :s AND code = :c', ['s' => $a->shopId, 'c' => $roleCode]) ?: '{}')['team'] ?? false) === true);
                if ($others === 0 && ($active === false || $newRoleHasTeam === false)) {
                    throw new ApiError('last_manager_lock', [], 409);
                }
            }
            $cur = $this->db->fetchAssociative('SELECT name, role_code, phone, active FROM rpw_employees WHERE id = :id AND shop_id = :s', ['id' => $id, 's' => $a->shopId]);
            if ($cur === false) {
                throw new ApiError('not_found');
            }
            $set = ['name' => $name ?? $cur['name'], 'role_code' => $roleCode ?? $cur['role_code'], 'phone' => $phone ?? $cur['phone'],
                'active' => $active ?? (bool) $cur['active']];
            $types = ['active' => ParameterType::BOOLEAN];
            if ($active === false) {
                $set += ['left_at' => Sql::ts($this->clock->now()), 'pin_hash' => null];
                $this->db->executeStatement('UPDATE rpw_sessions SET revoked_at = :now WHERE employee_id = :id AND revoked_at IS NULL',
                    ['now' => Sql::ts($this->clock->now()), 'id' => $id]);
            } elseif ($active === true) {
                $set['left_at'] = null;
            }
            $this->db->update('rpw_employees', $set, ['id' => $id, 'shop_id' => $a->shopId], $types);
            $this->audit->write($a->shopId, null, $a->name, 'employee_update', null, ['employee_id' => $id, 'active' => $set['active'], 'role_code' => $set['role_code']]);

            return $id;
        });
    }

    public function saveRole(Actor $a, string $code, string $label, mixed $can, ?int $sort, ?bool $active): void
    {
        $this->need($a, 'team');
        if (preg_match('/^[a-z0-9_]{2,40}$/', $code) !== 1 || trim($label) === '') {
            throw new ApiError('bad_request', ['detail' => 'code/label']);
        }
        $caps = \App\Domain\Auth\Actor::normalizeCaps($can);
        // a saját szerepéből senki nem veheti el a csapatkezelést, ha ő az utolsó
        $exists = $this->db->fetchOne('SELECT id FROM rpw_roles WHERE shop_id = :s AND code = :c', ['s' => $a->shopId, 'c' => $code]);
        $row = ['label' => trim($label), 'can' => (object) $caps, 'sort_order' => $sort ?? 100, 'active' => $active ?? true];
        $types = ['can' => Types::JSON, 'active' => ParameterType::BOOLEAN];
        if ($exists === false) {
            $this->db->insert('rpw_roles', ['id' => Uuid::v4()->toRfc4122(), 'shop_id' => $a->shopId, 'code' => $code] + $row, $types);
        } else {
            $this->db->update('rpw_roles', $row, ['id' => $exists], $types);
        }
        $this->audit->write($a->shopId, null, $a->name, 'role_save', null, ['code' => $code, 'can' => $caps]);
    }

    public function posts(Actor $a): array
    {
        return array_map(static fn (array $r) => ['code' => $r['code'], 'label' => $r['label'], 'note' => $r['note'], 'employee_id' => $r['employee_id'],
            'employee_name' => $r['employee_name'], 'sort_order' => (int) $r['sort_order'], 'active' => (bool) $r['active']],
            $this->db->fetchAllAssociative('SELECT p.code, p.label, p.note, p.employee_id, x.name AS employee_name, p.sort_order, p.active
                FROM rpw_posts p LEFT JOIN rpw_employees x ON x.id = p.employee_id WHERE p.shop_id = :s AND p.active = :t ORDER BY p.sort_order, p.code',
                ['s' => $a->shopId, 't' => true], self::B));
    }

    public function assignPost(Actor $a, string $code, ?string $employeeId): void
    {
        $this->need($a, 'posts');
        if ($employeeId !== null && (!Uuid::isValid($employeeId) || $this->db->fetchOne('SELECT 1 FROM rpw_employees WHERE id = :id AND shop_id = :s AND active = :t',
            ['id' => $employeeId, 's' => $a->shopId, 't' => true], self::B) === false)) {
            throw new ApiError('not_found');
        }
        if ($this->db->update('rpw_posts', ['employee_id' => $employeeId], ['shop_id' => $a->shopId, 'code' => $code]) === 0) {
            throw new ApiError('not_found');
        }
    }

    public function upsertPost(Actor $a, string $code, string $label, ?string $note, ?int $sort, ?bool $active): void
    {
        $this->need($a, 'posts');
        if (preg_match('/^[A-Z0-9_]{2,40}$/', $code) !== 1 || trim($label) === '') {
            throw new ApiError('bad_request', ['detail' => 'code/label']);
        }
        $row = ['label' => trim($label), 'note' => $note, 'sort_order' => $sort ?? 100, 'active' => $active ?? true];
        $types = ['active' => ParameterType::BOOLEAN];
        $id = $this->db->fetchOne('SELECT id FROM rpw_posts WHERE shop_id = :s AND code = :c', ['s' => $a->shopId, 'c' => $code]);
        if ($id === false) {
            $this->db->insert('rpw_posts', ['id' => Uuid::v4()->toRfc4122(), 'shop_id' => $a->shopId, 'code' => $code] + $row, $types);
        } else {
            $this->db->update('rpw_posts', $row, ['id' => $id], $types);
        }
    }

    private function need(Actor $a, string $cap): void
    {
        if (!$a->can($cap)) {
            throw new ApiError('not_allowed', ['need' => $cap]);
        }
    }
}
