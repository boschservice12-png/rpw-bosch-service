<?php

declare(strict_types=1);

namespace App\Domain\Workflow;

/** A 7 fázis és a fázisállapotok — a rendszer gerince. */
final class Phase
{
    public const RECEPTIE = 1;
    public const EVALUARE = 2;
    public const RECONSTATARE = 3;
    public const TINICHIGERIE = 4;
    public const VOPSITORIE = 5;
    public const CONTROL = 6;
    public const INCHIDERE = 7;

    public const ALL = [1, 2, 3, 4, 5, 6, 7];

    public const PENDING = 'pending';
    public const ACTIVE = 'active';
    public const BLOCKED = 'blocked';
    public const WAITING = 'waiting';
    public const REWORK = 'rework';
    public const DONE = 'done';
    public const SKIPPED = 'skipped';

    public const STATES = [self::PENDING, self::ACTIVE, self::BLOCKED, self::WAITING, self::REWORK, self::DONE, self::SKIPPED];

    /** Lezártnak számító állapotok (a következő fázis indulhat). */
    public const CLOSED_STATES = [self::DONE, self::SKIPPED];

    public const META = [
        1 => ['key' => 'recepcio', 'ro' => 'Recepție', 'hu' => 'Recepció', 'en' => 'Reception'],
        2 => ['key' => 'evaluare', 'ro' => 'Evaluare', 'hu' => 'Felmérés', 'en' => 'Assessment'],
        3 => ['key' => 'reconstatare', 'ro' => 'Reconstatare', 'hu' => 'Újrafelmérés', 'en' => 'Re-assessment'],
        4 => ['key' => 'tinichigerie', 'ro' => 'Tinichigerie', 'hu' => 'Lakatos', 'en' => 'Bodywork'],
        5 => ['key' => 'vopsitorie', 'ro' => 'Vopsitorie', 'hu' => 'Fényezés', 'en' => 'Paint'],
        6 => ['key' => 'control', 'ro' => 'Control', 'hu' => 'Kontroll', 'en' => 'Final check'],
        7 => ['key' => 'inchidere', 'ro' => 'Închidere', 'hu' => 'Lezárás', 'en' => 'Closing'],
    ];

    public static function isValid(mixed $phase): bool
    {
        return \is_int($phase) && $phase >= 1 && $phase <= 7;
    }

    public static function name(int $phase, string $lang = 'ro'): string
    {
        return self::META[$phase][$lang] ?? self::META[$phase]['ro'] ?? (string) $phase;
    }
}
