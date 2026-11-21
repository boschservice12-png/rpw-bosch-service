<?php

// Fejlesztői szerver (php -S) útválasztója: a public/ valódi fájljai (pl. a
// rögzített supabase-js) közvetlenül mennek, minden más a Symfonyhoz.
// Élesben ezt a webszerver (Caddy / nginx) végzi, ez a fájl ott nem kell.
$f = __DIR__.parse_url($_SERVER['REQUEST_URI'], \PHP_URL_PATH);
if ($f !== __DIR__.'/' && is_file($f) && !str_ends_with($f, '.php')) {
    return false;
}
// a Symfony Runtime a SCRIPT_FILENAME-ből tölti be az alkalmazást
$_SERVER['SCRIPT_FILENAME'] = __DIR__.'/index.php';
$_SERVER['SCRIPT_NAME'] = '/index.php';
require __DIR__.'/index.php';
