<?php

declare(strict_types=1);

namespace App\Infrastructure;

/**
 * JSON-dekódolás, amely MEGŐRZI AZ ÜRES OBJEKTUMOT.
 *
 * A PHP `json_decode($s, true)` a `{}`-t és a `[]`-t egyaránt üres tömbbé
 * alakítja; visszakódoláskor mindkettőből `[]` lesz. A felület viszont
 * `elements: {}` objektumba ír kulcsokat — ha `[]`-t kap vissza, a
 * JavaScript-tömb nevesített kulcsai mentéskor ELVESZNEK (csendes adatvesztés).
 *
 * Itt a nem üres objektum asszociatív tömb lesz (a domain így dolgozik vele),
 * az ÜRES objektum pedig `\stdClass` marad, és `{}`-ként kódolódik vissza.
 */
final class Json
{
    public static function decode(string $json, int $depth = 512): mixed
    {
        return self::convert(json_decode($json, false, $depth, \JSON_THROW_ON_ERROR));
    }

    private static function convert(mixed $v): mixed
    {
        if ($v instanceof \stdClass) {
            $a = get_object_vars($v);
            if ($a === []) {
                return new \stdClass();
            }
            foreach ($a as $k => $x) {
                $a[$k] = self::convert($x);
            }

            return $a;
        }
        if (\is_array($v)) {
            return array_map([self::class, 'convert'], $v);
        }

        return $v;
    }
}
