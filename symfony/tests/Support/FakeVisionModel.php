<?php

declare(strict_types=1);

namespace App\Tests\Support;

use App\Infrastructure\Ai\VisionModel;

/** Valódi API-hívás nélküli AI: a séma szerinti mintaválaszt adja, és rögzíti a hívást. */
final class FakeVisionModel implements VisionModel
{
    public static array $calls = [];
    public static ?array $next = null;

    public function extract(array $media, string $prompt, array $schema, int $maxTokens): array
    {
        self::$calls[] = ['media' => $media, 'prompt' => $prompt, 'schema' => $schema, 'maxTokens' => $maxTokens];
        if (self::$next !== null) {
            $r = self::$next;
            self::$next = null;

            return $r;
        }
        $out = [];
        foreach ($schema['properties'] as $k => $p) {
            $out[$k] = match (true) {
                ($p['type'] ?? null) === 'array' => [['element' => 'bara fata', 'actiune' => 'reparatie', 'ore' => 1.5]],
                isset($p['enum']) => $p['enum'][0],
                ($p['type'] ?? null) === 'number' => 0.9,
                isset($p['anyOf']) && $p['anyOf'][0]['type'] === 'number' => 4.5,
                default => match ($k) { 'vin' => 'WVWZZZ1KZAW000001', 'plate' => 'MS 50 BSS', default => 'x-'.$k },
            };
        }

        return ['ok' => true, 'data' => $out];
    }

    public function model(): string
    {
        return 'fake';
    }
}
