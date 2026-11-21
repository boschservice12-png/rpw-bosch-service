<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Domain\Workflow\DaunaDocs;
use App\Domain\Workflow\PhaseRules;
use PHPUnit\Framework\TestCase;

final class PhaseRulesTest extends TestCase
{
    public function testNormalizeIsIdempotentAndPhaseNeverZero(): void
    {
        $j = PhaseRules::normalize(['phase' => 0]);
        self::assertSame(1, $j['phase']);
        self::assertSame($j, PhaseRules::normalize($j));
        self::assertCount(7, $j['phases']);
    }

    public function testAutoJobSkipsReconstatare(): void
    {
        $j = PhaseRules::normalize(['damageType' => 'auto']);
        self::assertSame('skipped', $j['phases']['3']['status']);
        self::assertSame([], PhaseRules::missing($j, 3));
    }

    public function testEmptyJobPhase1ListsAllMissing(): void
    {
        $m = PhaseRules::missing([], 1);
        foreach (['wf_worktype_missing', 'wf_talon_missing', 'wf_overview_missing', 'wf_elements_incomplete', 'wf_damage_report_missing'] as $c) {
            self::assertContains($c, $m);
        }
    }

    public function testReceptionReadyPasses(): void
    {
        self::assertSame([], PhaseRules::missing(Fixtures::receptionReady(), 1));
    }

    public function testDamagedElementNeedsProofPhoto(): void
    {
        $j = Fixtures::receptionReady();
        $j['elements']['bara_fata']['photo'] = null;
        self::assertContains('wf_proof_photo_missing', PhaseRules::missing($j, 1));
    }

    public function testInsuranceClaimNumberOnlyWhenFileAlreadyOpen(): void
    {
        $j = Fixtures::receptionReady('asig');
        $j['docs'] = [['type' => 'constatare']];
        $j['dosarStatus'] = 'deschid';     // MI nyitjuk → a kárszám még nem létezik
        self::assertNotContains('wf_nrdosar_missing', PhaseRules::missing($j, 1));
        $j['dosarStatus'] = 'deschis';     // már nyitva → kötelező
        self::assertContains('wf_nrdosar_missing', PhaseRules::missing($j, 1));
        $j['nrDosar'] = 'GRP-2026-1';
        self::assertSame([], PhaseRules::missing($j, 1));
    }

    public function testOverviewPhotosBridgeFromDosarActe(): void
    {
        $j = Fixtures::receptionReady();
        $j['photoKeys'] = ['talon' => true];
        $j['dosarActe'] = [];
        foreach (['foto_fata', 'foto_spate', 'foto_stanga', 'foto_dreapta', 'foto_serie_caroserie', 'foto_km'] as $s) {
            $j['dosarActe'][$s] = [['path' => 'x/'.$s.'.jpg']];
        }
        self::assertNotContains('wf_overview_missing', PhaseRules::missing($j, 1));
    }

    public function testDoarDosarUsesDocumentChecklistOnly(): void
    {
        $j = ['flux' => 'doar_dosar'];
        self::assertSame(['wf_acte_incomplete'], PhaseRules::missing($j, 1));
        foreach (DaunaDocs::GROUPS as $g) {
            if (!empty($g['optional'])) {
                continue;
            }
            foreach ($g['items'] as $it) {
                $j['dosarActe'][$it['key']] = [['url' => 'u']];
            }
        }
        self::assertSame([], DaunaDocs::missing($j));
        self::assertSame([], PhaseRules::missing($j, 1));
    }

    public function testEvaluationMustBeAcceptedWithHoursAndDeadline(): void
    {
        $j = ['evalData' => ['status' => 'sent', 'comanda' => [['op' => 'x', 'hours' => 0]]]];
        $m = PhaseRules::missing($j, 2);
        self::assertContains('wf_missing_hours', $m);
        self::assertContains('wf_missing_termen', $m);
        self::assertContains('wf_eval_not_final', $m);
        self::assertSame([], PhaseRules::missing(Fixtures::evalReady([]), 2));
    }

    public function testReconstatareRejectionNeedsNoteAndDate(): void
    {
        self::assertSame(['wf_reconst_no_response'], PhaseRules::missing(['reconst' => ['status' => 'sent']], 3));
        self::assertSame(['wf_reconst_need_note'], PhaseRules::missing(['reconst' => ['status' => 'rejected']], 3));
        self::assertSame([], PhaseRules::missing(['reconst' => ['status' => 'rejected', 'responseNote' => 'nu', 'responseDate' => '2026-11-01']], 3));
    }

    public function testWorkRowsNeedRealExecutor(): void
    {
        self::assertSame(['wf_no_work_rows'], PhaseRules::missing([], 4));
        $r = Fixtures::row();
        $r['completedBy'] = 'lakatos';
        self::assertContains('wf_row_no_executor', PhaseRules::missing(['bodyRows' => [$r]], 4));
        self::assertSame([], PhaseRules::missing(['bodyRows' => [Fixtures::row()]], 4));
        self::assertFalse(PhaseRules::hasExecutableWork(['paintRows' => [['notRequired' => true]]], 5));
    }

    public function testControlNokBlocks(): void
    {
        self::assertContains('wf_control_nok', PhaseRules::missing(['control' => ['allDone' => true, 'lastResult' => 'nok']], 6));
        self::assertSame([], PhaseRules::missing(['control' => ['allDone' => true, 'lastResult' => 'ok']], 6));
    }

    public function testClosingNeedsFivePhotosAndHandover(): void
    {
        $j = Fixtures::closingReady(['phases' => ['6' => ['status' => 'done']]]);
        self::assertSame([], PhaseRules::missing($j, 7));
        $j['closingPhotos'] = array_fill(0, 5, ['url' => '']);
        self::assertContains('wf_photos_not_five', PhaseRules::missing($j, 7));
    }

    public function testOverrideDropsOnlyOverridableCodes(): void
    {
        $j = Fixtures::closingReady(['phases' => ['6' => ['status' => 'done']]]);
        $j['closingPhotos'] = [];
        $j['closing']['factura'] = '';
        self::assertSame(['wf_no_invoice'], PhaseRules::blocking($j, 7, true));
    }

    public function testCannotEnterFuturePhase(): void
    {
        $e = PhaseRules::canEnter(['damageType' => 'asig'], 4);
        self::assertFalse($e['allowed']);
        self::assertSame('wf_future_phase', $e['reasons'][0]);
        self::assertContains('wf_eval_not_accepted', $e['reasons']);
        self::assertContains('wf_reconst_waiting', $e['reasons']);
    }
}
