<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

use App\Domain\Job\JobData as D;
use App\Domain\Workflow\Phase;
use App\Domain\Workflow\PhaseRules;

/**
 * MUNKAIDŐ-MÉRÉS ÉS BIZTOSÍTÓI HATÁRIDŐK.
 *
 *   T0 = a Tinichigerie (4.) fázis indulása, T1 = a Control (6.) lezárása
 *   várható nap = ceil((lakatos óra + fényezés óra) / 4), min. 1
 *   GAP = tényleges − várható. Deviz nélkül nincs ítélet: a gap null.
 *
 * A GAP nem vád, hanem kérdés — hat okkal (GAP_REASONS) naplózzuk.
 */
final class WorkMetrics
{
    public const H_PER_DAY = 4;
    public const GAP_REASONS = ['piese', 'asigurator', 'capacitate', 'vreme', 'garantie', 'fara_motiv'];
    public const CONSTATARE_WORKDAYS = 3;
    public const OFERTA_DAYS = 30;

    public static function devizHours(array $job): ?float
    {
        $sum = 0.0;
        $ok = false;
        foreach (['oreTinichigerie', 'oreVopsitorie'] as $k) {
            $v = D::get($job, ['deviz', $k]);
            if ($v !== null && !\is_array($v) && is_numeric(trim((string) $v))) {
                $sum += (float) $v;
                $ok = true;
            }
        }

        return $ok ? round($sum, 1) : null;
    }

    public static function expectedDays(?float $hours): ?int
    {
        return $hours === null ? null : max(1, (int) ceil($hours / self::H_PER_DAY));
    }

    public static function compute(array $job, \DateTimeImmutable $today): array
    {
        $job = PhaseRules::normalize($job);
        $t0 = WorkCalendar::dateOnly($job['phases'][(string) Phase::TINICHIGERIE]['started'] ?? null);
        $end = $job['phases'][(string) Phase::CONTROL];
        $t1 = ($end['status'] ?? null) === Phase::DONE ? WorkCalendar::dateOnly($end['finished'] ?? null) : null;
        $elapsed = $t0 !== null ? WorkCalendar::workdaysBetween($t0, $t1 ?? $today->format('Y-m-d')) : null;
        $hours = self::devizHours($job);
        $exp = self::expectedDays($hours);
        $gap = ($elapsed !== null && $exp !== null) ? $elapsed - $exp : null;

        return [
            't0' => $t0, 't1' => $t1, 'running' => $t0 !== null && $t1 === null, 'started' => $t0 !== null,
            'elapsed' => $elapsed, 'hours' => $hours, 'expected' => $exp,
            'deadline' => ($t0 !== null && $exp !== null) ? WorkCalendar::addWorkdays($t0, $exp) : null,
            'gap' => $gap, 'over' => $gap !== null && $gap > 0,
            'needsReason' => $gap !== null && $gap > 0 && D::arr($job['gapLog'] ?? []) === [],
            'reason' => $job['gapReason'] ?? null,
            'state' => $t0 === null ? 'neinceput' : ($exp === null ? 'fara_deviz' : ($gap > 0 ? 'depasit' : ($t1 ? 'gata' : 'in_grafic'))),
        ];
    }

    /**
     * Biztosítói határidők az átadástól (dosarPredat):
     * constatare 3 munkanap, ofertă 30 naptári nap. A 10 napos fizetési
     * határidőt szándékosan NEM számoljuk — az ajánlat elfogadásától fut.
     */
    public static function insurerDeadlines(array $job, \DateTimeImmutable $today): ?array
    {
        $from = WorkCalendar::dateOnly($job['dosarPredat'] ?? null);
        if ($from === null) {
            return null;
        }
        $constatare = WorkCalendar::workdaysAfter($from, self::CONSTATARE_WORKDAYS);
        $oferta = (new \DateTimeImmutable($from))->modify('+'.self::OFERTA_DAYS.' days')->format('Y-m-d');
        $t = $today->format('Y-m-d');

        return [
            'predat' => $from,
            'constatare' => $constatare, 'constatareOverdue' => $t > $constatare,
            'oferta' => $oferta, 'ofertaOverdue' => $t > $oferta,
        ];
    }

    /** GAP-ok rögzítése: NEM felülír, naplóz — egy munkán több ok is lehet. */
    public static function withGapReason(array $job, string $reason, string $note, \DateTimeImmutable $now): array
    {
        if (!\in_array($reason, self::GAP_REASONS, true)) {
            throw new \InvalidArgumentException('unknown_reason');
        }
        $m = self::compute($job, $now);
        $job['gapLog'] = D::arr($job['gapLog'] ?? []);
        $job['gapLog'][] = ['reason' => $reason, 'note' => $note, 'gap' => $m['gap'], 'at' => $now->format(\DATE_ATOM), 'phase' => $job['phase'] ?? null];
        $job['gapReason'] = $reason;

        return $job;
    }
}
