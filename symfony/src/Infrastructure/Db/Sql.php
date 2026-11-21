<?php

declare(strict_types=1);

namespace App\Infrastructure\Db;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Platforms\PostgreSQLPlatform;

/** Platform-különbségek egy helyen (jsonb-cast, időbélyeg, UUID). */
final class Sql
{
    public static function isPg(Connection $c): bool
    {
        return $c->getDatabasePlatform() instanceof PostgreSQLPlatform;
    }

    /** JSON paraméter-helyőrző: Postgresen jsonb-re kasztolva. */
    public static function json(Connection $c, string $param): string
    {
        return self::isPg($c) ? 'CAST(:'.$param.' AS jsonb)' : ':'.$param;
    }

    public static function encode(mixed $v): string
    {
        return json_encode($v, \JSON_UNESCAPED_UNICODE | \JSON_UNESCAPED_SLASHES | \JSON_PRESERVE_ZERO_FRACTION | \JSON_THROW_ON_ERROR);
    }

    public static function decode(mixed $v): array
    {
        if (\is_array($v)) {
            return $v;
        }
        if ($v === null || $v === '') {
            return [];
        }
        $d = \App\Infrastructure\Json::decode((string) $v);

        return \is_array($d) ? $d : [];
    }

    public static function ts(\DateTimeImmutable $d): string
    {
        return $d->format('Y-m-d H:i:sP');
    }
}
