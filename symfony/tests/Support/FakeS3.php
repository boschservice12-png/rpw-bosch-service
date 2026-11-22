<?php

declare(strict_types=1);

namespace App\Tests\Support;

use Symfony\Component\HttpClient\Response\MockResponse;

/**
 * A tesztkörnyezet http_client-je (framework.http_client.mock_response_factory): hálózat helyett
 * egy memóriabeli S3. A teszt a $existing listába teszi a „meglévő” kulcsokat, és a $calls-ban
 * látja, mit kérdezett a szerver a tártól.
 */
final class FakeS3
{
    /** @var array<string,true> */
    public static array $existing = [];
    /** @var list<string> */
    public static array $calls = [];

    public function __invoke(string $method, string $url, array $options = []): MockResponse
    {
        $path = rawurldecode((string) parse_url($url, \PHP_URL_PATH));
        self::$calls[] = $method.' '.$path;
        $hit = isset(self::$existing[$path]);

        return match ($method) {
            'HEAD' => new MockResponse('', ['http_code' => $hit ? 200 : 404]),
            'DELETE' => new MockResponse('', ['http_code' => 204]),
            default => new MockResponse('', ['http_code' => 501]),
        };
    }
}
