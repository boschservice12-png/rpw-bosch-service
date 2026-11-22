<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Infrastructure\Storage\FileStore;
use App\Infrastructure\Storage\LocalObjectStore;
use App\Infrastructure\Storage\ObjectStoreFactory;
use App\Infrastructure\Storage\S3ObjectStore;
use App\Infrastructure\Storage\S3Signer;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

final class S3ObjectStoreTest extends TestCase
{
    private const SHOP = '491d7f3b-65db-4176-8c41-f9918a1e1a99';
    private const PATH = 'RPW-2b6c3f0e-1a2b-4c3d-9e8f-0123456789ab/ov_0.jpg';

    /** @param array<string,int> $status kulcs-részlet → HTTP-kód a HEAD/DELETE kérésekre */
    private function store(array $status, array &$seen = []): S3ObjectStore
    {
        $http = new MockHttpClient(function (string $method, string $url) use ($status, &$seen) {
            $seen[] = $method.' '.parse_url($url, \PHP_URL_PATH);
            foreach ($status as $needle => $code) {
                if (str_contains($url, $needle)) {
                    return new MockResponse('', ['http_code' => $code]);
                }
            }

            return new MockResponse('', ['http_code' => 404]);
        });

        return new S3ObjectStore(new S3Signer('https://eu2.contabostorage.com', 'default', 'rpw', 'AK', 'SK'), $http);
    }

    public function testDirectUploadTicketIsTenantPrefixedAndTypeBound(): void
    {
        $t = $this->store([])->uploadTicket(self::SHOP, self::PATH, true, 'https://rpw.example', 412_345);

        self::assertTrue($t['direct'], 'a telefon közvetlenül a tárba tölt');
        self::assertSame('image/jpeg', $t['contentType']);
        self::assertStringStartsWith('https://eu2.contabostorage.com/rpw/'.self::SHOP.'/'.self::PATH.'?', $t['signedUrl'], '<cég>/<munka>/<fájl>');
        self::assertStringContainsString('X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost', $t['signedUrl'], 'a méret és a típus is az aláírás része');
        self::assertStringNotContainsString('SK', parse_url($t['signedUrl'], \PHP_URL_QUERY) ?? '', 'a titkos kulcs nincs az URL-ben');
    }

    public function testClientCannotOverwriteExisting(): void
    {
        $store = $this->store([self::PATH => 200]);
        $this->expectException(\DomainException::class);
        $store->uploadTicket(self::SHOP, self::PATH, false, '', 1000);
    }

    public function testSizeIsRequiredAndCapped(): void
    {
        $store = $this->store([]);
        foreach ([[null, 'size_required'], [0, 'too_large'], [FileStore::MAX_BYTES + 1, 'too_large']] as [$size, $err]) {
            try {
                $store->uploadTicket(self::SHOP, self::PATH, true, '', $size);
                self::fail('elfogadta: '.var_export($size, true));
            } catch (\LengthException $e) {
                self::assertSame($err, $e->getMessage());
            }
        }
        self::assertNotEmpty($store->uploadTicket(self::SHOP, self::PATH, true, '', FileStore::MAX_BYTES)['signedUrl'], 'pont a határ: elfogadva');
    }

    public function testUnknownExtensionIsNeverServedAsActiveContent(): void
    {
        self::assertSame('application/octet-stream', S3ObjectStore::mimeOf('RPW-x/a.html'));
        self::assertSame('application/pdf', S3ObjectStore::mimeOf('RPW-x/acta_x_1732200000000_ab.PDF'));
        $urls = $this->store(['a.svg' => 200])->readUrls(self::SHOP, ['RPW-2b6c3f0e-1a2b-4c3d-9e8f-0123456789ab/a.svg'], '');
        $u = array_values($urls)[0];
        self::assertStringContainsString('response-content-disposition=attachment', $u);
        self::assertStringContainsString('response-content-type=application%2Foctet-stream', $u);
    }

    public function testReadUrlsNullForMissingAndChecksInOneRound(): void
    {
        $seen = [];
        $other = 'RPW-2b6c3f0e-1a2b-4c3d-9e8f-0123456789ab/ov_1.jpg';
        $urls = $this->store([self::PATH => 200], $seen)->readUrls(self::SHOP, [self::PATH, $other], '');

        self::assertStringStartsWith('https://eu2.contabostorage.com/rpw/'.self::SHOP.'/'.self::PATH.'?', (string) $urls[self::PATH]);
        self::assertStringContainsString('response-content-type=image%2Fjpeg', (string) $urls[self::PATH]);
        self::assertNull($urls[$other], 'hiányzó fájlra nincs URL');
        self::assertSame(['HEAD /rpw/'.self::SHOP.'/'.self::PATH, 'HEAD /rpw/'.self::SHOP.'/'.$other], $seen);
    }

    public function testRemoveToleratesMissingButNotErrors(): void
    {
        $seen = [];
        $this->store([self::PATH => 204], $seen)->remove(self::SHOP, self::PATH);
        $this->store([], $seen)->remove(self::SHOP, 'RPW-2b6c3f0e-1a2b-4c3d-9e8f-0123456789ab/nincs.jpg');   // 404 = már nincs meg
        self::assertSame('DELETE /rpw/'.self::SHOP.'/'.self::PATH, $seen[0]);
        $this->expectException(\RuntimeException::class);
        $this->store([self::PATH => 500])->remove(self::SHOP, self::PATH);
    }

    public function testKeyRejectsTraversalAndForeignShopFormats(): void
    {
        foreach ([['../x', self::PATH], [self::SHOP, '../etc/passwd'], [self::SHOP.'/x', self::PATH], ['', self::PATH]] as [$shop, $path]) {
            try {
                S3ObjectStore::key($shop, $path);
                self::fail("elfogadta: $shop | $path");
            } catch (\InvalidArgumentException) {
                self::assertTrue(true);
            }
        }
    }

    public function testFactoryFailsClosedOnIncompleteS3Config(): void
    {
        $files = new FileStore(sys_get_temp_dir(), str_repeat('k', 64));
        self::assertInstanceOf(LocalObjectStore::class, ObjectStoreFactory::create(null, $files, new MockHttpClient()));
        self::assertInstanceOf(S3ObjectStore::class, ObjectStoreFactory::create('s3', $files, new MockHttpClient(), 'https://eu2.contabostorage.com', '', 'rpw', 'AK', 'SK'));
        foreach ([['s3', ''], ['s3', 'http://nem-titkositott.example'], ['ftp', 'https://x']] as [$b, $ep]) {
            try {
                ObjectStoreFactory::create($b, $files, new MockHttpClient(), $ep, '', 'rpw', 'AK', 'SK');
                self::fail('hiányos/hibás beállítással nem indulhat: '.$b.' '.$ep);
            } catch (\InvalidArgumentException) {
                self::assertTrue(true);
            }
        }
    }

    public function testProbeRunsFullRoundTripAndCorsIsSigned(): void
    {
        $stored = [];
        $seen = [];
        $http = new MockHttpClient(function (string $method, string $url, array $o) use (&$stored, &$seen) {
            $q = (string) parse_url($url, \PHP_URL_QUERY);
            $p = (string) parse_url($url, \PHP_URL_PATH);
            $seen[] = $method.' '.$p.(str_contains($q, 'cors') ? '?cors' : '');
            if (!str_contains($q, 'X-Amz-Signature=')) {
                return new MockResponse('', ['http_code' => 403]);   // privát tároló
            }

            return match ($method) {
                'PUT' => ($stored[$p] = $o['body'] ?? '') !== null ? new MockResponse('', ['http_code' => 200]) : new MockResponse(''),
                'HEAD' => new MockResponse('', ['http_code' => isset($stored[$p]) ? 200 : 404]),
                'GET' => isset($stored[$p]) ? new MockResponse($stored[$p]) : new MockResponse('', ['http_code' => 404]),
                'DELETE' => (function () use (&$stored, $p) { unset($stored[$p]); return new MockResponse('', ['http_code' => 204]); })(),
            };
        });
        $store = new S3ObjectStore(new S3Signer('https://eu2.contabostorage.com', 'default', 'rpw', 'AK', 'SK'), $http);

        $steps = $store->probe();
        self::assertCount(6, $steps);
        foreach ($steps as [$name, $ok, $detail]) {
            self::assertTrue($ok, "$name: $detail");
        }
        self::assertSame(200, $store->applyCors('https://rpw.example.ro'));
        self::assertSame('PUT /rpw?cors', end($seen), 'a CORS a tárolóra szól, nem egy objektumra');
        $this->expectException(\InvalidArgumentException::class);
        $store->applyCors('http://nem-https.example');
    }
}
