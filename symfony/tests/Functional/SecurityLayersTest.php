<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Infrastructure\Backup\BackupService;

final class SecurityLayersTest extends ApiTestCase
{
    public function testSecurityHeadersOnEveryResponse(): void
    {
        $this->client->request('GET', '/api/health');
        $h = $this->client->getResponse()->headers;
        self::assertSame('nosniff', $h->get('X-Content-Type-Options'));
        self::assertSame('DENY', $h->get('X-Frame-Options'));
        self::assertStringContainsString("connect-src 'self'", (string) $h->get('Content-Security-Policy'));
        self::assertStringContainsString("frame-ancestors 'none'", (string) $h->get('Content-Security-Policy'));
        self::assertStringNotContainsString('supabase', (string) $h->get('Content-Security-Policy'), 'a böngésző csak a saját szerverrel beszél');
        self::assertStringContainsString('no-store', (string) $h->get('Cache-Control'));
        self::assertNull($h->get('Strict-Transport-Security'), 'HSTS csak HTTPS-en');
        $this->client->request('GET', '/api/health', [], [], ['HTTPS' => 'on']);
        self::assertStringContainsString('max-age=31536000', (string) $this->client->getResponse()->headers->get('Strict-Transport-Security'));
    }

    public function testForeignOriginCannotWrite(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $body = json_encode(['shop_id' => $s, 'employee_id' => $ids['admin'], 'pin' => '4826']);
        $this->client->request('POST', '/api/login', [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ORIGIN' => 'https://evil.example'], $body);
        self::assertSame(403, $this->client->getResponse()->getStatusCode(), 'idegen oldalról indított írás tiltva');
        $this->client->request('POST', '/rest/v1/rpc/rpw2_roster', [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ORIGIN' => 'https://evil.example'], '{}');
        self::assertSame(403, $this->client->getResponse()->getStatusCode());
        $this->client->request('POST', '/api/login', [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ORIGIN' => 'http://localhost'], $body);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), 'a saját oldal igen');
    }

    public function testSecurityEventsAreRecordedWithoutSecrets(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        for ($i = 0; $i < 10; ++$i) {
            $this->call('POST', '/api/login', ['shop_id' => $s, 'employee_id' => $ids['admin'], 'pin' => '0000']);
        }
        $this->call('POST', '/api/login', ['shop_id' => $s, 'employee_id' => $ids['admin'], 'pin' => '4826']);
        $rows = $this->db->fetchAllAssociative("SELECT action, actor, patch FROM rpw_audit WHERE action LIKE 'sec:%' ORDER BY id");
        $actions = array_column($rows, 'action');
        self::assertSame(9, \count(array_keys($actions, 'sec:bad_pin')));
        self::assertContains('sec:account_locked', $actions);
        self::assertContains('sec:login_while_locked', $actions);
        self::assertSame('Ana Admin', $rows[0]['actor']);
        self::assertStringNotContainsString('0000', implode(' ', array_column($rows, 'patch')), 'PIN soha nem kerül a naplóba');
        $log = (string) @file_get_contents(static::getContainer()->getParameter('kernel.logs_dir').'/security-test-'.date('Y-m-d').'.log');
        self::assertStringContainsString('"event":"account_locked"', $log, 'a fail2ban ezt a sort olvassa');
    }

    public function testAbsoluteSessionLifetime(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $t = $this->login($s, $ids['admin'], '4826');
        self::assertSame(200, $this->call('GET', '/api/session', null, $t)['_status']);
        // a munkamenet 25 órája jött létre, de a csúszó lejárat még élne
        $this->db->executeStatement('UPDATE rpw_sessions SET created_at = :c', ['c' => gmdate('Y-m-d H:i:sP', time() - 25 * 3600)]);
        self::assertSame(401, $this->call('GET', '/api/session', null, $t)['_status'], 'a használat sem tartja életben örökké');
    }

    public function testPinChangeRevokesOtherSessionsButKeepsCurrent(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $phone = $this->login($s, $ids['admin'], '4826');    // pl. egy elveszett telefon
        $desk = $this->login($s, $ids['admin'], '4826');
        self::assertTrue($this->call('POST', '/api/team/pin', ['pin' => '7391'], $desk)['ok']);
        self::assertSame(200, $this->call('GET', '/api/session', null, $desk)['_status'], 'a saját munkamenet marad');
        self::assertSame(401, $this->call('GET', '/api/session', null, $phone)['_status'], 'a többi megszűnik');
    }

    public function testBackupOfLiveDatabaseVerifies(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $dir = sys_get_temp_dir().'/rpwb-'.bin2hex(random_bytes(4));
        $svc = new BackupService($this->db, $dir.'/nostorage', base64_encode(sodium_crypto_secretstream_xchacha20poly1305_keygen()));
        $r = $svc->create($dir);
        self::assertTrue($svc->verify($r['dir'])['ok']);
        self::assertFileExists($r['dir'].'/db.sqlite.enc');
        self::assertFileDoesNotExist($r['dir'].'/db.sqlite', 'titkosítatlan másolat nem marad');
        $this->expectException(\RuntimeException::class);
        (new BackupService($this->db, $dir, null))->create($dir);   // kulcs nélkül nem ment
    }

    /** Friss szerver: a fotótár létezik, de üres — a mentésnek ilyenkor is sikerülnie kell (2026-11-22, próbatelepítésen talált hiba). */
    public function testBackupWithEmptyAndFilledStorage(): void
    {
        $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $dir = sys_get_temp_dir().'/rpwb-'.bin2hex(random_bytes(4));
        mkdir($dir.'/storage', 0700, true);
        $svc = new BackupService($this->db, $dir.'/storage', base64_encode(sodium_crypto_secretstream_xchacha20poly1305_keygen()));

        $empty = $svc->create($dir.'/bk');
        self::assertTrue($svc->verify($empty['dir'])['ok'], 'üres fotótárral is ellenőrizhető mentés');
        self::assertFileDoesNotExist($empty['dir'].'/storage.tar.enc');

        mkdir($dir.'/storage/job-1', 0700);
        file_put_contents($dir.'/storage/job-1/ov_0.jpg', random_bytes(2048));
        sleep(1);   // a mentési mappa neve másodperc pontosságú
        $full = $svc->create($dir.'/bk');
        self::assertTrue($svc->verify($full['dir'])['ok']);
        self::assertFileExists($full['dir'].'/storage.tar.enc', 'a fotók is bekerülnek');
    }

    /** Sikertelen mentés nem hagy félkész mappát (különben a „legutóbbi mentés” egy hibás mappa lenne). */
    public function testFailedBackupLeavesNothingBehind(): void
    {
        $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $dir = sys_get_temp_dir().'/rpwb-'.bin2hex(random_bytes(4));
        mkdir($dir.'/storage', 0700, true);
        symlink('/nonexistent/rpw-'.bin2hex(random_bytes(4)), $dir.'/storage/broken.jpg');   // olvashatatlan elem → a mentés elbukik
        $svc = new BackupService($this->db, $dir.'/storage', base64_encode(sodium_crypto_secretstream_xchacha20poly1305_keygen()));
        try {
            $svc->create($dir.'/bk');
            self::fail('a mentésnek el kell buknia');
        } catch (\UnexpectedValueException) {
            self::assertSame([], glob($dir.'/bk/rpw-*') ?: [], 'nem maradt félkész mentés');
        }
    }
}
