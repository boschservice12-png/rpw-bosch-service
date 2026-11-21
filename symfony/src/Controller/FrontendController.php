<?php

declare(strict_types=1);

namespace App\Controller;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * A MEGLÉVŐ FELÜLET kiszolgálása a repó gyökeréből — a fájlok VÁLTOZATLANOK.
 *
 * Két dolgot igazít menet közben:
 *  1. rpw-config.js: a szerver címe (SB_URL) erre a szerverre mutat, és a
 *     biztonságos kapcsolók be vannak kapcsolva (szerveroldali átmenet,
 *     verziózárt mentés, belépés kötelező).
 *  2. a CDN-es könyvtárak (supabase-js, jszip, jspdf, chart.js) helyett a
 *     rögzített helyi másolat — nincs külső függés.
 *
 * Ugyanazokat a fájlokat tiltja, mint a netlify.toml: belső anyag, dokumentáció,
 * SQL, a symfony/ mappa — csak az alkalmazás fájljai szolgálhatók ki.
 */
final class FrontendController
{
    /** CDN → rögzített helyi másolat (public/vendor/). A műhely így nem függ külső CDN-től. */
    public const VENDOR = [
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js' => '/vendor/supabase-js-2.119.0.js',
        'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js' => '/vendor/jszip-3.10.1.min.js',
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js' => '/vendor/jspdf-2.5.1.umd.min.js',
        'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js' => '/vendor/chart.js-4.4.0.umd.js',
    ];
    private const TYPES = ['html' => 'text/html; charset=utf-8', 'js' => 'text/javascript; charset=utf-8', 'png' => 'image/png',
        'ico' => 'image/x-icon', 'webmanifest' => 'application/manifest+json', 'svg' => 'image/svg+xml'];

    public function __construct(
        #[Autowire('%kernel.project_dir%/..')] private readonly string $webRoot,
        #[Autowire('%env(default::RPW_SHOP_ID)%')] private readonly ?string $shopId = null,
    ) {
    }

    #[Route('/', name: 'frontend_index', methods: ['GET'], priority: -10)]
    public function index(): Response
    {
        return $this->file('index.html');
    }

    #[Route('/{file}', name: 'frontend_file', methods: ['GET'], requirements: ['file' => '[A-Za-z0-9][A-Za-z0-9_.-]{0,80}\.(html|js|png|ico|webmanifest|svg)'], priority: -10)]
    public function file(string $file): Response
    {
        $path = realpath($this->webRoot.'/'.$file);
        $root = realpath($this->webRoot);
        if ($path === false || $root === false || \dirname($path) !== $root || !is_file($path)) {
            return $this->notFound();
        }
        $ext = strtolower(pathinfo($path, \PATHINFO_EXTENSION));
        if ($ext === 'html' || $file === 'rpw-config.js') {
            $body = (string) file_get_contents($path);
            $body = $ext === 'html' ? strtr($body, self::VENDOR) : $body.$this->configOverride();

            return new Response($body, 200, ['Content-Type' => self::TYPES[$ext], 'Cache-Control' => 'no-cache', 'X-Content-Type-Options' => 'nosniff']);
        }
        $res = new BinaryFileResponse($path);
        $res->headers->set('Content-Type', self::TYPES[$ext] ?? 'application/octet-stream');
        $res->headers->set('Cache-Control', 'no-cache');
        $res->headers->set('X-Content-Type-Options', 'nosniff');

        return $res;
    }

    /** A régi Netlify-függvények (OCR, besorolás, levél) helye — még nincs átvive. */
    #[Route('/.netlify/functions/{name}', name: 'frontend_netlify_fn', methods: ['GET', 'POST'], requirements: ['name' => '[a-z0-9_-]{1,40}'])]
    public function netlifyFunction(string $name): JsonResponse
    {
        return new JsonResponse(['ok' => false, 'error' => 'not_configured',
            'message' => 'Funcția „'.$name.'” nu este încă disponibilă pe serverul nou.'], 503);
    }

    private function configOverride(): string
    {
        $shop = $this->shopId !== null && $this->shopId !== '' ? json_encode($this->shopId) : 'null';

        return <<<JS

;/* ── RPW Symfony backend (a szerver fűzi hozzá; a repó fájlja változatlan) ── */
(function(){
  if(!window.RPW_CFG) return;
  var c = window.RPW_CFG;
  c.SB_URL = location.origin;
  c.SB_KEY = 'rpw-symfony';
  c.BACKEND = 'symfony';
  if($shop) c.SHOP_ID = $shop;
  c.AUTH_REQUIRED = true;
  c.PATCH_RPC = 'rpw_patch_v3';
  c.SERVER_TRANSITIONS = true;
  c.SAVE_BEFORE_TRANSITION = true;
  c.STORAGE_PRIVATE = true;
  c.STORAGE_GATEWAY = true;
  c.CLIENT_RPC = true;
})();

JS;
    }

    private function notFound(): Response
    {
        $p = $this->webRoot.'/404.html';

        return new Response(is_file($p) ? (string) file_get_contents($p) : 'Not found', 404, ['Content-Type' => 'text/html; charset=utf-8']);
    }
}
