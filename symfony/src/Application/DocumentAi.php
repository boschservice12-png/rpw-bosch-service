<?php

declare(strict_types=1);

namespace App\Application;

use App\Infrastructure\Ai\VisionModel;

/**
 * IRAT-FELISMERÉS ÉS -BESOROLÁS (a functions/ocr.js és classify.js utódja).
 *
 * A JAVÍTOTT HIBA: a régi függvényben a promptok által kért mezőnevek és az
 * utólagos sémaellenőrzés nevei NEM egyeztek (talon: brand/year/owner vs.
 * marca/an/proprietar; audatex: ore_tinichigerie vs. oreTinichigerie). Ezért
 * a talon adatainak fele, a kárlista és az Audatex-órák ELVESZTEK — az
 * Audatex-OCR egyetlen mezője sem ment át, mindig hibát adott.
 * Itt a séma a FELÜLET által olvasott neveket rögzíti, és strukturált
 * kimenetként megy az API-nak: a válasz garantáltan ilyen alakú.
 *
 * Az AI eredménye SOHA nem vált fázist: minden kockázatos mező emberi
 * megerősítést kér (uncertain), a döntés a felhasználóé.
 */
final class DocumentAi
{
    public const OCR_TYPES = ['talon', 'buletin', 'constatare', 'audatex'];
    public const CLASSIFY_TYPES = ['constatare_amiabila', 'proces_verbal', 'buletin', 'talon_fata', 'talon_verso', 'permis_fata',
        'permis_verso', 'declaratie_dauna', 'polita_rca', 'imputernicire', 'foto_fata', 'foto_spate', 'foto_stanga', 'foto_dreapta',
        'foto_serie_caroserie', 'foto_avarii', 'altceva'];
    public const MAX_IMAGE_CHARS = 7_000_000;
    private const OCR_MAX_TOKENS = 1500;
    private const CLASSIFY_MAX_TOKENS = 256;

    public function __construct(private readonly VisionModel $model)
    {
    }

    /** A bejelentett típusban nem bízunk: a base64 első bájtjai döntenek. */
    public static function detectMedia(string $b64): ?array
    {
        $s = preg_replace('/^data:[^;]+;base64,/', '', $b64) ?? '';

        return match (true) {
            str_starts_with($s, 'JVBER') => ['kind' => 'pdf', 'media' => 'application/pdf', 'data' => $s],
            str_starts_with($s, 'iVBOR') => ['kind' => 'image', 'media' => 'image/png', 'data' => $s],
            str_starts_with($s, '/9j/') => ['kind' => 'image', 'media' => 'image/jpeg', 'data' => $s],
            str_starts_with($s, 'UklGR') => ['kind' => 'image', 'media' => 'image/webp', 'data' => $s],
            str_starts_with($s, 'R0lGOD') => ['kind' => 'image', 'media' => 'image/gif', 'data' => $s],
            default => null,
        };
    }

    /** @return array{status:int, body:array} */
    public function ocr(mixed $image, mixed $type): array
    {
        if (!\is_string($image) || $image === '') {
            return ['status' => 400, 'body' => ['error' => 'Missing "image" (base64 string)']];
        }
        if (!\in_array($type, self::OCR_TYPES, true)) {
            return ['status' => 400, 'body' => ['error' => 'Invalid "type". Must be: talon, constatare, buletin, or audatex']];
        }
        if (\strlen($image) > self::MAX_IMAGE_CHARS) {
            return ['status' => 413, 'body' => ['error' => 'Image too large (max ~5MB)']];
        }
        $m = self::detectMedia($image);
        if ($m === null) {
            return ['status' => 415, 'body' => ['error' => 'Format nerecunoscut. Acceptăm: JPEG, PNG, WebP, GIF, PDF.']];
        }
        $block = $m['kind'] === 'pdf'
            ? ['type' => 'document', 'source' => ['type' => 'base64', 'mediaType' => 'application/pdf', 'data' => $m['data']]]
            : ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => $m['media'], 'data' => $m['data']]];
        $prompt = \constant(AiPrompts::class.'::'.strtoupper($type));
        $r = $this->model->extract($block, $prompt, self::schema($type), self::OCR_MAX_TOKENS);
        if (!$r['ok']) {
            return self::aiError($r['error'] ?? 'ai_error');
        }
        $fields = $r['data'];

        return ['status' => 200, 'body' => [
            'result' => json_encode($fields, \JSON_UNESCAPED_UNICODE),   // a felület ezt olvassa (JSON.parse(data.result))
            'fields' => $fields,
            'uncertain' => self::flagUncertain($fields),
            'ignored' => [],
            'needsHumanReview' => true,
            'model' => $this->model->model(),
        ]];
    }

    /** @return array{status:int, body:array} */
    public function classify(mixed $image): array
    {
        if (!\is_string($image) || $image === '') {
            return ['status' => 400, 'body' => ['error' => 'Missing image']];
        }
        $m = self::detectMedia($image);
        if ($m === null || $m['kind'] !== 'image') {
            return ['status' => 400, 'body' => ['error' => 'Format imagine nesuportat (doar jpg/png/webp/gif)']];
        }
        $block = ['type' => 'image', 'source' => ['type' => 'base64', 'mediaType' => $m['media'], 'data' => $m['data']]];
        $r = $this->model->extract($block, AiPrompts::CLASSIFY, self::classifySchema(), self::CLASSIFY_MAX_TOKENS);
        if (!$r['ok']) {
            return self::aiError($r['error'] ?? 'ai_error');
        }

        return ['status' => 200, 'body' => self::validateClassify($r['data'])];
    }

    /** Az AI-ban soha nem bízunk vakon: ismeretlen típus → altceva, a bizonyosság 0..1. */
    public static function validateClassify(array $o): array
    {
        $alias = ['talon' => 'talon_fata', 'constatare' => 'constatare_amiabila', 'foto_lateral_stg' => 'foto_stanga',
            'foto_lateral_dr' => 'foto_dreapta', 'foto_elem' => 'foto_avarii'];
        $raw = $alias[$o['type'] ?? ''] ?? ($o['type'] ?? null);
        $c = is_numeric($o['confidence'] ?? null) ? (float) $o['confidence'] : 0.0;

        return ['type' => \in_array($raw, self::CLASSIFY_TYPES, true) ? $raw : 'altceva',
            'confidence' => $c >= 0 && $c <= 1 ? $c : 0.0,
            'label' => \is_string($o['label'] ?? null) ? mb_substr($o['label'], 0, 120) : ''];
    }

    /** Minden kockázatos mező emberi megerősítést kér; az `ok` csak a formai helyesség. */
    public static function flagUncertain(array $f): array
    {
        $out = [];
        $str = static fn ($v) => \is_scalar($v) ? trim((string) $v) : '';
        if ($str($f['vin'] ?? null) !== '') {
            $out['vin'] = ['value' => $f['vin'], 'needsConfirm' => true, 'ok' => preg_match('/^[A-HJ-NPR-Z0-9]{17}$/', strtoupper($str($f['vin']))) === 1];
        }
        if ($str($f['cnp'] ?? null) !== '') {
            $out['cnp'] = ['value' => $f['cnp'], 'needsConfirm' => true, 'ok' => preg_match('/^\d{13}$/', $str($f['cnp'])) === 1];
        }
        if ($str($f['plate'] ?? null) !== '') {
            $pl = trim(str_replace('-', ' ', $str($f['plate'])));
            $out['plate'] = ['value' => $f['plate'], 'needsConfirm' => true, 'ok' => preg_match('/^[A-Z]{1,2}\s?\d{2,3}\s?[A-Z]{3}$/i', $pl) === 1];
        }
        foreach (['nrDosar', 'nr_dosar'] as $k) {
            if ($str($f[$k] ?? null) !== '') {
                $out[$k] = ['value' => $f[$k], 'needsConfirm' => true, 'ok' => mb_strlen($str($f[$k])) >= 4];
            }
        }
        foreach (['ore_tinichigerie', 'ore_vopsitorie', 'pret_ora', 'total_manopera_ron', 'total_vopsitorie_ron', 'total_piese_ron', 'total_cu_tva'] as $k) {
            if (isset($f[$k]) && is_numeric($f[$k])) {
                $v = (float) $f[$k];
                $out[$k] = ['value' => $f[$k], 'needsConfirm' => true, 'ok' => $v >= 0 && (!str_starts_with($k, 'ore_') || $v < 1000)];
            }
        }

        return $out;
    }

    // ── sémák: PONTOSAN a felület által olvasott mezők ─────────────────
    public static function schema(string $type): array
    {
        $s = ['anyOf' => [['type' => 'string'], ['type' => 'null']]];
        $n = ['anyOf' => [['type' => 'number'], ['type' => 'null']]];
        $props = match ($type) {
            // rpw-recepcio-red.html: p.plate, p.vin, p.brand, p.model, p.year, p.capacitate, p.owner
            'talon' => ['plate' => $s, 'vin' => $s, 'brand' => $s, 'model' => $s, 'year' => $s, 'capacitate' => $s, 'owner' => $s],
            // p.name, p.address, p.cnp
            'buletin' => ['name' => $s, 'address' => $s, 'cnp' => $s],
            // p.nrDosar, p.proprietar, p.asigurator, p.daune[] (index.html és a recepció is)
            'constatare' => ['nrDosar' => $s, 'proprietar' => $s, 'asigurator' => $s, 'daune' => ['type' => 'array', 'items' => [
                'type' => 'object',
                'properties' => ['element' => ['type' => 'string'],
                    'actiune' => ['anyOf' => [['type' => 'string', 'enum' => ['inlocuire', 'reparatie', 'vopsire', 'revopsire']], ['type' => 'null']]],
                    'ore' => $n],
                'required' => ['element', 'actiune', 'ore'], 'additionalProperties' => false]]],
            // rpw-evaluare-red.html: p.nr_dosar, p.ore_tinichigerie, … p.total_cu_tva
            'audatex' => ['nr_dosar' => $s, 'ore_tinichigerie' => $n, 'ore_vopsitorie' => $n, 'pret_ora' => $n,
                'total_manopera_ron' => $n, 'total_vopsitorie_ron' => $n, 'total_piese_ron' => $n, 'total_cu_tva' => $n],
        };

        return ['type' => 'object', 'properties' => $props, 'required' => array_keys($props), 'additionalProperties' => false];
    }

    public static function classifySchema(): array
    {
        return ['type' => 'object', 'properties' => [
            'type' => ['type' => 'string', 'enum' => self::CLASSIFY_TYPES],
            'confidence' => ['type' => 'number'],
            'label' => ['type' => 'string'],
        ], 'required' => ['type', 'confidence', 'label'], 'additionalProperties' => false];
    }

    private static function aiError(string $code): array
    {
        return match ($code) {
            'not_configured' => ['status' => 503, 'body' => ['error' => 'Funcția AI nu este configurată pe server.', 'code' => $code]],
            'ai_busy' => ['status' => 429, 'body' => ['error' => 'Prea multe cereri, reîncearcă.', 'code' => $code]],
            'ai_invalid_json', 'ai_truncated', 'ai_empty' => ['status' => 502, 'body' => ['error' => 'Răspuns AI invalid. Încearcă din nou sau introdu manual.', 'code' => $code]],
            'ai_refused' => ['status' => 422, 'body' => ['error' => 'Documentul nu a putut fi procesat. Introdu datele manual.', 'code' => $code]],
            default => ['status' => 502, 'body' => ['error' => 'AI indisponibil', 'code' => $code]],
        };
    }
}
