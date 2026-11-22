<?php

declare(strict_types=1);

namespace App\Infrastructure\Backup;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Platforms\SQLitePlatform;

/**
 * VISSZATÖLTÉS a titkosított mentésből — és a havi VISSZATÖLTÉSI PRÓBA.
 *
 * Elv: egy mentés csak akkor ér valamit, ha vissza is tölthető. Ezért:
 *  - próba (drill): a mentést egy KÜLÖN adatbázisba (<db>_drill) tölti, megszámolja a sorokat és a fotókat
 *    — az élő adathoz NEM nyúl; havonta magától fut
 *  - élő visszatöltés: előbb biztonsági mentés a mostani állapotról, utána EGY tranzakcióban csere —
 *    ha bármi elbukik, az adatbázis a régi marad (nincs félig visszatöltött állapot)
 *
 * A fotók: helyi tárnál a mentésben vannak (storage.tar); objektumtárnál a másik szolgáltatónál lévő
 * másolatból jönnek vissza (rpw:storage:replicate --reverse) — a mentés csak az adatbázist viszi.
 */
final class RestoreService
{
    public const TABLES = ['shops', 'rpw_employees', 'rpw_jobs', 'rpw_audit'];

    public function __construct(private readonly Connection $db, private readonly BackupService $backup, private readonly string $storageDir)
    {
    }

    /**
     * Visszafejtés + hash-ellenőrzés egy munkamappába.
     *
     * @return array{db:string, kind:string, storage:?string}
     */
    public function unpack(string $dir, string $work): array
    {
        $m = json_decode((string) @file_get_contents($dir.'/MANIFEST.json'), true);
        if (!\is_array($m) || !\is_array($m['files'] ?? null)) {
            throw new \RuntimeException('nem RPW-mentés (MANIFEST.json hiányzik): '.$dir);
        }
        $key = $this->backup->key();
        if ($m['encrypted'] && $key === null) {
            throw new \RuntimeException('a mentés titkosított, de nincs RPW_BACKUP_KEY');
        }
        if (!is_dir($work) && !mkdir($work, 0700, true)) {
            throw new \RuntimeException('munkamappa: '.$work);
        }
        $out = ['db' => '', 'kind' => '', 'storage' => null];
        foreach ($m['files'] as $name => $meta) {
            $dst = $work.'/'.$name;
            $src = $dir.'/'.$name.($m['encrypted'] ? '.enc' : '');
            $m['encrypted'] ? BackupService::decryptFile($src, $dst, (string) $key) : copy($src, $dst);
            if (!hash_equals((string) $meta['sha256'], hash_file('sha256', $dst))) {
                throw new \RuntimeException('hash-eltérés: '.$name.' — a mentés sérült, NEM töltöm vissza');
            }
            if ($name === 'db.sqlite' || $name === 'db.sql') {
                $out['db'] = $dst;
                $out['kind'] = $name === 'db.sqlite' ? 'sqlite' : 'pgsql';
            } elseif ($name === 'storage.tar') {
                $out['storage'] = $dst;
            }
        }
        if ($out['db'] === '') {
            throw new \RuntimeException('a mentésben nincs adatbázis');
        }

        return $out;
    }

    /**
     * PRÓBA: a mentés egy külön adatbázisba töltve, megszámolva. Az élő adathoz nem nyúl.
     *
     * @return array{tables:array<string,int>, files:int, target:string}
     */
    public function drill(string $dir): array
    {
        $work = sys_get_temp_dir().'/rpw-drill-'.bin2hex(random_bytes(4));
        try {
            $u = $this->unpack($dir, $work);
            $target = $this->drillTarget($u['kind'], $work);
            $this->loadInto($u['kind'], $u['db'], $target);
            $conn = DriverManager::getConnection($target);
            try {
                $tables = $this->counts($conn);
            } finally {
                $conn->close();
            }
            $files = 0;
            if ($u['storage'] !== null) {
                $ph = new \PharData($u['storage']);
                foreach (new \RecursiveIteratorIterator($ph) as $f) {
                    ++$files;
                }
            }
            if (($tables['shops'] ?? 0) < 1) {
                throw new \RuntimeException('a visszatöltött adatbázisban nincs egyetlen szerviz sem — a mentés használhatatlan');
            }

            return ['tables' => $tables, 'files' => $files, 'target' => $u['kind'] === 'sqlite' ? 'ideiglenes SQLite' : (string) ($target['dbname'] ?? '')];
        } finally {
            self::removeTree($work);
        }
    }

    /**
     * ÉLES visszatöltés. Előtte biztonsági mentés a mostani állapotról (a $safetyRoot alá).
     *
     * @return array{tables:array<string,int>, files:int, safety:string}
     */
    public function restoreLive(string $dir, string $safetyRoot): array
    {
        $safety = $this->backup->create($safetyRoot)['dir'];
        $work = sys_get_temp_dir().'/rpw-restore-'.bin2hex(random_bytes(4));
        try {
            $u = $this->unpack($dir, $work);
            $live = $this->db->getParams();
            $isSqlite = $this->db->getDatabasePlatform() instanceof SQLitePlatform;
            if (($u['kind'] === 'sqlite') !== $isSqlite) {
                throw new \RuntimeException('a mentés ('.$u['kind'].') és az élő adatbázis típusa eltér');
            }
            $this->db->close();
            $this->loadInto($u['kind'], $u['db'], $live);
            $files = 0;
            if ($u['storage'] !== null) {
                $files = $this->restoreStorage($u['storage']);
            }

            return ['tables' => $this->counts($this->db), 'files' => $files, 'safety' => $safety];
        } finally {
            self::removeTree($work);
        }
    }

    /** @return array<string,int> */
    private function counts(Connection $c): array
    {
        $out = [];
        foreach (self::TABLES as $t) {
            try {
                $out[$t] = (int) $c->fetchOne('SELECT count(*) FROM '.$t);
            } catch (\Throwable) {
                $out[$t] = -1;   // a tábla hiányzik
            }
        }

        return $out;
    }

    private function drillTarget(string $kind, string $work): array
    {
        if ($kind === 'sqlite') {
            return ['driver' => 'pdo_sqlite', 'path' => $work.'/drill.sqlite'];
        }
        $p = $this->db->getParams();
        $p['dbname'] = ((string) ($p['dbname'] ?? 'rpw')).'_drill';   // a telepítő hozza létre, az rpw a tulajdonosa

        return $p;
    }

    /** SQLite: fájlcsere (atomikus rename). PostgreSQL: psql, EGY tranzakcióban — hibánál semmi nem változik. */
    private function loadInto(string $kind, string $dump, array $target): void
    {
        if ($kind === 'sqlite') {
            $path = (string) ($target['path'] ?? '');
            if ($path === '') {
                throw new \RuntimeException('SQLite cél nélkül');
            }
            if (!copy($dump, $path.'.restore-tmp') || !rename($path.'.restore-tmp', $path)) {
                throw new \RuntimeException('SQLite csere sikertelen');
            }

            return;
        }
        $sql = $dump.'.tx.sql';
        $fh = fopen($sql, 'wb');
        // a régi tartalom eldobása és a mentés betöltése EGY tranzakció (psql --single-transaction)
        fwrite($fh, "DROP SCHEMA IF EXISTS public CASCADE;\nCREATE SCHEMA public;\n");
        $in = fopen($dump, 'rb');
        stream_copy_to_stream($in, $fh);
        fclose($in);
        fclose($fh);
        $cmd = ['psql', '--no-psqlrc', '--quiet', '--single-transaction', '-v', 'ON_ERROR_STOP=1', '--file='.$sql,
            '--host='.($target['host'] ?? '127.0.0.1'), '--port='.($target['port'] ?? 5432),
            '--username='.($target['user'] ?? 'postgres'), '--dbname='.($target['dbname'] ?? 'postgres')];
        $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, ['PGPASSWORD' => (string) ($target['password'] ?? '')] + getenv());
        if (!\is_resource($proc)) {
            throw new \RuntimeException('psql nem indítható');
        }
        stream_get_contents($pipes[1]);
        $err = stream_get_contents($pipes[2]);
        if (proc_close($proc) !== 0) {
            // a lényeg az ERROR-sor (a NOTICE-ok csak zaj)
            $lines = array_values(array_filter(explode("\n", (string) $err), static fn ($l) => str_contains($l, 'ERROR')));
            throw new \RuntimeException('a visszatöltés elbukott, az adatbázis VÁLTOZATLAN: '.mb_substr($lines[0] ?? (string) $err, 0, 400));
        }
    }

    /** A fotótár cseréje: új mappába bontva, a régi megmarad <mappa>.elotte-<idő> néven. */
    private function restoreStorage(string $tar): int
    {
        $new = rtrim($this->storageDir, '/').'.restore-'.gmdate('YmdHis');
        mkdir($new, 0750, true);
        (new \PharData($tar))->extractTo($new, null, true);
        $n = iterator_count(new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($new, \FilesystemIterator::SKIP_DOTS)));
        if (is_dir($this->storageDir)) {
            rename($this->storageDir, rtrim($this->storageDir, '/').'.elotte-'.gmdate('YmdHis'));
        }
        rename($new, $this->storageDir);

        return $n;
    }

    private static function removeTree(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS), \RecursiveIteratorIterator::CHILD_FIRST);
        foreach ($it as $f) {
            $f->isDir() && !$f->isLink() ? rmdir($f->getPathname()) : unlink($f->getPathname());
        }
        rmdir($dir);
    }
}
