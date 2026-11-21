<?php

declare(strict_types=1);

namespace App\Tests\Support;

use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

/** A Resend API helyett: rögzíti a kimenő kérést, és sikeres választ ad. */
final class FakeHttp extends MockHttpClient
{
    public static array $sent = [];

    public function __construct()
    {
        parent::__construct(static function (string $method, string $url, array $opts) {
            self::$sent[] = ['url' => $url, 'body' => json_decode($opts['body'] ?? '{}', true)];

            return new MockResponse('{"id":"msg_test_1"}', ['http_code' => 200]);
        });
    }
}
