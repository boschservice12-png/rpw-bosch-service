<?php

declare(strict_types=1);

namespace App\Infrastructure\Storage;

/**
 * AWS Signature V4 — ELŐRE ALÁÍRT (presigned) URL, S3-kompatibilis tárhoz (Contabo, Hetzner, AWS, MinIO, …).
 *
 * Tiszta függvény, hálózat nélkül: a kulcs SOHA nem hagyja el a szervert, a böngésző csak egy
 * egyetlen műveletre, egyetlen objektumra és rövid időre szóló URL-t kap. A jóváhagyott fejlécek
 * (pl. Content-Type) bekerülnek az aláírásba — a böngésző nem töltheti fel más típusként.
 * Igazolás: az AWS dokumentációjának hivatalos tesztpéldája (tests/Unit/S3SignerTest.php).
 */
final class S3Signer
{
    public function __construct(
        private readonly string $endpoint,     // pl. https://eu2.contabostorage.com
        private readonly string $region,       // pl. eu-central-1 / default
        private readonly string $bucket,
        private readonly string $accessKey,
        #[\SensitiveParameter] private readonly string $secretKey,
        private readonly bool $pathStyle = true,
    ) {
    }

    /** A tárolóra (nem egy objektumra) szóló művelet, pl. CORS-beállítás: ?cors */
    public function presignBucket(string $method, array $query, int $ttl, array $headers = [], ?int $now = null): string
    {
        return $this->presign($method, '', $ttl, $headers, $query, $now);
    }

    /**
     * @param array<string,string> $headers a böngésző/szerver által KÖTELEZŐEN küldendő, aláírt fejlécek (kisbetűs név)
     * @param array<string,string> $query   további aláírt paraméterek (pl. response-content-type)
     */
    public function presign(string $method, string $key, int $ttl, array $headers = [], array $query = [], ?int $now = null): string
    {
        $now ??= time();
        $amzDate = gmdate('Ymd\THis\Z', $now);
        $day = substr($amzDate, 0, 8);
        $scope = $day.'/'.$this->region.'/s3/aws4_request';

        $u = parse_url($this->endpoint);
        $scheme = $u['scheme'] ?? 'https';
        $host = ($this->pathStyle ? '' : $this->bucket.'.').($u['host'] ?? '').(isset($u['port']) ? ':'.$u['port'] : '');
        $path = ($this->pathStyle ? '/'.self::enc($this->bucket) : '').($key === '' && $this->pathStyle ? '' : '/'.implode('/', array_map(self::enc(...), explode('/', $key))));

        $h = ['host' => $host];
        foreach ($headers as $k => $v) {
            $h[strtolower($k)] = trim($v);
        }
        ksort($h);
        $signedHeaders = implode(';', array_keys($h));

        $q = $query + [
            'X-Amz-Algorithm' => 'AWS4-HMAC-SHA256',
            'X-Amz-Credential' => $this->accessKey.'/'.$scope,
            'X-Amz-Date' => $amzDate,
            'X-Amz-Expires' => (string) $ttl,
            'X-Amz-SignedHeaders' => $signedHeaders,
        ];
        ksort($q, \SORT_STRING);
        $qs = implode('&', array_map(static fn ($k, $v) => self::enc((string) $k).'='.self::enc((string) $v), array_keys($q), $q));

        $canonical = implode("\n", [
            strtoupper($method), $path, $qs,
            implode('', array_map(static fn ($k, $v) => $k.':'.$v."\n", array_keys($h), $h)),
            $signedHeaders, 'UNSIGNED-PAYLOAD',
        ]);
        $toSign = implode("\n", ['AWS4-HMAC-SHA256', $amzDate, $scope, hash('sha256', $canonical)]);

        $k = hash_hmac('sha256', $day, 'AWS4'.$this->secretKey, true);
        $k = hash_hmac('sha256', $this->region, $k, true);
        $k = hash_hmac('sha256', 's3', $k, true);
        $k = hash_hmac('sha256', 'aws4_request', $k, true);

        return $scheme.'://'.$host.$path.'?'.$qs.'&X-Amz-Signature='.hash_hmac('sha256', $toSign, $k);
    }

    /** A tár eredete (séma + host) — a böngésző biztonsági szabályába (CSP) ez kerül. */
    public function origin(): string
    {
        $u = parse_url($this->endpoint);

        return ($u['scheme'] ?? 'https').'://'.($this->pathStyle ? '' : $this->bucket.'.').($u['host'] ?? '').(isset($u['port']) ? ':'.$u['port'] : '');
    }

    /** RFC 3986 — az S3 pontosan így várja (a `~` nem kódolt, a szóköz %20). */
    private static function enc(string $s): string
    {
        return str_replace('%7E', '~', rawurlencode($s));
    }
}
