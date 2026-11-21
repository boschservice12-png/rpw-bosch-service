<?php

declare(strict_types=1);

namespace App\Domain\Patch;

use App\Domain\Auth\Actor;

/**
 * MENTÉSŐR — a 006_workflow_enforcement.sql logikája PHP-ban.
 *
 *  1. VÉDETT WORKFLOW-MEZŐK: a normál mentés nem érinti őket (rekurzívan).
 *     A fázis, a lezárás, a rework csak az állapotgépen át változhat.
 *  2. MEZŐSZINTŰ JOGOSULTSÁG: út → szükséges kapcsoló.
 *  3. ISMERETLEN MEZŐ: alapból 'work' jogot kér (a régi rendszerben
 *     ismeretlen mezőt bárki írhatott — ez itt szándékosan szigorúbb).
 */
final class PatchGuard
{
    public const PROTECTED = [
        'phase', 'phases', 'inchis', 'rework', 'workflowHistory', 'overrideGrants',
        'closing.status', 'closing.closed', 'closing.completed',
        'completedBy', 'finished', 'started', 'reopened', 'skipReason',
        'override', 'transition', 'workflowState', 'history',
    ];

    public const PERMISSIONS = [
        'client' => 'reception', 'phone' => 'reception', 'email' => 'reception', 'vin' => 'reception',
        'plate' => 'reception', 'marca' => 'reception', 'model' => 'reception', 'an' => 'reception',
        'proprietar' => 'reception', 'adresa' => 'reception', 'asigurator' => 'reception', 'nrDosar' => 'reception',
        'docs' => 'reception', 'dosarActe' => 'reception', 'sosire' => 'reception', 'programare' => 'reception',
        'damageType' => 'reception', 'flux' => 'reception', 'dosarStatus' => 'reception', 'dosarPredat' => 'reception',
        'termenPredare' => 'work',
        'elements' => 'work', 'bodyRows' => 'work', 'paintRows' => 'work', 'production' => 'work',
        'photos' => 'work', 'photoKeys' => 'work', 'evalData' => 'work', 'deviz' => 'work', 'reconst' => 'work',
        'norme' => 'work', 'gapLog' => 'work', 'gapReason' => 'work', 'damageReport' => 'work',
        'control' => 'close', 'controlChecks' => 'close', 'controlNote' => 'close',
        'closing' => 'close', 'closingPhotos' => 'close',
        'overrideNote' => 'override',
    ];

    /**
     * Ismeretlen mezőhöz BÁRMELY írási jog elég (reception / work / close /
     * override). A csak-olvasó szerep (pl. szerelő) így sem írhat. A régi
     * rendszerben ismeretlen mezőt bárki írhatott, bejelentkezés nélkül is.
     */
    public const DEFAULT_CAPABILITY = 'any_write';
    public const WRITE_CAPS = ['reception', 'work', 'close', 'override'];

    /** Metaadat, amit a kliens a munka-objektummal együtt küldhet, de NEM adat. */
    public const META_KEYS = ['version', 'updated_at', 'deleted_at', 'created_at'];

    /** A patch összes levélútja pont-jelöléssel (a közbenső objektumok bejárva). */
    public static function paths(array $patch, string $prefix = ''): array
    {
        $out = [];
        foreach ($patch as $k => $v) {
            $cur = $prefix === '' ? (string) $k : $prefix.'.'.$k;
            if (\is_array($v) && $v !== [] && !array_is_list($v)) {
                array_push($out, ...self::paths($v, $cur));
            } else {
                $out[] = $cur;
            }
        }

        return $out;
    }

    /** Prefix-illeszkedés, `*` = tetszőleges kulcs. A rövidebb minta a mélyebb utat is fedi. */
    public static function matches(string $path, string $pattern): bool
    {
        $p = explode('.', $path);
        $m = explode('.', $pattern);
        if (\count($m) > \count($p)) {
            return false;
        }
        foreach ($m as $i => $seg) {
            if ($seg !== '*' && $seg !== $p[$i]) {
                return false;
            }
        }

        return true;
    }

    /** @return list<string> a védett mezőt sértő utak */
    public static function protectedHits(array $patch): array
    {
        $hits = [];
        foreach (self::paths($patch) as $path) {
            foreach (self::PROTECTED as $pat) {
                if (self::matches($path, $pat)) {
                    $hits[] = $path;
                    break;
                }
            }
        }

        return $hits;
    }

    /**
     * A védett utak KISZŰRÉSE (a régi felület szerződése: a normál mentés nem
     * visz workflow-mezőt — a 006-os kliens maga szűrt, itt a szerver teszi).
     *
     * @return array{0: array, 1: list<string>} [a tisztított patch, a kiszűrt utak]
     */
    public static function withoutProtected(array $patch, string $prefix = ''): array
    {
        $out = [];
        $removed = [];
        foreach ($patch as $k => $v) {
            $path = $prefix === '' ? (string) $k : $prefix.'.'.$k;
            $hit = false;
            foreach (self::PROTECTED as $pat) {
                if (self::matches($path, $pat) && substr_count($pat, '.') === substr_count($path, '.')) {
                    $hit = true;
                    break;
                }
            }
            if ($hit) {
                $removed[] = $path;
                continue;
            }
            if (\is_array($v) && $v !== [] && !array_is_list($v)) {
                [$sub, $rm] = self::withoutProtected($v, $path);
                $out[$k] = $sub;
                array_push($removed, ...$rm);
            } else {
                $out[$k] = $v;
            }
        }

        return [$out, $removed];
    }

    /** @return array{ok:bool, need?:string, fields?:list<string>} */
    public static function permission(array $patch, Actor $actor): array
    {
        $bad = [];
        $need = null;
        foreach (self::paths($patch) as $path) {
            $cap = self::capabilityFor($path);
            $ok = $cap === self::DEFAULT_CAPABILITY
                ? array_filter(self::WRITE_CAPS, [$actor, 'can']) !== []
                : $actor->can($cap);
            if (!$ok) {
                $bad[] = $path;
                $need ??= $cap;
            }
        }

        return $bad === [] ? ['ok' => true] : ['ok' => false, 'need' => $need, 'fields' => $bad];
    }

    public static function capabilityFor(string $path): string
    {
        $top = explode('.', $path)[0];

        return self::PERMISSIONS[$top] ?? self::DEFAULT_CAPABILITY;
    }

    /**
     * A TÉNYLEGES VÁLTOZÁS: a patch azon részei, amelyek eltérnek a tárolt
     * értéktől. A felület gyakran a TELJES munkát küldi mentéskor (a
     * fázismezőkkel együtt); a változatlan mező nem írás, ezért se a
     * védett-mező kapu, se a jogosultság nem ütközhet bele. Ami ténylegesen
     * változik, az viszont teljes szigorral ellenőrzött.
     */
    public static function changes(array $base, array $patch): array
    {
        $out = [];
        foreach ($patch as $k => $v) {
            $cur = $base[$k] ?? null;
            $vAssoc = \is_array($v) && $v !== [] && !array_is_list($v);
            $cAssoc = \is_array($cur) && $cur !== [] && !array_is_list($cur);
            if ($vAssoc && $cAssoc) {
                $sub = self::changes($cur, $v);
                if ($sub !== []) {
                    $out[$k] = $sub;
                }
                continue;
            }
            if (!\array_key_exists($k, $base)) {
                // hiányzó mezőt null-ra állítani nem változás (a kliens migrációja így pótol)
                if ($v !== null) {
                    $out[$k] = $v;
                }
                continue;
            }
            if (!self::same($cur, $v)) {
                $out[$k] = $v;
            }
        }

        return $out;
    }

    private static function same(mixed $a, mixed $b): bool
    {
        if (\is_object($a) || \is_object($b)) {
            // üres objektum ({}) és üres lista ([]) adatban egyenértékű: egyik sem tartalmaz semmit
            $ea = \is_object($a) ? get_object_vars($a) === [] : $a === [];
            $eb = \is_object($b) ? get_object_vars($b) === [] : $b === [];

            return $ea && $eb;
        }
        if (\is_int($a) && \is_float($b) || \is_float($a) && \is_int($b)) {
            return (float) $a === (float) $b;
        }
        if (\is_array($a) && \is_array($b)) {
            if (\count($a) !== \count($b) || array_is_list($a) !== array_is_list($b)) {
                return false;
            }
            foreach ($a as $k => $v) {
                if (!\array_key_exists($k, $b) || !self::same($v, $b[$k])) {
                    return false;
                }
            }

            return true;
        }

        return $a === $b;
    }

    /**
     * Mély összefésülés (a jsonb_deep_merge megfelelője): objektum az
     * objektumba fésül, minden más (lista, skalár, null) felülír.
     */
    public static function deepMerge(array $base, array $patch): array
    {
        foreach ($patch as $k => $v) {
            if (\is_array($v) && $v !== [] && !array_is_list($v)
                && \is_array($base[$k] ?? null) && ($base[$k] === [] || !array_is_list($base[$k]))) {
                $base[$k] = self::deepMerge($base[$k], $v);
            } else {
                $base[$k] = $v;
            }
        }

        return $base;
    }
}
