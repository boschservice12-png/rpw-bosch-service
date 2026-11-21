<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Infrastructure\Backup\BackupService;
use App\Security\ProductionGuardSubscriber;
use App\Security\SecretPolicy;
use PHPUnit\Framework\TestCase;

final class SecurityLayersTest extends TestCase
{
    public function testSecretPolicy(): void
    {
        foreach (['', 'change-me-in-env-local', 'dev-only-not-a-secret', 'short', str_repeat('a', 40)] as $weak) {
            self::assertTrue(SecretPolicy::weak($weak), $weak);
        }
        self::assertFalse(SecretPolicy::weak(bin2hex(random_bytes(24))));
    }

    public function testProductionGuardOnlyBitesInProd(): void
    {
        self::assertSame([], ProductionGuardSubscriber::problems('dev', true, ''));
        self::assertCount(2, ProductionGuardSubscriber::problems('prod', true, 'change-me-in-env-local'));
        self::assertSame([], ProductionGuardSubscriber::problems('prod', false, bin2hex(random_bytes(24))));
    }

    public function testBackupEncryptionRoundTripAndTamperDetection(): void
    {
        $key = sodium_crypto_secretstream_xchacha20poly1305_keygen();
        $dir = sys_get_temp_dir().'/rpwbk-'.bin2hex(random_bytes(4));
        mkdir($dir);
        $plain = random_bytes(200_000);   // több blokk
        file_put_contents("$dir/in", $plain);
        BackupService::encryptFile("$dir/in", "$dir/enc", $key);
        self::assertStringNotContainsString(substr($plain, 1000, 64), (string) file_get_contents("$dir/enc"), 'titkosítva van');
        BackupService::decryptFile("$dir/enc", "$dir/out", $key);
        self::assertSame($plain, file_get_contents("$dir/out"));

        $bad = (string) file_get_contents("$dir/enc");
        $bad[5000] = \chr(\ord($bad[5000]) ^ 1);
        file_put_contents("$dir/bad", $bad);
        try {
            BackupService::decryptFile("$dir/bad", "$dir/x", $key);
            self::fail('a hamisított mentést észre kell venni');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('sérült', $e->getMessage());
        }
        // csonkítás BLOKKHATÁRON (fejléc + 1 teljes blokk): hiányzik a záró blokk
        $block = 65536 + SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_ABYTES;
        file_put_contents("$dir/cut", substr((string) file_get_contents("$dir/enc"), 0, SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_HEADERBYTES + $block));
        try {
            BackupService::decryptFile("$dir/cut", "$dir/x", $key);
            self::fail('a csonka mentést észre kell venni');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('csonka', $e->getMessage());
        }
        // csonkítás blokk KÖZEPÉN: a hitelesítés bukik
        file_put_contents("$dir/cut2", substr((string) file_get_contents("$dir/enc"), 0, 70_000));
        try {
            BackupService::decryptFile("$dir/cut2", "$dir/x", $key);
            self::fail('a blokk közepén vágott mentést is észre kell venni');
        } catch (\RuntimeException $e) {
            self::assertStringContainsString('sérült', $e->getMessage());
        }
        try {
            BackupService::decryptFile("$dir/enc", "$dir/x", sodium_crypto_secretstream_xchacha20poly1305_keygen());
            self::fail('rossz kulccsal nem fejthető vissza');
        } catch (\RuntimeException) {
            self::assertTrue(true);
        }
        array_map('unlink', glob("$dir/*"));
        rmdir($dir);
    }
}
