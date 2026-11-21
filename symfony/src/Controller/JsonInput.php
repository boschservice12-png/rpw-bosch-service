<?php

declare(strict_types=1);

namespace App\Controller;

use App\Application\ApiError;
use Symfony\Component\HttpFoundation\Request;

/** Szigorú JSON-bemenet: rossz JSON → bad_request, nem 500. */
final class JsonInput
{
    public const MAX_BYTES = 2_000_000;

    public static function body(Request $r): array
    {
        $raw = $r->getContent();
        if (\strlen($raw) > self::MAX_BYTES) {
            throw new ApiError('bad_request', ['detail' => 'payload too large'], 413);
        }
        if ($raw === '') {
            return [];
        }
        try {
            $d = \App\Infrastructure\Json::decode($raw, 64);
            if ($d instanceof \stdClass) {
                $d = [];
            }
        } catch (\JsonException) {
            throw new ApiError('bad_request', ['detail' => 'invalid json']);
        }
        if (!\is_array($d)) {
            throw new ApiError('bad_request', ['detail' => 'object expected']);
        }

        return $d;
    }

    public static function int(array $b, string $k): ?int
    {
        $v = $b[$k] ?? null;
        if ($v === null) {
            return null;
        }
        if (\is_int($v) || (\is_string($v) && ctype_digit($v))) {
            return (int) $v;
        }
        throw new ApiError('bad_request', ['detail' => $k]);
    }

    public static function str(array $b, string $k): ?string
    {
        $v = $b[$k] ?? null;
        if ($v === null) {
            return null;
        }
        if (!\is_string($v) && !\is_int($v)) {
            throw new ApiError('bad_request', ['detail' => $k]);
        }

        return (string) $v;
    }
}
