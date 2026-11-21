<?php

declare(strict_types=1);

namespace App\Domain\Auth;

/**
 * PIN-SZABÁLY (007_pin_lockout_admin.sql rpw__pin_weak + lockout).
 * Gyenge: nem csak számjegy · 4-nél rövidebb · csupa azonos számjegy ·
 * szigorúan növekvő/csökkenő futam · négyjegyű évszám (1900–2099).
 */
final class PinPolicy
{
    public const MIN_LENGTH = 4;
    public const MAX_ATTEMPTS = 10;
    public const LOCK_MINUTES = 15;
    public const SESSION_HOURS = 12;

    /** @return ?string hibakód, vagy null ha a PIN elfogadható */
    public static function validate(string $pin): ?string
    {
        $s = trim($pin);
        if (preg_match('/^\d+$/', $s) !== 1) {
            return 'weak_pin';
        }
        if (\strlen($s) < self::MIN_LENGTH) {
            return 'pin_too_short';
        }

        return self::isWeak($s) ? 'weak_pin' : null;
    }

    public static function isWeak(string $pin): bool
    {
        $s = trim($pin);
        if (preg_match('/^\d+$/', $s) !== 1 || \strlen($s) < self::MIN_LENGTH) {
            return true;
        }
        if (str_repeat($s[0], \strlen($s)) === $s) {
            return true;
        }
        $asc = $desc = true;
        for ($i = 1, $n = \strlen($s); $i < $n; ++$i) {
            $d = (int) $s[$i];
            $p = (int) $s[$i - 1];
            $asc = $asc && $d === $p + 1;
            $desc = $desc && $d === $p - 1;
        }
        if ($asc || $desc) {
            return true;
        }

        return \strlen($s) === 4 && (int) $s >= 1900 && (int) $s <= 2099;
    }
}
