<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Domain\Workflow\PhaseRules;
use App\Domain\Workflow\TransitionDenied;
use App\Domain\Workflow\TransitionEngine;
use PHPUnit\Framework\TestCase;

final class TransitionEngineTest extends TestCase
{
    private TransitionEngine $e;
    private \DateTimeImmutable $now;

    protected function setUp(): void
    {
        $this->e = new TransitionEngine();
        $this->now = new \DateTimeImmutable('2026-11-20T10:00:00+00:00');
    }

    private function denied(callable $fn): string
    {
        try {
            $fn();
        } catch (TransitionDenied $d) {
            return $d->errorCode;
        }
        self::fail('nem utasította el');
    }

    public function testFullAutoLifecycleSkipsPhase3AndClosesJob(): void
    {
        $w = Fixtures::actor(['work', 'close']);
        $j = Fixtures::receptionReady();
        $j = $this->e->apply($j, 1, 'complete', $w, $this->now);
        self::assertSame(2, $j['phase']);
        $j = $this->e->apply(Fixtures::evalReady($j), 2, 'complete', $w, $this->now);
        self::assertSame('skipped', $j['phases']['3']['status']);
        self::assertSame(4, $j['phase'], 'saját zsebes munkán a 3. után a 4. indul');
        $j['bodyRows'] = [Fixtures::row()];
        $j = $this->e->apply($j, 4, 'complete', $w, $this->now);
        $j['paintRows'] = [Fixtures::row()];
        $j = $this->e->apply($j, 5, 'complete', $w, $this->now);
        $j['control'] = ['allDone' => true, 'lastResult' => 'ok'];
        $j = $this->e->apply($j, 6, 'complete', $w, $this->now);
        $j = $this->e->apply(Fixtures::closingReady($j), 7, 'complete', $w, $this->now);
        self::assertTrue($j['inchis']);
        self::assertSame('Kovács Péter', $j['phases']['7']['completedBy']);
        self::assertCount(6, $j['workflowHistory']);
        self::assertSame('job_closed', $this->denied(fn () => $this->e->apply($j, 7, 'start', $w, $this->now)));
    }

    public function testRequirementsBlockCompletion(): void
    {
        try {
            $this->e->apply([], 1, 'complete', Fixtures::actor(), $this->now);
            self::fail();
        } catch (TransitionDenied $d) {
            self::assertSame('requirements_missing', $d->errorCode);
            self::assertContains('wf_talon_missing', $d->details['missing']);
        }
    }

    public function testNoSkippingAheadWithoutOverride(): void
    {
        $j = ['bodyRows' => [Fixtures::row()]];
        self::assertSame('prev_not_closed', $this->denied(fn () => $this->e->apply($j, 4, 'complete', Fixtures::actor(), $this->now)));
    }

    public function testPermissions(): void
    {
        $ro = Fixtures::actor([]);
        self::assertSame('not_allowed', $this->denied(fn () => $this->e->apply(Fixtures::receptionReady(), 1, 'complete', $ro, $this->now)));
        // a 7. fázis lezárásához `close` kell, a `work` nem elég
        $j = Fixtures::closingReady(['phases' => array_fill_keys(['1', '2', '3', '4', '5', '6'], ['status' => 'done'])]);
        self::assertSame('not_allowed', $this->denied(fn () => $this->e->apply($j, 7, 'complete', Fixtures::actor(['work']), $this->now)));
        self::assertSame('not_allowed', $this->denied(fn () => $this->e->apply($j, 2, 'reopen', Fixtures::actor(['work']), $this->now, ['reason' => 'hibás deviz'])));
    }

    public function testJustifiedSkipNeedsNoOverrideButUnjustifiedDoes(): void
    {
        $j = ['phases' => array_fill_keys(['1', '2', '3'], ['status' => 'done']) + ['4' => ['status' => 'active']]];
        $j = $this->e->apply($j, 4, 'skip', Fixtures::actor(), $this->now);
        self::assertSame('skipped', $j['phases']['4']['status']);
        self::assertSame('no_bodywork', $j['phases']['4']['skippedReason']);
        self::assertSame(5, $j['phase']);
        $j['paintRows'] = [Fixtures::row()];
        self::assertSame('skip_not_justified', $this->denied(fn () => $this->e->apply($j, 5, 'skip', Fixtures::actor(), $this->now)));
        self::assertSame('reason_required', $this->denied(fn () => $this->e->apply($j, 5, 'skip', Fixtures::admin(), $this->now, ['reason' => 'ok'])));
    }

    public function testReworkCycleResetsControl(): void
    {
        $w = Fixtures::actor(['work']);
        $j = ['phases' => array_fill_keys(['1', '2', '3', '4', '5'], ['status' => 'done']) + ['6' => ['status' => 'active']],
            'control' => ['allDone' => true, 'lastResult' => 'nok']];
        self::assertSame('rework_invalid', $this->denied(fn () => $this->e->apply($j, 6, 'rework_open', $w, $this->now, ['category' => 'vopsitorie', 'description' => 'rövid'])));
        $j = $this->e->apply($j, 6, 'rework_open', $w, $this->now, ['category' => 'vopsitorie', 'description' => 'Diferență de nuanță pe aripă', 'assigned_to' => 'Nagy Béla']);
        self::assertSame('rework', $j['phases']['5']['status']);
        self::assertSame('blocked', $j['phases']['6']['status']);
        self::assertSame('open_rework', $this->denied(fn () => $this->e->apply($j, 6, 'complete', $w, $this->now)));
        $id = $j['rework'][0]['id'];
        self::assertSame('rework_invalid', $this->denied(fn () => $this->e->apply($j, 6, 'rework_close', $w, $this->now, ['rework_id' => $id, 'resolved_by' => 'test', 'note' => 'gata'])));
        $j = $this->e->apply($j, 6, 'rework_close', $w, $this->now, ['rework_id' => $id, 'resolved_by' => 'Nagy Béla', 'note' => 'Refăcut']);
        self::assertSame('done', $j['phases']['5']['status']);
        self::assertSame('active', $j['phases']['6']['status']);
        self::assertFalse($j['control']['allDone'], 'új kontrollkör: a korábbi megfelelt jelölés nem öröklődik');
        self::assertCount(1, $j['control']['history']);
        self::assertSame('rework_not_found', $this->denied(fn () => $this->e->apply($j, 6, 'rework_close', $w, $this->now, ['rework_id' => $id, 'note' => 'x'])));
    }

    /** 2026-11-23: rpw-control-red.html can send category "other" — its target phase is chosen on the page (4 or 5). */
    public function testReworkCategoryOtherUsesRequestedWorkshopPhase(): void
    {
        $w = Fixtures::actor(['work']);
        $j = ['phases' => array_fill_keys(['1', '2', '3', '4', '5'], ['status' => 'done']) + ['6' => ['status' => 'active']]];
        $base = ['category' => 'other', 'description' => 'Zgârietură pe ușa din spate', 'assigned_to' => 'Nagy Béla'];
        $four = $this->e->apply($j, 6, 'rework_open', $w, $this->now, $base + ['target_phase' => 4]);
        self::assertSame(4, $four['rework'][0]['sourcePhase']);
        self::assertSame('rework', $four['phases']['4']['status']);
        $five = $this->e->apply($j, 6, 'rework_open', $w, $this->now, $base + ['target_phase' => '5']);
        self::assertSame(5, $five['rework'][0]['sourcePhase'], 'a string célfázis is elfogadott (a compat híd stringet ad)');
        foreach ([null, 0, 3, 6, 7, 'x'] as $bad) {
            $e = null;
            try {
                $this->e->apply($j, 6, 'rework_open', $w, $this->now, $base + ['target_phase' => $bad]);
            } catch (TransitionDenied $d) {
                $e = $d;
            }
            self::assertNotNull($e, 'célfázis: '.var_export($bad, true));
            self::assertSame(['wf_rw_target'], $e->details['missing'], 'csak műhelyfázis (4/5) lehet: '.var_export($bad, true));
        }
    }

    public function testReopenNeedsOverrideAndReasonAndUnclosesJob(): void
    {
        $j = ['inchis' => true, 'phases' => array_fill_keys(['1', '2', '3', '4', '5', '6', '7'], ['status' => 'done'])];
        self::assertSame('reason_required', $this->denied(fn () => $this->e->apply($j, 7, 'reopen', Fixtures::admin(), $this->now)));
        $j = $this->e->apply($j, 7, 'reopen', Fixtures::admin(), $this->now, ['reason' => 'Factură greșită']);
        self::assertFalse($j['inchis']);
        self::assertSame('active', $j['phases']['7']['status']);
    }

    public function testOverrideGrantOpensPhaseWithoutFakingCompletion(): void
    {
        $j = $this->e->apply([], 4, 'override', Fixtures::admin(), $this->now, ['reason' => 'Clientul a aprobat telefonic']);
        self::assertSame('active', $j['phases']['4']['status']);
        self::assertSame('active', $j['phases']['1']['status'], 'az előző fázis NEM lesz hamisan kész');
        self::assertTrue(PhaseRules::canEnter($j, 4)['allowed']);
        self::assertSame('override_invalid', $this->denied(fn () => $this->e->apply([], 4, 'override', Fixtures::admin(), $this->now, ['reason' => 'rövid'])));
    }

    public function testOverrideRightAloneDoesNotSkipOrderOrRework(): void
    {
        $admin = Fixtures::admin();
        $j = ['phases' => array_fill_keys(['1', '2', '3', '4'], ['status' => 'done']) + ['5' => ['status' => 'active']],
            'control' => ['allDone' => true, 'lastResult' => 'ok']];
        self::assertSame('prev_not_closed', $this->denied(fn () => $this->e->apply($j, 6, 'complete', $admin, $this->now)),
            'a vezető sem zárhatja le a kontrollt, amíg a fényezés nyitott — csak kifejezett override-dal');
        $g = $this->e->apply($j, 6, 'override', $admin, $this->now, ['reason' => 'Vopsitoria externă, confirmată telefonic']);
        $g = $this->e->apply($g, 6, 'complete', $admin, $this->now);
        self::assertSame('done', $g['phases']['6']['status'], 'a dokumentált grant után igen');
        $r = $j;
        $r['rework'] = [['id' => 'rw1', 'status' => 'open', 'sourcePhase' => 5]];
        self::assertSame('open_rework', $this->denied(fn () => $this->e->apply($r, 5, 'complete', $admin, $this->now)));
    }

    public function testOverriddenRequirementsAreRecorded(): void
    {
        $j = Fixtures::closingReady(['phases' => array_fill_keys(['1', '2', '3', '4', '5', '6'], ['status' => 'done'])]);
        $j['closingPhotos'] = [];
        $j = $this->e->apply($j, 7, 'complete', Fixtures::admin(), $this->now);
        self::assertSame(['wf_photos_not_five'], $j['phases']['7']['overriddenRequirements']);
        self::assertStringContainsString('wf_photos_not_five', end($j['workflowHistory'])['reason']);
    }

    public function testInvalidInput(): void
    {
        self::assertSame('bad_phase', $this->denied(fn () => $this->e->apply([], 8, 'start', Fixtures::admin(), $this->now)));
        self::assertSame('bad_action', $this->denied(fn () => $this->e->apply([], 1, 'hack', Fixtures::admin(), $this->now)));
    }
}
