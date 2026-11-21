<?php

declare(strict_types=1);

namespace App\Infrastructure\Db;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Schema\Column;
use Doctrine\DBAL\Schema\Index;
use Doctrine\DBAL\Schema\PrimaryKeyConstraint;
use Doctrine\DBAL\Schema\Table;
use Doctrine\DBAL\Schema\UniqueConstraint;
use Doctrine\DBAL\Types\Types;

/**
 * Az RPW-táblák sémája — a _migrations/001 (+004/007) szerkezetével
 * AZONOS oszlopnevekkel, hogy az új backend a meglévő adatbázison is
 * fusson (párhuzamos üzem). Friss telepítéshez és tesztekhez:
 * `bin/console rpw:db:init`. Meglévő éles adatbázison NEM kell futtatni.
 */
final class RpwSchema
{
    /**
     * Oszlop: [név, típus, notnull=true, extra=[]] — extra: length, autoincrement, default.
     * @var array<string, array{cols: list<array>, pk: list<string>, idx?: list<list<string>>, uniq?: list<list<string>>}>
     */
    private const TABLES = [
        'shops' => ['cols' => [['id', Types::GUID], ['name', Types::TEXT], ['created_at', Types::DATETIMETZ_IMMUTABLE, false]], 'pk' => ['id']],
        'rpw_roles' => ['cols' => [['id', Types::GUID], ['shop_id', Types::GUID], ['code', Types::TEXT], ['label', Types::TEXT],
            ['can', Types::JSONB], ['sort_order', Types::INTEGER, true, ['default' => 100]], ['active', Types::BOOLEAN, true, ['default' => true]]],
            'pk' => ['id'], 'uniq' => [['shop_id', 'code']]],
        'rpw_employees' => ['cols' => [['id', Types::GUID], ['shop_id', Types::GUID], ['name', Types::TEXT], ['role_code', Types::TEXT, false],
            ['phone', Types::TEXT, false], ['pin_hash', Types::TEXT, false], ['pin_set_at', Types::DATETIMETZ_IMMUTABLE, false],
            ['active', Types::BOOLEAN, true, ['default' => true]], ['left_at', Types::DATETIMETZ_IMMUTABLE, false],
            ['last_login', Types::DATETIMETZ_IMMUTABLE, false]], 'pk' => ['id'], 'idx' => [['shop_id']]],
        'rpw_sessions' => ['cols' => [['token_hash', Types::STRING, true, ['length' => 64]], ['employee_id', Types::GUID], ['shop_id', Types::GUID],
            ['created_at', Types::DATETIMETZ_IMMUTABLE, false], ['expires_at', Types::DATETIMETZ_IMMUTABLE],
            ['revoked_at', Types::DATETIMETZ_IMMUTABLE, false]], 'pk' => ['token_hash'], 'idx' => [['employee_id']]],
        'rpw_pin_attempt' => ['cols' => [['employee_id', Types::GUID], ['window_start', Types::DATETIMETZ_IMMUTABLE],
            ['n', Types::INTEGER, true, ['default' => 0]]], 'pk' => ['employee_id']],
        'rpw_pin_log' => ['cols' => [['id', Types::BIGINT, true, ['autoincrement' => true]], ['shop_id', Types::GUID], ['employee_id', Types::GUID],
            ['set_by', Types::GUID, false], ['self_set', Types::BOOLEAN, true, ['default' => false]], ['created_at', Types::DATETIMETZ_IMMUTABLE, false]],
            'pk' => ['id']],
        'rpw_jobs' => ['cols' => [['id', Types::TEXT], ['shop_id', Types::GUID], ['data', Types::JSONB], ['version', Types::INTEGER, true, ['default' => 1]],
            ['deleted_at', Types::DATETIMETZ_IMMUTABLE, false], ['created_at', Types::DATETIMETZ_IMMUTABLE, false],
            ['updated_at', Types::DATETIMETZ_IMMUTABLE, false]], 'pk' => ['id'], 'idx' => [['shop_id']]],
        'rpw_audit' => ['cols' => [['id', Types::BIGINT, true, ['autoincrement' => true]], ['job_id', Types::TEXT, false], ['tenant_id', Types::GUID, false],
            ['actor', Types::TEXT, false], ['action', Types::TEXT], ['phase', Types::TEXT, false], ['patch', Types::JSONB, false],
            ['prev_version', Types::INTEGER, false], ['new_version', Types::INTEGER, false], ['created_at', Types::DATETIMETZ_IMMUTABLE, false]],
            'pk' => ['id'], 'idx' => [['job_id']]],
        'rpw_posts' => ['cols' => [['id', Types::GUID], ['shop_id', Types::GUID], ['code', Types::TEXT], ['label', Types::TEXT],
            ['note', Types::TEXT, false], ['employee_id', Types::GUID, false], ['sort_order', Types::INTEGER, true, ['default' => 100]],
            ['active', Types::BOOLEAN, true, ['default' => true]]], 'pk' => ['id'], 'uniq' => [['shop_id', 'code']]],
        'rpw_job_counters' => ['cols' => [['shop_id', Types::GUID], ['prefix', Types::TEXT], ['n', Types::INTEGER, true, ['default' => 0]]],
            'pk' => ['shop_id', 'prefix']],
    ];

    /** @return list<Table> */
    public static function tables(): array
    {
        $out = [];
        foreach (self::TABLES as $name => $def) {
            $cols = [];
            foreach ($def['cols'] as $c) {
                $e = Column::editor()->setUnquotedName($c[0])->setTypeName($c[1])->setNotNull($c[2] ?? true);
                $x = $c[3] ?? [];
                if (isset($x['length'])) {
                    $e->setLength($x['length']);
                }
                if (isset($x['autoincrement'])) {
                    $e->setAutoincrement(true);
                }
                if (\array_key_exists('default', $x)) {
                    $e->setDefaultValue($x['default']);
                }
                $cols[] = $e->create();
            }
            $t = Table::editor()->setUnquotedName($name)->setColumns(...$cols)
                ->setPrimaryKeyConstraint(PrimaryKeyConstraint::editor()->setUnquotedColumnNames(...$def['pk'])->create());
            $idx = [];
            foreach ($def['idx'] ?? [] as $cols2) {
                $idx[] = Index::editor()->setUnquotedName($name.'_'.implode('_', $cols2).'_idx')->setUnquotedColumnNames(...$cols2)->create();
            }
            if ($idx !== []) {
                $t->setIndexes(...$idx);
            }
            $uq = [];
            foreach ($def['uniq'] ?? [] as $cols2) {
                $uq[] = UniqueConstraint::editor()->setUnquotedName($name.'_'.implode('_', $cols2).'_uq')->setUnquotedColumnNames(...$cols2)->create();
            }
            if ($uq !== []) {
                $t->setUniqueConstraints(...$uq);
            }
            $out[] = $t->create();
        }

        return $out;
    }

    /**
     * Séma-ellenőrzés egy MEGLÉVŐ adatbázison: mely elvárt tábla / oszlop hiányzik.
     * Az éles Supabase-séma eltérhet a migrációs fájloktól (pl. a
     * _db/05-schema.sql szerint rpw_job_counters.last_no és rpw_audit.at) —
     * ezért párhuzamos üzem előtt EZT kell lefuttatni, nem feltételezni.
     *
     * @return array<string, list<string>> tábla → hiányzó oszlopok (['*'] = a tábla hiányzik)
     */
    public static function diff(Connection $c): array
    {
        $sm = $c->createSchemaManager();
        $existing = [];
        foreach ($sm->introspectTableNames() as $n) {
            $existing[strtolower($n->getUnqualifiedName()->getValue())] = true;
        }
        $out = [];
        foreach (self::TABLES as $name => $def) {
            if (!isset($existing[$name])) {
                $out[$name] = ['*'];
                continue;
            }
            $have = [];
            foreach ($sm->introspectTableColumnsByUnquotedName($name) as $col) {
                $have[strtolower($col->getObjectName()->getIdentifier()->getValue())] = true;
            }
            $miss = [];
            foreach ($def['cols'] as $col) {
                if (!isset($have[$col[0]])) {
                    $miss[] = $col[0];
                }
            }
            if ($miss !== []) {
                $out[$name] = $miss;
            }
        }

        return $out;
    }

    /** A hiányzó táblák létrehozása; a meglévőkhöz nem nyúl. */
    public static function createMissing(Connection $c): array
    {
        $existing = array_map('strtolower', $c->createSchemaManager()->introspectTableNames() !== [] ? array_map(static fn ($n) => $n->getUnqualifiedName()->getValue(), $c->createSchemaManager()->introspectTableNames()) : []);
        $created = [];
        foreach (self::tables() as $table) {
            if (\in_array(strtolower($table->getObjectName()->getUnqualifiedName()->getValue()), $existing, true)) {
                continue;
            }
            foreach ($c->getDatabasePlatform()->getCreateTableSQL($table) as $sql) {
                $c->executeStatement($sql);
            }
            $created[] = $table->getObjectName()->getUnqualifiedName()->getValue();
        }

        return $created;
    }
}
