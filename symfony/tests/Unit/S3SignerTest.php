<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Infrastructure\Storage\S3Signer;
use PHPUnit\Framework\TestCase;

final class S3SignerTest extends TestCase
{
    /**
     * AWS hivatalos tesztpéldája (Signature V4, query string auth, „GET /test.txt”, 2013-05-24, 86400 mp):
     * https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
     * Ha ez egyezik, az aláírás algoritmusa bitre azonos az S3-éval.
     */
    public function testOfficialAwsExampleSignature(): void
    {
        $s = new S3Signer('https://s3.amazonaws.com', 'us-east-1', 'examplebucket', 'AKIAIOSFODNN7EXAMPLE',
            'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', pathStyle: false);
        $url = $s->presign('GET', 'test.txt', 86400, [], [], gmmktime(0, 0, 0, 5, 24, 2013));

        self::assertSame('https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256'
            .'&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z'
            .'&X-Amz-Expires=86400&X-Amz-SignedHeaders=host'
            .'&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404', $url);
    }

    public function testPathStyleKeyAndSignedContentType(): void
    {
        $s = new S3Signer('https://eu2.contabostorage.com', 'default', 'rpw', 'AK', 'SK');
        $url = $s->presign('PUT', 'shop-1/RPW-x/ov 0.jpg', 600, ['Content-Type' => 'image/jpeg'], [], 1_700_000_000);

        self::assertStringStartsWith('https://eu2.contabostorage.com/rpw/shop-1/RPW-x/ov%200.jpg?', $url);
        self::assertStringContainsString('X-Amz-SignedHeaders=content-type%3Bhost', $url, 'a típus az aláírás része');
        self::assertStringContainsString('X-Amz-Expires=600', $url);
        self::assertSame('https://eu2.contabostorage.com', $s->origin());

        // más kulcs, más lejárat vagy más típus → más aláírás (nem írható át az URL)
        $sig = static fn (string $u) => substr($u, strrpos($u, '=') + 1);
        self::assertNotSame($sig($url), $sig($s->presign('PUT', 'shop-2/RPW-x/ov 0.jpg', 600, ['Content-Type' => 'image/jpeg'], [], 1_700_000_000)));
        self::assertNotSame($sig($url), $sig($s->presign('PUT', 'shop-1/RPW-x/ov 0.jpg', 601, ['Content-Type' => 'image/jpeg'], [], 1_700_000_000)));
        self::assertNotSame($sig($url), $sig($s->presign('PUT', 'shop-1/RPW-x/ov 0.jpg', 600, ['Content-Type' => 'text/html'], [], 1_700_000_000)));
    }
}
