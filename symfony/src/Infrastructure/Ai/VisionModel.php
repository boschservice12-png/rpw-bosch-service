<?php

declare(strict_types=1);

namespace App\Infrastructure\Ai;

/** Kép/PDF → szigorú JSON. Interfész, hogy a tesztek valódi API-hívás nélkül fussanak. */
interface VisionModel
{
    /**
     * @param array $media  egy Messages API tartalomblokk (image vagy document)
     * @param array $schema JSON-séma (structured outputs) — a válasz garantáltan ennek felel meg
     *
     * @return array{ok:bool, data?:array, error?:string}
     */
    public function extract(array $media, string $prompt, array $schema, int $maxTokens): array;

    public function model(): string;
}
