<?php

declare(strict_types=1);

namespace App\Domain\Job;

/**
 * Tiszta segédfüggvények a munka-JSON olvasásához.
 *
 * A munka adata szándékosan EGY tömb (a régi rpw_jobs.data JSONB-vel
 * azonos szerkezet), így a régi és az új rendszer ugyanazt az adatot
 * olvassa a párhuzamos üzem alatt. Ezek a függvények a JS-modul
 * (rpw-workflow.js) predikátumainak pontos PHP-megfelelői.
 */
final class JobData
{
    /** Generikus / helykitöltő végrehajtói nevek — nem fogadhatók el. */
    public const PLACEHOLDER_NAMES = ['lakatos', 'vopsitor', 'worker', 'admin', 'test', 'user', 'n/a', 'na', '-', 'xxx', 'asd', 'aaa'];

    /** Pont-jelölésű vagy tömb-út kiolvasása. Hiányzó út → null. */
    public static function get(array $data, string|array $path): mixed
    {
        $parts = \is_array($path) ? $path : explode('.', $path);
        $cur = $data;
        foreach ($parts as $p) {
            if (!\is_array($cur) || !\array_key_exists((string) $p, $cur)) {
                return null;
            }
            $cur = $cur[(string) $p];
        }

        return $cur;
    }

    public static function nonEmpty(mixed $v): bool
    {
        if ($v === null) {
            return false;
        }
        if (\is_bool($v)) {
            return true;
        }
        if (\is_array($v)) {
            return true;
        }

        return trim((string) $v) !== '';
    }

    /** Pozitív szám (a JS parseFloat-hoz hasonlóan a "2.5" szöveg is szám). */
    public static function pos(mixed $v): bool
    {
        if (\is_bool($v) || $v === null || \is_array($v)) {
            return false;
        }
        if (!is_numeric(trim((string) $v))) {
            // parseFloat("3h") === 3 — a régi kliens ezt elfogadta
            if (preg_match('/^\s*([+-]?\d+(\.\d+)?)/', (string) $v, $m) !== 1) {
                return false;
            }
            $v = $m[1];
        }

        return (float) $v > 0;
    }

    /** Lista: csak valódi (0-tól indexelt) tömb; minden más üres lista. */
    public static function arr(mixed $v): array
    {
        return \is_array($v) && array_is_list($v) ? $v : [];
    }

    public static function obj(mixed $v): array
    {
        return \is_array($v) && ($v === [] || !array_is_list($v)) ? $v : [];
    }

    /** Valódi fotó: van data / url / key / path / ref — nem a tömb hossza számít. */
    public static function isRealPhoto(mixed $p): bool
    {
        if (!\is_array($p)) {
            return false;
        }
        foreach (['data', 'url', 'key', 'path', 'ref'] as $k) {
            if (self::nonEmpty($p[$k] ?? null) && !\is_array($p[$k])) {
                return true;
            }
        }

        return false;
    }

    public static function realPhotoCount(mixed $list): int
    {
        return \count(array_filter(self::arr($list), [self::class, 'isRealPhoto']));
    }

    public static function isRealPerson(mixed $name): bool
    {
        if ($name === null || \is_array($name)) {
            return false;
        }
        $s = trim((string) $name);
        if (mb_strlen($s) < 3) {
            return false;
        }

        return !\in_array(mb_strtolower($s), self::PLACEHOLDER_NAMES, true);
    }

    /** „Csak dosszié” (avizare daună) — a szerviz nem javít, csak iratot gyűjt. */
    public static function csakDosszie(array $job): bool
    {
        $flux = $job['flux'] ?? null;

        return $flux === 'doar_dosar' || ($flux === null && ($job['doarDosar'] ?? null) === true);
    }

    public static function isAuto(array $job): bool
    {
        return ($job['damageType'] ?? null) === 'auto';
    }
}
