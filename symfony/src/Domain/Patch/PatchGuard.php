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
        'override', 'transition', 'workflowState', 'history', 'workflowVersion',
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

    public const DEFAULT_CAPABILITY = 'work';

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

    /** @return array{ok:bool, need?:string, fields?:list<string>} */
    public static function permission(array $patch, Actor $actor): array
    {
        $bad = [];
        $need = null;
        foreach (self::paths($patch) as $path) {
            $cap = self::capabilityFor($path);
            if (!$actor->can($cap)) {
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
