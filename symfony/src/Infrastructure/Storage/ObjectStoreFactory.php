<?php

declare(strict_types=1);

namespace App\Infrastructure\Storage;

use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * A fotótár kiválasztása a környezetből (.env.local):
 *   RPW_STORAGE_BACKEND=local (alap) — a szerver lemeze
 *   RPW_STORAGE_BACKEND=s3            — RPW_S3_ENDPOINT, RPW_S3_REGION, RPW_S3_BUCKET, RPW_S3_ACCESS_KEY, RPW_S3_SECRET_KEY
 * Hiányos s3-beállítással a szerver NEM indul el csendben helyi tárral (az adat rossz helyre kerülne).
 */
final class ObjectStoreFactory
{
    public static function create(
        ?string $backend,
        FileStore $files,
        HttpClientInterface $http,
        ?string $endpoint = '',
        ?string $region = '',
        ?string $bucket = '',
        ?string $accessKey = '',
        #[\SensitiveParameter] ?string $secretKey = '',
        ?string $pathStyle = '1',
    ): ObjectStore {
        [$backend, $endpoint, $region, $bucket, $accessKey, $secretKey] = array_map(static fn ($v) => trim((string) $v),
            [$backend, $endpoint, $region, $bucket, $accessKey, $secretKey]);
        $pathStyle = (string) ($pathStyle ?? '1');
        if ($backend === '' || $backend === 'local') {
            return new LocalObjectStore($files);
        }
        if ($backend !== 's3') {
            throw new \InvalidArgumentException('RPW_STORAGE_BACKEND: local vagy s3 (ez: '.$backend.')');
        }
        foreach (['RPW_S3_ENDPOINT' => $endpoint, 'RPW_S3_BUCKET' => $bucket, 'RPW_S3_ACCESS_KEY' => $accessKey, 'RPW_S3_SECRET_KEY' => $secretKey] as $k => $v) {
            if ($v === '') {
                throw new \InvalidArgumentException($k.' hiányzik (RPW_STORAGE_BACKEND=s3)');
            }
        }
        if (!str_starts_with($endpoint, 'https://')) {
            throw new \InvalidArgumentException('RPW_S3_ENDPOINT csak https:// lehet');
        }

        return new S3ObjectStore(new S3Signer($endpoint, $region !== '' ? $region : 'us-east-1', $bucket, $accessKey, $secretKey,
            !\in_array(strtolower($pathStyle), ['0', 'false', 'no'], true)), $http);
    }
}
