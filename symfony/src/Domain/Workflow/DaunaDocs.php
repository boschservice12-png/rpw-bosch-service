<?php

declare(strict_types=1);

namespace App\Domain\Workflow;

use App\Domain\Job\JobData;

/**
 * A kárdosszié (avizare daună) kötelező iratlistája — a rpw-config.js
 * RPW_DAUNA_DOCS pontos tükre. Ugyanez dönti el, hogy a ZIP elkészíthető-e,
 * és hogy a „csak dosszié” munka 1. fázisa lezárható-e.
 */
final class DaunaDocs
{
    public const GROUPS = [
        ['key' => 'constatare', 'label' => 'Constatare / Proces verbal', 'either' => true, 'items' => [
            ['key' => 'constatare_amiabila', 'label' => 'Constatare amiabilă'],
            ['key' => 'proces_verbal', 'label' => 'Proces verbal poliție'],
        ]],
        ['key' => 'pagubit', 'label' => 'Acte păgubit', 'items' => [
            ['key' => 'pag_buletin', 'label' => 'Buletin'],
            ['key' => 'pag_talon_fata', 'label' => 'Talon față'],
            ['key' => 'pag_talon_verso', 'label' => 'Talon verso'],
            ['key' => 'pag_permis_fata', 'label' => 'Permis față'],
            ['key' => 'pag_permis_verso', 'label' => 'Permis verso'],
        ]],
        ['key' => 'declaratie', 'label' => 'Declarație daună', 'items' => [
            ['key' => 'declaratie_dauna', 'label' => 'Declarație daună'],
        ]],
        ['key' => 'polita', 'label' => 'Poliță asigurare', 'items' => [
            ['key' => 'polita_rca', 'label' => 'Poliță RCA / CASCO'],
        ]],
        ['key' => 'imputernicire', 'label' => 'Împuternicire', 'optional' => true, 'items' => [
            ['key' => 'imputernicire_doc', 'label' => 'Împuternicire (firmă / leasing)'],
        ]],
        ['key' => 'vinovat', 'label' => 'Acte vinovat', 'items' => [
            ['key' => 'vin_buletin', 'label' => 'Buletin'],
            ['key' => 'vin_talon', 'label' => 'Talon'],
            ['key' => 'vin_permis', 'label' => 'Permis'],
        ]],
        ['key' => 'foto_auto', 'label' => 'Foto auto (4 poziții)', 'items' => [
            ['key' => 'foto_fata', 'label' => 'Față'],
            ['key' => 'foto_spate', 'label' => 'Spate'],
            ['key' => 'foto_stanga', 'label' => 'Stânga'],
            ['key' => 'foto_dreapta', 'label' => 'Dreapta'],
        ]],
        ['key' => 'foto_serie', 'label' => 'Foto serie caroserie', 'items' => [
            ['key' => 'foto_serie_caroserie', 'label' => 'Serie caroserie (VIN)'],
        ]],
        ['key' => 'foto_km', 'label' => 'Foto kilometraj', 'items' => [
            ['key' => 'foto_km', 'label' => 'Kilometraj (bord)'],
        ]],
        ['key' => 'foto_avarii', 'label' => 'Foto poziții avariate', 'items' => [
            ['key' => 'foto_avarii', 'label' => 'Poziții avariate'],
        ]],
    ];

    /** Van-e valódi fájl az iratlista adott rekeszében? */
    public static function slotHasFile(array $job, string $slot): bool
    {
        $a = JobData::get($job, ['dosarActe', $slot]);
        if (!\is_array($a) || $a === []) {
            return false;
        }
        $list = array_is_list($a) ? $a : [$a];
        foreach ($list as $f) {
            if (!\is_array($f)) {
                continue;
            }
            foreach (['url', 'path', 'key', 'data', 'ref'] as $k) {
                if (isset($f[$k]) && !\is_array($f[$k]) && trim((string) $f[$k]) !== '') {
                    return true;
                }
            }
        }

        return false;
    }

    /** A hiányzó kötelező iratok címkéi. Üres lista = a dosszié kész. */
    public static function missing(array $job): array
    {
        $out = [];
        foreach (self::GROUPS as $g) {
            if (!empty($g['optional'])) {
                continue;
            }
            if (!empty($g['either'])) {
                $any = false;
                foreach ($g['items'] as $it) {
                    if (self::slotHasFile($job, $it['key'])) {
                        $any = true;
                        break;
                    }
                }
                if (!$any) {
                    $out[] = $g['label'];
                }
                continue;
            }
            foreach ($g['items'] as $it) {
                if (!self::slotHasFile($job, $it['key'])) {
                    $out[] = $g['label'].' / '.$it['label'];
                }
            }
        }

        return $out;
    }
}
