<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Application\AuditLog;
use App\Application\PhotoExtractor;
use App\Controller\JsonInput;
use App\Infrastructure\Db\Sql;
use App\Infrastructure\Storage\FileStore;
use App\Infrastructure\Storage\LocalObjectStore;

/** A régi, munkába ágyazott fotók kiköltöztetése: a munka menthető lesz, semmi nem vész el, újrafuttatható. */
final class PhotoExtractTest extends ApiTestCase
{
    public function testExtractsKnownShapesKeepsTheRestAndIsIdempotent(): void
    {
        [$shop] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $jpg = static fn (int $kb) => 'data:image/jpeg;base64,'.base64_encode("\xFF\xD8\xFF\xE0".random_bytes($kb * 1024));
        $pdf = 'data:application/pdf;base64,'.base64_encode('%PDF-1.7 '.random_bytes(2000));
        $fake = 'data:image/jpeg;base64,'.base64_encode('<svg onload=alert(1)>');
        $id = 'RPW-2b6c3f0e-1a2b-4c3d-9e8f-0123456789ab';
        $job = [
            'number' => 'MS-26-074', 'elements' => new \stdClass(),
            'reconstPhotos' => [['data' => $jpg(500), 'ts' => 't1'], ['data' => $jpg(500), 'ts' => 't2'], ['path' => "$id/meglevo.jpg"]],
            'reconst' => ['rows' => [['name' => 'Bara fata', 'photos' => [$jpg(300), $jpg(300)]], ['name' => 'Usa', 'photos' => []]]],
            'docs' => [['name' => 'constatare', 'data' => $pdf]],
            'closingPhotos' => [['data' => $fake]],
            'panelLegacy' => ['photo' => $jpg(1)],
        ];
        $this->db->insert('rpw_jobs', ['id' => $id, 'shop_id' => $shop, 'data' => Sql::encode($job), 'version' => 7]);
        $before = \strlen(Sql::encode($job));
        self::assertGreaterThan(JsonInput::MAX_BYTES, $before, 'a régi munka az új szerveren NEM lenne menthető');

        $root = sys_get_temp_dir().'/rpwx-'.bin2hex(random_bytes(4));
        $files = new FileStore($root, str_repeat('k', 64));
        $ex = new PhotoExtractor($this->db, new LocalObjectStore($files), static::getContainer()->get(AuditLog::class));

        $dry = $ex->run(true);
        self::assertSame(5, $dry['photos'], 'próba: 2 szakvélemény + 2 sor + 1 PDF');
        self::assertSame(7, (int) $this->db->fetchOne('SELECT version FROM rpw_jobs WHERE id = ?', [$id]), 'a próba semmit nem ír');
        self::assertDirectoryDoesNotExist($root.'/rpw-photos');

        $r = $ex->run();
        self::assertSame(5, $r['photos']);
        self::assertSame(1, $r['changed']);
        $row = $this->db->fetchAssociative('SELECT data, version FROM rpw_jobs WHERE id = ?', [$id]);
        $after = Sql::decode($row['data']);
        self::assertSame(8, (int) $row['version'], 'verzió +1 (a nyitott böngészők ütközést kapnak, nem írják felül)');
        self::assertLessThan(JsonInput::MAX_BYTES, \strlen((string) $row['data']), 'a munka menthető lett');

        $p0 = $after['reconstPhotos'][0];
        self::assertArrayNotHasKey('data', $p0);
        self::assertSame('t1', $p0['ts'], 'a többi mező megmarad');
        self::assertMatchesRegularExpression('#^'.$id.'/b64_[0-9a-f]{16}\.jpg$#', $p0['path']);
        self::assertTrue($files->exists('rpw-photos', $p0['path']), 'a fotó a tárban');
        self::assertSame("$id/meglevo.jpg", $after['reconstPhotos'][2]['path'], 'a már tárolt fotóhoz nem nyúl');
        self::assertIsArray($after['reconst']['rows'][0]['photos'][0], 'sor-fotó: szöveg → hivatkozás');
        self::assertStringEndsWith('.pdf', $after['docs'][0]['path']);
        self::assertSame($fake, $after['closingPhotos'][0]['data'], 'a nem valódi JPG a munkában marad (nem tesszük a tárba)');
        self::assertSame($job['panelLegacy']['photo'], $after['panelLegacy']['photo'], 'ismeretlen helyhez nem nyúl');
        self::assertStringContainsString('"elements":{}', (string) $row['data'], 'az üres objektum objektum marad');
        self::assertNotEmpty(array_filter($r['untouched'], static fn ($u) => str_contains($u, '/panelLegacy/photo')), 'a jelentés megmutatja, mi maradt');
        self::assertSame(1, (int) $this->db->fetchOne("SELECT count(*) FROM rpw_audit WHERE action = 'photos_extracted' AND job_id = ?", [$id]));

        // a visszafejtett bájtok azonosak az eredetivel
        $orig = base64_decode(substr($job['reconstPhotos'][0]['data'], \strlen('data:image/jpeg;base64,')));
        self::assertSame($orig, file_get_contents($files->get('rpw-photos', $p0['path'])['file']));

        $again = $ex->run();
        self::assertSame(0, $again['photos'], 'újrafuttatva: nincs több kivinni való');
        self::assertSame(8, (int) $this->db->fetchOne('SELECT version FROM rpw_jobs WHERE id = ?', [$id]));
    }
}
