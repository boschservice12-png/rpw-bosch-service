<?php

declare(strict_types=1);

namespace App\Infrastructure\Db;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Tools\DsnParser;

/** DATABASE_URL → DBAL kapcsolat. PostgreSQL élesben, SQLite a tesztekben. */
final class ConnectionFactory
{
    public static function create(string $url): Connection
    {
        $params = (new DsnParser(['postgres' => 'pdo_pgsql', 'postgresql' => 'pdo_pgsql', 'pgsql' => 'pdo_pgsql', 'sqlite' => 'pdo_sqlite']))->parse($url);
        if (($params['driver'] ?? null) === 'pdo_sqlite' && ($params['path'] ?? null) === ':memory:') {
            $params['memory'] = true;
        }

        return DriverManager::getConnection($params);
    }
}
