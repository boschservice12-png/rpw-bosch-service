<?php

declare(strict_types=1);

namespace App\Infrastructure\Storage;

use Symfony\Contracts\HttpClient\HttpClientInterface;

/** A másolat célja (.env.local): RPW_REPLICA_ENDPOINT, _REGION, _BUCKET, _ACCESS_KEY, _SECRET_KEY. Üresen: nincs beállítva. */
final class ReplicaFactory
{
    public static function create(HttpClientInterface $http, ?string $endpoint, ?string $region, ?string $bucket, ?string $accessKey,
        #[\SensitiveParameter] ?string $secretKey): ?S3ObjectStore
    {
        if (trim((string) $endpoint) === '') {
            return null;
        }

        return ObjectStoreFactory::s3($http, trim((string) $endpoint), trim((string) $region), trim((string) $bucket),
            trim((string) $accessKey), trim((string) $secretKey));
    }
}
