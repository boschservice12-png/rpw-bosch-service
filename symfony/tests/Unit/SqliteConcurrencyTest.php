<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Infrastructure\Db\ConnectionFactory;
use PHPUnit\Framework\TestCase;

/**
 * Saját gépes futtatás (Docker, 4 PHP-folyamat): egy zárolt SQLite-on a második író VÁR, nem bukik azonnal.
 * A PDO SQLite alapból 60 mp-ig vár (ATTR_TIMEOUT) — ez a teszt őrzi, hogy senki ne kapcsolja ki / rövidítse le.
 */
final class SqliteConcurrencyTest extends TestCase
{
    public function testSecondWriterWaitsInsteadOfFailing(): void
    {
        $f = sys_get_temp_dir().'/rpw-lock-'.bin2hex(random_bytes(4)).'.db';
        $a = ConnectionFactory::create('sqlite:///'.$f);
        $a->executeStatement('CREATE TABLE t (n INT)');

        // „A” zárolja az adatbázist 1,5 mp-re egy külön folyamatban
        $pid = proc_open([\PHP_BINARY, '-r', '$p=new PDO("sqlite:'.$f.'"); $p->exec("BEGIN IMMEDIATE"); $p->exec("INSERT INTO t VALUES (1)"); usleep(1500000); $p->exec("COMMIT");'], [], $pipes);
        usleep(300000);
        $t = microtime(true);
        $b = ConnectionFactory::create('sqlite:///'.$f);
        $b->executeStatement('INSERT INTO t VALUES (2)');   // vár, amíg A elengedi — nem dob hibát
        $waited = microtime(true) - $t;
        proc_close($pid);

        self::assertGreaterThan(0.5, $waited, 'a második író valóban várt');
        self::assertSame(2, (int) $b->fetchOne('SELECT count(*) FROM t'));
    }
}
