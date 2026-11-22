<?php

declare(strict_types=1);

namespace App\Tests\Support;

use Symfony\Component\HttpClient\Response\MockResponse;

/** Memóriabeli S3 (MockHttpClient-hez): ListObjectsV2 lapozással, GET, PUT, HEAD, DELETE; aláírás nélkül 403. */
final class MemoryS3
{
    /** @var array<string,string> kulcs → tartalom */
    public array $objects = [];
    /** @var list<string> */
    public array $calls = [];

    public function __construct(private readonly string $bucket, private readonly int $pageSize = 2)
    {
    }

    public function __invoke(string $method, string $url, array $o = []): MockResponse
    {
        parse_str((string) parse_url($url, \PHP_URL_QUERY), $q);
        if (!isset($q['X-Amz-Signature'])) {
            return new MockResponse('', ['http_code' => 403]);
        }
        $path = rawurldecode((string) parse_url($url, \PHP_URL_PATH));
        $key = ltrim(substr($path, \strlen('/'.$this->bucket)), '/');
        $this->calls[] = $method.' '.$key;
        if ($method === 'GET' && $key === '' && ($q['list-type'] ?? '') === '2') {
            $keys = array_keys($this->objects);
            sort($keys, \SORT_STRING);
            $start = isset($q['continuation-token']) ? (int) $q['continuation-token'] : 0;
            $page = \array_slice($keys, $start, $this->pageSize);
            $more = $start + $this->pageSize < \count($keys);
            $xml = '<ListBucketResult>'.implode('', array_map(static fn ($k) => '<Contents><Key>'.htmlspecialchars($k).'</Key></Contents>', $page))
                .'<IsTruncated>'.($more ? 'true' : 'false').'</IsTruncated>'.($more ? '<NextContinuationToken>'.($start + $this->pageSize).'</NextContinuationToken>' : '').'</ListBucketResult>';

            return new MockResponse($xml);
        }

        return match ($method) {
            'PUT' => (function () use ($key, $o) { $this->objects[$key] = (string) ($o['body'] ?? ''); return new MockResponse('', ['http_code' => 200]); })(),
            'GET' => isset($this->objects[$key]) ? new MockResponse($this->objects[$key]) : new MockResponse('', ['http_code' => 404]),
            'HEAD' => new MockResponse('', ['http_code' => isset($this->objects[$key]) ? 200 : 404]),
            'DELETE' => (function () use ($key) { unset($this->objects[$key]); return new MockResponse('', ['http_code' => 204]); })(),
            default => new MockResponse('', ['http_code' => 501]),
        };
    }
}
