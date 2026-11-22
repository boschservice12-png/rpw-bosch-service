<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Tests\Support\FakeS3;

/**
 * A fotó-kapu OBJEKTUMTÁR módban (RPW_STORAGE_BACKEND=s3): a jogosultsági szabályok változatlanok,
 * a kép a tárba megy közvetlenül, a kulcs elején a munka CÉGE áll — a dolgozónál és az ügyfélnél is.
 */
final class StorageS3GatewayTest extends ApiTestCase
{
    private const ENV = ['RPW_STORAGE_BACKEND' => 's3', 'RPW_S3_ENDPOINT' => 'https://eu2.contabostorage.com', 'RPW_S3_REGION' => 'default',
        'RPW_S3_BUCKET' => 'rpw', 'RPW_S3_ACCESS_KEY' => 'AKTEST', 'RPW_S3_SECRET_KEY' => 'SKTEST-titkos'];

    protected function setUp(): void
    {
        parent::setUp();
        foreach (self::ENV as $k => $v) {
            $_SERVER[$k] = $_ENV[$k] = $v;
        }
        FakeS3::$existing = [];
        FakeS3::$calls = [];
    }

    protected function tearDown(): void
    {
        foreach (array_keys(self::ENV) as $k) {
            unset($_SERVER[$k], $_ENV[$k]);
        }
        parent::tearDown();
    }

    private function rpc(string $fn, array $args): array
    {
        $this->client->request('POST', '/rest/v1/rpc/'.$fn, [], [], ['CONTENT_TYPE' => 'application/json'], json_encode($args));

        return json_decode((string) $this->client->getResponse()->getContent(), true) ?? [];
    }

    private function gw(array $body, ?string $tok = null): array
    {
        $h = ['CONTENT_TYPE' => 'application/json'] + ($tok ? ['HTTP_X_RPW_TOKEN' => $tok] : []);
        $this->client->request('POST', '/functions/v1/rpw-storage', [], [], $h, json_encode($body));

        return [$this->client->getResponse()->getStatusCode(), json_decode((string) $this->client->getResponse()->getContent(), true)];
    }

    public function testDirectUploadTenantPrefixAndRules(): void
    {
        [$a, $ia] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        [$b, $ib] = $this->shop('B', ['admin' => ['Bela Admin', '5937']]);
        $ta = $this->rpc('rpw2_login', ['p_shop_id' => $a, 'p_employee_id' => $ia['admin'], 'p_pin' => '4826'])['token'];
        $tb = $this->rpc('rpw2_login', ['p_shop_id' => $b, 'p_employee_id' => $ib['admin'], 'p_pin' => '5937'])['token'];
        $id = 'RPW-2b6c3f0e-1a2b-4c3d-9e8f-0123456789ab';
        $this->rpc('rpw_patch_v3', ['p_token' => $ta, 'p_id' => $id, 'p_patch' => ['client' => 'X']]);
        $path = $id.'/ov_0.jpg';

        // a jogosultság változatlan: token nélkül 401, idegen cég 403
        self::assertSame(401, $this->gw(['op' => 'sign-upload', 'path' => $path, 'size' => 1000])[0]);
        self::assertSame(403, $this->gw(['op' => 'sign-upload', 'path' => $path, 'size' => 1000], $tb)[0]);
        // méretkorlát: méret nélkül 400, 25 MB fölött 413
        self::assertSame(400, $this->gw(['op' => 'sign-upload', 'path' => $path], $ta)[0]);
        self::assertSame(413, $this->gw(['op' => 'sign-upload', 'path' => $path, 'size' => 26 * 1024 * 1024], $ta)[0]);

        [$st, $t] = $this->gw(['op' => 'sign-upload', 'path' => $path, 'size' => 412345], $ta);
        self::assertSame(200, $st);
        self::assertTrue($t['direct']);
        self::assertSame('image/jpeg', $t['contentType']);
        self::assertStringStartsWith("https://eu2.contabostorage.com/rpw/$a/$path?", $t['signedUrl'], 'a kulcs elején A cég');
        self::assertStringContainsString('content-length%3Bcontent-type', $t['signedUrl'], 'a pontos méret aláírva');
        self::assertStringNotContainsString('SKTEST', json_encode($t), 'a titkos kulcs nem megy ki');

        // ügyfél (WhatsApp-link): a cég a MUNKÁBÓL jön, nem a böngészőből
        $cp = $id.'/client_1732200000000_ab12.jpg';
        self::assertSame(400, $this->gw(['op' => 'client-sign-upload', 'path' => $cp])[0], 'az ügyfélnek is kell a méret');
        [$cs, $ct] = $this->gw(['op' => 'client-sign-upload', 'path' => $cp, 'size' => 50000]);
        self::assertSame(200, $cs);
        self::assertStringStartsWith("https://eu2.contabostorage.com/rpw/$a/$cp?", $ct['signedUrl']);
        // ügyfél meglévőt nem írhat felül
        FakeS3::$existing["/rpw/$a/$cp"] = true;
        self::assertSame(409, $this->gw(['op' => 'client-sign-upload', 'path' => $cp, 'size' => 50000])[0]);
        // ügyfél dolgozói fotót nem kérhet
        self::assertSame(403, $this->gw(['op' => 'client-sign-upload', 'path' => $path, 'size' => 50000])[0]);

        // olvasás: meglévőre aláírt GET a tárba, hiányzóra null
        FakeS3::$existing["/rpw/$a/$path"] = true;
        [$rs, $r] = $this->gw(['op' => 'sign-read', 'paths' => [$path, $id.'/ov_1.jpg']], $ta);
        self::assertSame(200, $rs);
        self::assertStringStartsWith("https://eu2.contabostorage.com/rpw/$a/$path?", $r['urls'][0]['signedUrl']);
        self::assertNull($r['urls'][1]['signedUrl']);
        self::assertSame(403, $this->gw(['op' => 'sign-read', 'paths' => [$path]], $tb)[0], 'idegen cég nem olvashat');

        // törlés: a tárban a cég kulcsán, és auditsor
        FakeS3::$calls = [];
        [$ds] = $this->gw(['op' => 'remove', 'paths' => [$path]], $ta);
        self::assertSame(200, $ds);
        self::assertContains("DELETE /rpw/$a/$path", FakeS3::$calls);
        self::assertSame(1, (int) $this->db->fetchOne("SELECT count(*) FROM rpw_audit WHERE action = 'photo_remove' AND job_id = ?", [$id]));

        // a böngésző szabálya (CSP) engedi a tárat — és CSAK azt
        $this->client->request('GET', '/rpw-login.html');
        $csp = (string) $this->client->getResponse()->headers->get('Content-Security-Policy');
        self::assertStringContainsString("img-src 'self' data: blob: https://eu2.contabostorage.com;", $csp);
        self::assertStringContainsString("connect-src 'self' https://eu2.contabostorage.com;", $csp);
    }
}
