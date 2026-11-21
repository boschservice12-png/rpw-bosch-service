<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Domain\Auth\PinPolicy;
use App\Domain\Metrics\WorkCalendar;
use App\Domain\Metrics\WorkMetrics;
use App\Domain\Patch\PatchGuard;
use PHPUnit\Framework\TestCase;

final class PatchGuardAndPolicyTest extends TestCase
{
    public function testProtectedFieldsAreFoundRecursively(): void
    {
        self::assertSame(['phases.7.status'], PatchGuard::protectedHits(['phases' => ['7' => ['status' => 'done']]]));
        self::assertSame(['inchis'], PatchGuard::protectedHits(['client' => 'x', 'inchis' => true]));
        self::assertSame(['closing.status'], PatchGuard::protectedHits(['closing' => ['status' => 'done', 'factura' => 'F1']]));
        self::assertSame(['rework'], PatchGuard::protectedHits(['rework' => []]));
        self::assertSame([], PatchGuard::protectedHits(['closing' => ['factura' => 'F1'], 'client' => 'x']));
    }

    public function testFieldPermissions(): void
    {
        $rec = Fixtures::actor(['reception']);
        self::assertTrue(PatchGuard::permission(['client' => 'x', 'plate' => 'B1'], $rec)['ok']);
        $r = PatchGuard::permission(['client' => 'x', 'closing' => ['factura' => 'F']], $rec);
        self::assertFalse($r['ok']);
        self::assertSame('close', $r['need']);
        self::assertSame(['closing.factura'], $r['fields']);
        self::assertSame('work', PatchGuard::capabilityFor('ismeretlenMezo'), 'ismeretlen mezőt nem írhat bárki');
    }

    public function testDeepMerge(): void
    {
        $m = PatchGuard::deepMerge(['a' => ['b' => 1, 'c' => 2], 'l' => [1, 2]], ['a' => ['c' => 3], 'l' => [9]]);
        self::assertSame(['a' => ['b' => 1, 'c' => 3], 'l' => [9]], $m);
    }

    public function testPinPolicy(): void
    {
        foreach (['1234', '9876', '0000', '1985', '12a4', '12'] as $weak) {
            self::assertNotNull(PinPolicy::validate($weak), $weak);
        }
        self::assertNull(PinPolicy::validate('4826'));
        self::assertNull(PinPolicy::validate('739215'));
    }

    public function testWorkCalendarSkipsWeekends(): void
    {
        self::assertSame(5, WorkCalendar::workdaysBetween('2026-11-16', '2026-11-22'));   // H–V
        self::assertSame('2026-11-24', WorkCalendar::workdaysAfter('2026-11-19', 3));      // CS + 3 mn = K
        self::assertSame('2026-11-18', WorkCalendar::addWorkdays('2026-11-16', 3));
    }

    public function testGapIsNullWithoutDeviz(): void
    {
        $j = ['phases' => ['4' => ['status' => 'active', 'started' => '2026-11-16T08:00:00Z']]];
        $m = WorkMetrics::compute($j, new \DateTimeImmutable('2026-11-20'));
        self::assertNull($m['gap']);
        self::assertSame('fara_deviz', $m['state']);
        $j['deviz'] = ['oreTinichigerie' => 6, 'oreVopsitorie' => '2'];
        $m = WorkMetrics::compute($j, new \DateTimeImmutable('2026-11-20'));
        self::assertSame(2, $m['expected']);
        self::assertSame(3, $m['gap']);
        self::assertTrue($m['needsReason']);
    }

    public function testInsurerDeadlines(): void
    {
        $d = WorkMetrics::insurerDeadlines(['dosarPredat' => '2026-11-19'], new \DateTimeImmutable('2026-11-25'));
        self::assertSame('2026-11-24', $d['constatare']);
        self::assertTrue($d['constatareOverdue']);
        self::assertSame('2026-12-19', $d['oferta']);
        self::assertFalse($d['ofertaOverdue']);
    }
}
