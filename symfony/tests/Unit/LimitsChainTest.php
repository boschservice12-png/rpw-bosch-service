<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Application\DocumentAi;
use App\Controller\FunctionsController;
use App\Controller\JsonInput;
use App\Infrastructure\Ai\AnthropicVisionModel;
use App\Infrastructure\Mail\ResendMailer;
use App\Infrastructure\Storage\FileStore;
use PHPUnit\Framework\TestCase;

/**
 * A MÉRET- ÉS IDŐKORLÁTOK LÁNCA (Ferenc, 2026-11-22: „ellenőrizzük a php nagyságait”).
 * Egy kérés ott bukik el, ahol a LEGSZŰKEBB korlát van — ezért a lánc minden eleme egymáshoz mérve:
 *   böngésző → Caddy (request_body) → PHP-FPM (post_max_size, idő) → alkalmazás → külső szolgáltatás.
 * A számok a VALÓDI sablonokból és a kódból jönnek; ha valaki egyet átír és a lánc elszakad, ez bukik.
 */
final class LimitsChainTest extends TestCase
{
    private static function file(string $rel): string
    {
        return (string) file_get_contents(\dirname(__DIR__, 2).'/'.$rel);
    }

    private static function mb(string $v): int
    {
        preg_match('/^(\d+)\s*(MB|M)$/i', trim($v), $m) === 1 || self::fail('nem olvasható méret: '.$v);

        return (int) $m[1] * 1024 * 1024;
    }

    private static function caddy(string $matcher): int
    {
        preg_match('/request_body '.preg_quote($matcher, '/').' \{\s*max_size (\d+MB)/', self::file('deploy/templates/Caddyfile.tpl'), $m) === 1
            || self::fail('Caddy request_body '.$matcher.' hiányzik');

        return self::mb($m[1]);
    }

    private static function fpm(string $key): string
    {
        preg_match('/^'.preg_quote($key, '/').'\s*=\s*(\S+)/m', self::file('deploy/templates/php-fpm-rpw.conf'), $m) === 1 || self::fail($key.' hiányzik');

        return $m[1];
    }

    public function testBodySizeChain(): void
    {
        $post = self::mb(self::fpm('php_admin_value[post_max_size]'));
        // helyi feltöltés: Caddy ≥ alkalmazás, és a PHP sem szűkebb
        self::assertGreaterThan(FileStore::MAX_BYTES, self::caddy('@upload'), 'Caddy feltöltés > 25 MB (különben a 25 MB-os ígéret hazugság)');
        self::assertGreaterThanOrEqual(self::caddy('@upload'), $post, 'post_max_size ≥ Caddy feltöltési határ');
        // OCR / levél / mentés
        self::assertGreaterThan(FunctionsController::MAX_BODY, self::caddy('@notupload'), 'Caddy > OCR/levél határ');
        self::assertGreaterThan(JsonInput::MAX_BYTES, self::caddy('@notupload'));
        self::assertLessThan(self::caddy('@upload'), self::caddy('@notupload'), 'a nem-feltöltő utak szűkebbek (kisebb támadási felület)');
    }

    public function testMailAndOcrFitTheRequest(): void
    {
        // a levél mellékletei (base64) + a levél szövege beleférnek a kérésbe
        self::assertLessThan(FunctionsController::MAX_BODY, ResendMailer::MAX_ATTACH_TOTAL + 512 * 1024);
        // a böngésző 9,5 MB-os csomagokra bont (rpw-util.js splitAttachments) — a szerver 10 MB-ot fogad
        preg_match('/maxB=o\.maxBytes\|\|\(([\d.]+)\*1024\*1024\)/', self::file('../rpw-util.js'), $m) === 1 || self::fail('splitAttachments maxBytes');
        self::assertLessThanOrEqual(ResendMailer::MAX_ATTACH_TOTAL, (int) ((float) $m[1] * 1024 * 1024));
        preg_match('/maxN=o\.maxCount\|\|(\d+)/', self::file('../rpw-util.js'), $n) === 1 || self::fail('splitAttachments maxCount');
        self::assertLessThanOrEqual(ResendMailer::MAX_ATTACH, (int) $n[1]);
        // egy OCR-kép (base64) belefér a kérésbe
        self::assertLessThan(FunctionsController::MAX_BODY, (int) (DocumentAi::MAX_IMAGE_BYTES * 4 / 3) + 64 * 1024);
    }

    public function testTimeChain(): void
    {
        $terminate = (int) self::fpm('request_terminate_timeout');
        $exec = (int) self::fpm('php_admin_value[max_execution_time]');
        $ai = AnthropicVisionModel::TIMEOUT_SEC * (1 + AnthropicVisionModel::MAX_RETRIES) + 5;   // + újrapróba-várakozás
        self::assertLessThan($terminate, $ai, 'az AI-hívás minden próbával együtt a PHP leállítása ELŐTT végez → rendezett hibaüzenet');
        self::assertLessThanOrEqual($terminate, $exec);
    }

    public function testMemoryHoldsTheLargestRequest(): void
    {
        $mem = self::mb(self::fpm('php_admin_value[memory_limit]'));
        // helyi feltöltés: a törzs + a multipart-bontás másolatai + tartalék ≈ 4× a fájl
        self::assertGreaterThan(4 * FileStore::MAX_BYTES, $mem);
        // 10 párhuzamos folyamat a legrosszabb esetben is elfér egy 8 GB-os gépen (adatbázis + rendszer mellett)
        self::assertLessThan(4 * 1024 ** 3, (int) self::fpm('pm.max_children') * $mem);
    }
}
