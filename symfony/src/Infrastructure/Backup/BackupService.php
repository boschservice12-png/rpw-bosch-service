<?php

declare(strict_types=1);

namespace App\Infrastructure\Backup;

use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Platforms\SQLitePlatform;

/**
 * 4. RÉTEG — MENTÉS. Egy mentés = egy mappa:
 *   db.sqlite|db.sql  (adatbázis)   storage.tar (fotók)   MANIFEST.json (sha256)
 * Minden fájl titkosítva (libsodium secretstream, XChaCha20-Poly1305), a kulcs
 * az RPW_BACKUP_KEY (32 bájt, base64) — NEM a mentés mellett. Titkosítás nélkül
 * csak --insecure kapcsolóval ment (helyi próbához). A visszaellenőrzés
 * (verify) kibontja és összeveti a hash-eket: a nem ellenőrzött mentés nem mentés.
 */
final class BackupService
{
    private const CHUNK = 65536;

    public function __construct(private readonly Connection $db, private readonly string $storageDir, private readonly ?string $keyB64 = null)
    {
    }

    public function key(): ?string
    {
        $k = base64_decode((string) $this->keyB64, true);

        return $k !== false && \strlen($k) === SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES ? $k : null;
    }

    /** @return array{dir:string, files:array} */
    public function create(string $targetRoot, bool $allowPlain = false): array
    {
        $key = $this->key();
        if ($key === null && !$allowPlain) {
            throw new \RuntimeException('RPW_BACKUP_KEY hiányzik vagy hibás (32 bájt base64). Titkosítatlan mentés csak --insecure kapcsolóval.');
        }
        $dir = rtrim($targetRoot, '/').'/rpw-'.gmdate('Ymd-His');
        if (!mkdir($dir, 0700, true) && !is_dir($dir)) {
            throw new \RuntimeException('A mentési mappa nem hozható létre: '.$dir);
        }
        $tmp = $dir.'/.tmp';
        mkdir($tmp, 0700);
        $plain = [];
        if ($this->db->getDatabasePlatform() instanceof SQLitePlatform) {
            $f = $tmp.'/db.sqlite';
            $this->db->executeStatement('VACUUM INTO '.$this->db->quote($f));   // konzisztens pillanatkép
            $plain['db.sqlite'] = $f;
        } else {
            $plain['db.sql'] = $this->pgDump($tmp.'/db.sql');
        }
        if (is_dir($this->storageDir)) {
            $tar = $tmp.'/storage.tar';
            $ph = new \PharData($tar);
            $ph->buildFromDirectory($this->storageDir);
            unset($ph);
            // Üres fotótárból (friss szerver) a PharData NEM ír fájlt — ilyenkor nincs mit menteni.
            // Korábban ez a titkosításnál összeomlott: az első éjszakai mentés és minden telepítés megállt.
            if (is_file($tar)) {
                $plain['storage.tar'] = $tar;
            }
        }
        $manifest = ['created' => gmdate(\DATE_ATOM), 'encrypted' => $key !== null, 'files' => []];
        foreach ($plain as $name => $src) {
            $manifest['files'][$name] = ['sha256' => hash_file('sha256', $src), 'bytes' => filesize($src)];
            $dst = $dir.'/'.$name.($key !== null ? '.enc' : '');
            $key !== null ? self::encryptFile($src, $dst, $key) : copy($src, $dst);
            chmod($dst, 0600);
            unlink($src);
        }
        rmdir($tmp);
        file_put_contents($dir.'/MANIFEST.json', json_encode($manifest, \JSON_PRETTY_PRINT));
        chmod($dir.'/MANIFEST.json', 0600);

        return ['dir' => $dir, 'files' => $manifest['files']];
    }

    /** Visszaellenőrzés: kibontás egy ideiglenes helyre + sha256-összevetés. */
    public function verify(string $dir): array
    {
        $m = json_decode((string) @file_get_contents($dir.'/MANIFEST.json'), true);
        if (!\is_array($m)) {
            return ['ok' => false, 'errors' => ['MANIFEST.json hiányzik']];
        }
        $key = $this->key();
        $errors = [];
        foreach ($m['files'] as $name => $meta) {
            $src = $dir.'/'.$name.($m['encrypted'] ? '.enc' : '');
            $tmp = tempnam(sys_get_temp_dir(), 'rpwv');
            try {
                if ($m['encrypted']) {
                    if ($key === null) {
                        $errors[] = 'nincs kulcs a visszafejtéshez';
                        break;
                    }
                    self::decryptFile($src, $tmp, $key);
                } else {
                    copy($src, $tmp);
                }
                if (!hash_equals($meta['sha256'], hash_file('sha256', $tmp))) {
                    $errors[] = $name.': hash eltér';
                }
            } catch (\Throwable $e) {
                $errors[] = $name.': '.$e->getMessage();
            } finally {
                @unlink($tmp);
            }
        }

        return ['ok' => $errors === [], 'errors' => $errors];
    }

    /** A régi mentések törlése: a legutóbbi $keep marad. */
    public function prune(string $targetRoot, int $keep): array
    {
        $all = glob(rtrim($targetRoot, '/').'/rpw-*', \GLOB_ONLYDIR) ?: [];
        sort($all);
        $gone = [];
        foreach (\array_slice($all, 0, max(0, \count($all) - $keep)) as $d) {
            array_map('unlink', glob($d.'/*') ?: []);
            @rmdir($d);
            $gone[] = basename($d);
        }

        return $gone;
    }

    public static function encryptFile(string $src, string $dst, string $key): void
    {
        [$state, $header] = sodium_crypto_secretstream_xchacha20poly1305_init_push($key);
        $in = fopen($src, 'rb');
        $out = fopen($dst, 'wb');
        if ($in === false || $out === false) {
            throw new \RuntimeException('A mentés fájlja nem nyitható meg: '.basename($src));
        }
        fwrite($out, $header);
        do {
            $chunk = (string) fread($in, self::CHUNK);
            $tag = feof($in) ? SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL : SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_MESSAGE;
            fwrite($out, sodium_crypto_secretstream_xchacha20poly1305_push($state, $chunk, '', $tag));
        } while ($tag !== SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL);
        fclose($in);
        fclose($out);
    }

    public static function decryptFile(string $src, string $dst, string $key): void
    {
        $in = fopen($src, 'rb');
        $out = fopen($dst, 'wb');
        $header = (string) fread($in, SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_HEADERBYTES);
        $state = sodium_crypto_secretstream_xchacha20poly1305_init_pull($header, $key);
        $final = false;
        while (!feof($in)) {
            $c = (string) fread($in, self::CHUNK + SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_ABYTES);
            if ($c === '') {
                break;
            }
            $r = sodium_crypto_secretstream_xchacha20poly1305_pull($state, $c);
            if ($r === false) {
                throw new \RuntimeException('sérült vagy hamisított mentés (hitelesítés sikertelen)');
            }
            fwrite($out, $r[0]);
            $final = $r[1] === SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL;
        }
        fclose($in);
        fclose($out);
        if (!$final) {
            throw new \RuntimeException('csonka mentés (hiányzik a záró blokk)');
        }
    }

    private function pgDump(string $file): string
    {
        $p = $this->db->getParams();
        $cmd = ['pg_dump', '--no-owner', '--format=plain', '--file='.$file, '--host='.($p['host'] ?? '127.0.0.1'),
            '--port='.($p['port'] ?? 5432), '--username='.($p['user'] ?? 'postgres'), (string) ($p['dbname'] ?? 'postgres')];
        $proc = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, ['PGPASSWORD' => (string) ($p['password'] ?? '')] + getenv());
        if (!\is_resource($proc)) {
            throw new \RuntimeException('pg_dump nem indítható');
        }
        $err = stream_get_contents($pipes[2]);
        if (proc_close($proc) !== 0) {
            throw new \RuntimeException('pg_dump hiba: '.mb_substr((string) $err, 0, 300));
        }

        return $file;
    }
}
