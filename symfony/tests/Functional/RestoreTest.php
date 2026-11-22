<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Infrastructure\Backup\BackupService;
use App\Infrastructure\Backup\RestoreService;

/** Egy mentés csak akkor ér valamit, ha vissza is tölthető — próba, éles visszatöltés, sérült mentés. */
final class RestoreTest extends ApiTestCase
{
    public function testDrillThenLiveRestoreAndCorruptBackupChangesNothing(): void
    {
        $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $root = sys_get_temp_dir().'/rpwr-'.bin2hex(random_bytes(4));
        mkdir($root.'/storage/rpw-photos/RPW-x', 0700, true);
        file_put_contents($root.'/storage/rpw-photos/RPW-x/ov_0.jpg', "\xFF\xD8\xFF".random_bytes(100));
        $key = base64_encode(sodium_crypto_secretstream_xchacha20poly1305_keygen());
        $backup = new BackupService($this->db, $root.'/storage', $key);
        $restore = new RestoreService($this->db, $backup, $root.'/storage');
        $bk = $backup->create($root.'/bk')['dir'];

        // a mentés után változik az élő adat
        $this->shop('B', ['admin' => ['Bela Admin', '5937']]);
        unlink($root.'/storage/rpw-photos/RPW-x/ov_0.jpg');
        self::assertSame(2, (int) $this->db->fetchOne('SELECT count(*) FROM shops'));

        // PRÓBA: a mentés állapotát mutatja, az élőhöz nem nyúl
        $d = $restore->drill($bk);
        self::assertSame(1, $d['tables']['shops']);
        self::assertSame(1, $d['files']);
        self::assertSame(2, (int) $this->db->fetchOne('SELECT count(*) FROM shops'), 'a próba nem változtat az élőn');

        // SÉRÜLT mentés: elutasítva, az élő változatlan
        $bad = $root.'/bad';
        mkdir($bad);
        foreach (glob($bk.'/*') as $f) {
            copy($f, $bad.'/'.basename($f));
        }
        $enc = $bad.'/db.sqlite.enc';
        $b = file_get_contents($enc);
        $b[100] = \chr(\ord($b[100]) ^ 1);
        file_put_contents($enc, $b);
        try {
            $restore->restoreLive($bad, $root.'/safety-bad');
            self::fail('sérült mentést nem szabad visszatölteni');
        } catch (\RuntimeException) {
            self::assertSame(2, (int) $this->db->fetchOne('SELECT count(*) FROM shops'), 'sérült mentésnél az élő változatlan');
        }

        // ÉLES visszatöltés: előtte biztonsági mentés, utána a mentés állapota
        $r = $restore->restoreLive($bk, $root.'/safety');
        self::assertSame(1, $r['tables']['shops']);
        self::assertSame(1, (int) $this->db->fetchOne('SELECT count(*) FROM shops'));
        self::assertFileExists($root.'/storage/rpw-photos/RPW-x/ov_0.jpg', 'a fotó is visszajött');
        self::assertSame(2, $restore->drill($r['safety'])['tables']['shops'], 'a visszatöltés előtti állapot megmaradt mentésként');
    }
}
