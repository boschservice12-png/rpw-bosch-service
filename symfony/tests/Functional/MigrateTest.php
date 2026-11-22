<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Infrastructure\Storage\FileStore;
use App\Infrastructure\Storage\LocalObjectStore;
use App\Infrastructure\Storage\MigrateService;
use App\Infrastructure\Storage\ReplicaService;
use App\Infrastructure\Storage\S3ObjectStore;
use App\Infrastructure\Storage\S3Signer;
use App\Tests\Support\MemoryS3;
use Symfony\Component\HttpClient\MockHttpClient;

/** A meglévő fotók átvitele: helyi lemezről és a régi (cég-előtag nélküli) tárból, cégenkénti kulcsra. */
final class MigrateTest extends ApiTestCase
{
    private function s3(MemoryS3 $m, string $b): S3ObjectStore
    {
        return new S3ObjectStore(new S3Signer('https://s3.example.eu', 'eu', $b, 'AK', 'SK'), new MockHttpClient($m));
    }

    public function testFromLocalAndFromLegacyStoreIntoTenantKeys(): void
    {
        [$a] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        [$b] = $this->shop('B', ['admin' => ['Bela Admin', '5937']]);
        $ja = 'RPW-aaaaaaaa-1a2b-4c3d-9e8f-0123456789ab';
        $jb = 'RPW-bbbbbbbb-1a2b-4c3d-9e8f-0123456789ab';
        $this->db->insert('rpw_jobs', ['id' => $ja, 'shop_id' => $a, 'data' => '{}', 'version' => 1]);
        $this->db->insert('rpw_jobs', ['id' => $jb, 'shop_id' => $b, 'data' => '{}', 'version' => 1]);

        $primaryMem = new MemoryS3('rpw', 2);
        $primary = $this->s3($primaryMem, 'rpw');
        $root = sys_get_temp_dir().'/rpwmig-'.bin2hex(random_bytes(4));
        $files = new FileStore($root, str_repeat('k', 64));
        $svc = new MigrateService($primary, new ReplicaService(new LocalObjectStore($files), null, $this->db, $root));

        // 1) helyi lemez (staging)
        $files->put('rpw-photos', "$ja/ov_0.jpg", "\xFF\xD8\xFF1", 'image/jpeg');
        $files->put('rpw-photos', "$ja/acte/acta_talon_1_ab.jpg", "\xFF\xD8\xFF2", 'image/jpeg');
        $r = $svc->run($svc->fromLocal($root));
        self::assertSame(2, $r['copied']);
        self::assertArrayHasKey("$a/$ja/ov_0.jpg", $primaryMem->objects);
        self::assertArrayHasKey("$a/$ja/acte/acta_talon_1_ab.jpg", $primaryMem->objects);

        // 2) a régi tár: <munka>/<fájl>, cég nélkül; szemét és ismeretlen munka is van benne
        $legacyMem = new MemoryS3('rpw-photos', 2);
        $legacyMem->objects = ["$jb/ov_0.jpg" => "\xFF\xD8\xFFb", "$jb/closing_1.jpg" => "\x89PNG", '.emptyFolderPlaceholder' => '',
            'RPW-cccccccc-1a2b-4c3d-9e8f-0123456789ab/ov_0.jpg' => "\xFF\xD8\xFFc", "$ja/ov_0.jpg" => "\xFF\xD8\xFF1"];
        $dry = $svc->run($svc->fromLegacyS3($this->s3($legacyMem, 'rpw-photos')), true);
        self::assertSame(4, $dry['source'], 'a szemét kimarad');
        self::assertSame(1, $dry['already'], 'a helyiről már átvitt nem megy újra');
        self::assertSame(3, $dry['missing_after']);
        self::assertSame(0, $dry['copied'], 'próbafuttatás: semmi nem íródik');

        $r2 = $svc->run($svc->fromLegacyS3($this->s3($legacyMem, 'rpw-photos')));
        self::assertSame(3, $r2['copied']);
        self::assertArrayHasKey("$b/$jb/ov_0.jpg", $primaryMem->objects, 'B cég fotója B alá');
        self::assertArrayHasKey('_ismeretlen/RPW-cccccccc-1a2b-4c3d-9e8f-0123456789ab/ov_0.jpg', $primaryMem->objects, 'ismeretlen munka: nem vész el');
        self::assertSame(1, $r2['unknownJob']);
        self::assertSame(["$b/$jb/closing_1.jpg"], $r2['invalid'], 'a régi hamis JPG kiderül');
        self::assertSame(0, $svc->run($svc->fromLegacyS3($this->s3($legacyMem, 'rpw-photos')))['copied'], 'újrafuttatva: nincs mit vinni');
        self::assertSame([], array_filter($legacyMem->calls, static fn ($c) => !str_starts_with($c, 'GET')), 'a régi tárba SEMMI nem ír és nem töröl');
    }

    public function testRefusesWhenPrimaryIsNotObjectStore(): void
    {
        $files = new FileStore(sys_get_temp_dir(), str_repeat('k', 64));
        $svc = new MigrateService(new LocalObjectStore($files), new ReplicaService(new LocalObjectStore($files), null, $this->db, sys_get_temp_dir()));
        $this->expectException(\RuntimeException::class);
        $svc->run([]);
    }
}
