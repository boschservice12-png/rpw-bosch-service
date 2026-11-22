<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Infrastructure\Storage\FileStore;
use App\Infrastructure\Storage\LocalObjectStore;
use App\Infrastructure\Storage\ReplicaService;
use App\Infrastructure\Storage\S3ObjectStore;
use App\Infrastructure\Storage\S3Signer;
use App\Tests\Support\MemoryS3;
use Symfony\Component\HttpClient\MockHttpClient;

/** A fotók másolata a másik szolgáltatónál: csak az új megy át, a célban soha nincs törlés, a hamis JPG kiderül. */
final class ReplicaTest extends ApiTestCase
{
    private function s3(MemoryS3 $mem, string $bucket): S3ObjectStore
    {
        return new S3ObjectStore(new S3Signer('https://s3.example.eu', 'eu', $bucket, 'AK', 'SK'), new MockHttpClient($mem));
    }

    public function testLocalPrimaryCopiesOnceWithTenantKeysAndFlagsFakeJpg(): void
    {
        [$shop, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $job = 'RPW-2b6c3f0e-1a2b-4c3d-9e8f-0123456789ab';
        $this->db->insert('rpw_jobs', ['id' => $job, 'shop_id' => $shop, 'data' => '{}', 'version' => 1]);
        $root = sys_get_temp_dir().'/rpwrep-'.bin2hex(random_bytes(4));
        $files = new FileStore($root, str_repeat('k', 64));
        $files->put('rpw-photos', "$job/ov_0.jpg", "\xFF\xD8\xFF".random_bytes(40), 'image/jpeg');
        $files->put('rpw-photos', "$job/acte/acta_x_1_ab.pdf", '%PDF-1.7 x', 'application/pdf');
        $files->put('rpw-photos', "$job/ov_1.jpg", "\x89PNG\r\n".random_bytes(20), 'image/jpeg');   // hamis JPG (régi adat)
        $mem = new MemoryS3('masolat');
        $svc = new ReplicaService(new LocalObjectStore($files), $this->s3($mem, 'masolat'), $this->db, $root);

        $r = $svc->replicate();
        self::assertSame(3, $r['source'], 'a .meta fájlok nem számítanak');
        self::assertSame(3, $r['copied']);
        self::assertSame(0, $r['missing_after']);
        self::assertArrayHasKey("$shop/$job/ov_0.jpg", $mem->objects, 'a másolatban is <cég>/<munka>/<fájl>');
        self::assertSame(["$shop/$job/ov_1.jpg"], $r['invalid'], 'a hamis JPG kiderül');

        $again = $svc->replicate();
        self::assertSame(0, $again['copied'], 'ami egyszer átment, nem megy újra');
        self::assertSame([], array_filter($mem->calls, static fn ($c) => str_starts_with($c, 'DELETE')), 'a másolatban SOHA nincs törlés');

        // katasztrófa: a helyi fotó elveszik → a másolatból visszajön, a meglévő nem íródik felül
        unlink("$root/rpw-photos/$job/ov_0.jpg");
        $back = $svc->reverse();
        self::assertSame(1, $back['restored']);
        self::assertSame($mem->objects["$shop/$job/ov_0.jpg"], file_get_contents("$root/rpw-photos/$job/ov_0.jpg"));
    }

    public function testS3PrimaryWithPagedListingAndDryRun(): void
    {
        $src = new MemoryS3('rpw', 2);
        foreach (range(1, 5) as $i) {
            $src->objects["shop-1/RPW-x/ov_$i.jpg"] = "\xFF\xD8\xFF".$i;
        }
        $src->objects['_rpw-probe/x.jpg'] = "\xFF\xD8\xFF";   // a beüzemelési próba nyoma nem kell
        $dst = new MemoryS3('masolat', 2);
        $dst->objects['shop-1/RPW-x/ov_1.jpg'] = "\xFF\xD8\xFF1";
        $svc = new ReplicaService($this->s3($src, 'rpw'), $this->s3($dst, 'masolat'), $this->db, sys_get_temp_dir());

        $dry = $svc->replicate(true);
        self::assertSame(5, $dry['source'], 'lapozott listázás: mind az 5 (3 lapon)');
        self::assertSame(4, $dry['missing_after']);
        self::assertSame(0, $dry['copied'], 'a próbafuttatás nem másol');

        $r = $svc->replicate();
        self::assertSame(4, $r['copied']);
        self::assertCount(5, $dst->objects);
        self::assertArrayNotHasKey('_rpw-probe/x.jpg', $dst->objects);
    }

    public function testNotConfiguredIsLoud(): void
    {
        $svc = new ReplicaService(new LocalObjectStore(new FileStore(sys_get_temp_dir(), str_repeat('k', 64))), null, $this->db, sys_get_temp_dir());
        self::assertFalse($svc->configured());
        $this->expectException(\RuntimeException::class);
        $svc->replicate();
    }
}
