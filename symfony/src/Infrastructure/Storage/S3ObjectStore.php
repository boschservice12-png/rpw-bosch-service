<?php

declare(strict_types=1);

namespace App\Infrastructure\Storage;

use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Objektumtár (S3-kompatibilis). A KÉP NEM MEGY ÁT A SZERVEREN: a telefon előre aláírt URL-lel
 * közvetlenül a tárba tölt és onnan olvas — 150 cég forgalma sem terheli az RPW szervert.
 *
 * Biztonság:
 *  - a kulcs csak a szerveren; a böngésző egyetlen objektumra, egyetlen műveletre, 10 percre / 1 órára kap URL-t
 *  - a feltöltés típusa (Content-Type) az aláírás része, és a kiterjesztésből jön: kép vagy PDF, más nem
 *  - olvasáskor a tár a kiterjesztés szerinti típust adja vissza; ami nem kép/PDF, az letöltésként jön
 *  - kulcs: <cég>/<munka>/<fájl> — a cég a jogosultság-ellenőrzésből jön, nem a böngészőből
 */
final class S3ObjectStore implements ObjectStore
{
    public const MIME = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp',
        'gif' => 'image/gif', 'heic' => 'image/heic', 'pdf' => 'application/pdf'];

    public function __construct(private readonly S3Signer $signer, private readonly HttpClientInterface $http)
    {
    }

    public static function key(string $shop, string $path): string
    {
        if (preg_match('/^[A-Za-z0-9-]{1,64}$/', $shop) !== 1 || !FileStore::validPath($path)) {
            throw new \InvalidArgumentException('bad key');
        }

        return $shop.'/'.$path;
    }

    public static function mimeOf(string $path): string
    {
        return self::MIME[strtolower(pathinfo($path, \PATHINFO_EXTENSION))] ?? 'application/octet-stream';
    }

    public function uploadTicket(string $shop, string $path, bool $upsert, string $baseUrl): array
    {
        $key = self::key($shop, $path);
        if (!$upsert && $this->exists($shop, $path)) {
            // az ügyfél meglévő fájlt nem írhat felül (a helyi tár 409-ével azonos szabály)
            throw new \DomainException('exists');
        }
        $mime = self::mimeOf($path);

        return ['signedUrl' => $this->signer->presign('PUT', $key, self::UPLOAD_TTL, ['content-type' => $mime]),
            'token' => '', 'direct' => true, 'contentType' => $mime];
    }

    public function readUrls(string $shop, array $paths, string $baseUrl): array
    {
        // a létezés-ellenőrzés PÁRHUZAMOSAN megy (egy dossziénál akár 60 fotó): egy körút, nem hatvan
        $pending = [];
        foreach ($paths as $p) {
            $pending[$p] = $this->http->request('HEAD', $this->signer->presign('HEAD', self::key($shop, $p), 60), ['timeout' => 10]);
        }
        $out = [];
        foreach ($pending as $p => $res) {
            try {
                $ok = $res->getStatusCode() === 200;
            } catch (\Throwable) {
                $ok = false;
            }
            $mime = self::mimeOf($p);
            $q = ['response-content-type' => $mime];
            if (!str_starts_with($mime, 'image/') && $mime !== 'application/pdf') {
                $q['response-content-disposition'] = 'attachment';
            }
            $out[$p] = $ok ? $this->signer->presign('GET', self::key($shop, $p), self::READ_TTL, [], $q) : null;
        }

        return $out;
    }

    public function exists(string $shop, string $path): bool
    {
        return $this->http->request('HEAD', $this->signer->presign('HEAD', self::key($shop, $path), 60), ['timeout' => 10])->getStatusCode() === 200;
    }

    public function remove(string $shop, string $path): void
    {
        $code = $this->http->request('DELETE', $this->signer->presign('DELETE', self::key($shop, $path), 60), ['timeout' => 10])->getStatusCode();
        if ($code !== 204 && $code !== 200 && $code !== 404) {
            throw new \RuntimeException('storage delete '.$code);
        }
    }

    public function browserOrigin(): ?string
    {
        return $this->signer->origin();
    }

    /**
     * Beüzemelési próba a VALÓDI tárral: feltöltés → létezik → letöltés (bájtra egyezik) → törlés → eltűnt.
     *
     * @return list<array{0:string,1:bool,2:string}> [lépés, sikerült, részlet]
     */
    public function probe(): array
    {
        $key = '_rpw-probe/'.bin2hex(random_bytes(8)).'.jpg';
        $body = "\xFF\xD8\xFF".random_bytes(29);
        $steps = [];
        $try = function (string $name, callable $fn) use (&$steps): bool {
            try {
                [$ok, $detail] = $fn();
            } catch (\Throwable $e) {
                [$ok, $detail] = [false, $e::class.': '.mb_substr($e->getMessage(), 0, 160)];
            }
            $steps[] = [$name, $ok, $detail];

            return $ok;
        };
        $code = fn (string $m, string $k, array $h = [], ?string $b = null) => $this->http->request($m, $this->signer->presign($m, $k, 60, $h),
            ['headers' => $h, 'body' => $b ?? '', 'timeout' => 20])->getStatusCode();
        $try('feltöltés (PUT, aláírt típussal)', fn () => [($c = $code('PUT', $key, ['content-type' => 'image/jpeg'], $body)) === 200, 'HTTP '.$c])
            && $try('létezik (HEAD)', fn () => [($c = $code('HEAD', $key)) === 200, 'HTTP '.$c])
            && $try('letöltés (GET, bájtra egyezik)', function () use ($key, $body) {
                $r = $this->http->request('GET', $this->signer->presign('GET', $key, 60), ['timeout' => 20]);

                return [$r->getStatusCode() === 200 && $r->getContent(false) === $body, 'HTTP '.$r->getStatusCode()];
            })
            && $try('törlés (DELETE)', fn () => [\in_array($c = $code('DELETE', $key), [200, 204], true), 'HTTP '.$c])
            && $try('eltűnt (HEAD → 404)', fn () => [($c = $code('HEAD', $key)) === 404, 'HTTP '.$c]);
        // aláírás nélkül a tár NEM adhat ki semmit (privát tároló)
        $try('aláírás nélkül elutasít', function () use ($key) {
            $c = $this->http->request('GET', $this->signer->origin().parse_url($this->signer->presign('GET', $key, 60), \PHP_URL_PATH), ['timeout' => 20])->getStatusCode();

            return [\in_array($c, [401, 403], true), 'HTTP '.$c];
        });

        return $steps;
    }

    /** A tár CORS-szabálya: a böngésző CSAK a megadott címről tölthet fel és olvashat (PUT, GET, HEAD). */
    public function applyCors(string $origin): int
    {
        if (preg_match('#^https://[a-z0-9.-]+(:\d+)?$#', $origin) !== 1) {
            throw new \InvalidArgumentException('az eredet csak https://<domain> lehet');
        }
        $xml = '<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration><CORSRule>'
            .'<AllowedOrigin>'.$origin.'</AllowedOrigin><AllowedMethod>PUT</AllowedMethod><AllowedMethod>GET</AllowedMethod>'
            .'<AllowedMethod>HEAD</AllowedMethod><AllowedHeader>content-type</AllowedHeader><MaxAgeSeconds>3600</MaxAgeSeconds>'
            .'</CORSRule></CORSConfiguration>';
        $h = ['content-md5' => base64_encode(md5($xml, true)), 'content-type' => 'application/xml'];

        return $this->http->request('PUT', $this->signer->presignBucket('PUT', ['cors' => ''], 60, $h), ['headers' => $h, 'body' => $xml, 'timeout' => 20])->getStatusCode();
    }
}
