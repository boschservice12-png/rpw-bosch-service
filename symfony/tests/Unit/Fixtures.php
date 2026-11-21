<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Domain\Auth\Actor;

/** Teszt-munkák és -emberek: egy-egy fázis feltételeinek teljesítésére. */
final class Fixtures
{
    public static function actor(array $caps = ['work'], string $name = 'Kovács Péter'): Actor
    {
        return new Actor('e1', $name, 's1', null, array_fill_keys($caps, true));
    }

    public static function admin(): Actor
    {
        return self::actor(['open', 'reception', 'work', 'close', 'override', 'delete', 'team'], 'Ferenc Admin');
    }

    public static function photo(): array
    {
        return ['url' => 'https://x/p.jpg'];
    }

    /** Saját zsebes munka, amelynek 1. fázisa lezárható. */
    public static function receptionReady(string $damageType = 'auto'): array
    {
        $ov = [];
        foreach (['front', 'back', 'left', 'right', 'serieCaros', 'km'] as $p) {
            $ov['ov_'.$p] = true;
        }

        return [
            'damageType' => $damageType,
            'photoKeys' => $ov + ['talon' => true],
            'elements' => ['bara_fata' => ['status' => 'damaged', 'photo' => 'https://x/e.jpg'], 'capota' => ['status' => 'ok']],
        ];
    }

    public static function evalReady(array $job): array
    {
        $job['evalData'] = ['status' => 'accepted', 'comanda' => [['op' => 'Înlocuire bară', 'hours' => 2]]];
        $job['termenPredare'] = '2026-12-01';

        return $job;
    }

    public static function row(): array
    {
        return ['name' => 'Bară față', 'op' => 'reparatie', 'hours' => 3, 'completed' => true, 'completedBy' => 'Szabó István'];
    }

    public static function closingReady(array $job): array
    {
        $job['closing'] = ['factura' => 'F-123', 'devizRef' => 'D-55', 'devizNotRequired' => true, 'vehicleOperational' => true,
            'finalControlConfirmed' => true, 'documentsDeliveredToOffice' => true, 'handoverBy' => 'Ana Pop'];
        $job['closingPhotos'] = array_fill(0, 5, self::photo());

        return $job;
    }
}
