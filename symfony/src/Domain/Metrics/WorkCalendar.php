<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

/** Munkanap-naptár: hétfő–péntek (szombaton nincs munka). */
final class WorkCalendar
{
    public static function dateOnly(mixed $v): ?string
    {
        if (!\is_string($v) || preg_match('/^(\d{4}-\d{2}-\d{2})/', $v, $m) !== 1) {
            return null;
        }

        return $m[1];
    }

    /** Munkanapok száma a kezdőnapot is beleszámítva. */
    public static function workdaysBetween(?string $from, ?string $to): ?int
    {
        $a = self::dateOnly($from);
        $b = self::dateOnly($to);
        if ($a === null || $b === null) {
            return null;
        }
        $d = new \DateTimeImmutable($a);
        $e = new \DateTimeImmutable($b);
        if ($e < $d) {
            return 0;
        }
        $n = 0;
        while ($d <= $e) {
            if ((int) $d->format('N') <= 5) {
                ++$n;
            }
            $d = $d->modify('+1 day');
        }

        return $n;
    }

    /** n munkanap a kezdőnapot is beleértve (n=1 → maga a kezdőnap). */
    public static function addWorkdays(?string $from, int $n): ?string
    {
        $a = self::dateOnly($from);
        if ($a === null) {
            return null;
        }
        $d = new \DateTimeImmutable($a);
        $left = max(0, $n - 1);
        while ($left > 0) {
            $d = $d->modify('+1 day');
            if ((int) $d->format('N') <= 5) {
                --$left;
            }
        }

        return $d->format('Y-m-d');
    }

    /** n munkanappal a kezdőnap UTÁN (a biztosítói constatare-határidőhöz). */
    public static function workdaysAfter(?string $from, int $n): ?string
    {
        $a = self::dateOnly($from);
        if ($a === null) {
            return null;
        }
        $d = new \DateTimeImmutable($a);
        while ($n > 0) {
            $d = $d->modify('+1 day');
            if ((int) $d->format('N') <= 5) {
                --$n;
            }
        }

        return $d->format('Y-m-d');
    }
}
