<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Tests\Unit\Fixtures;

final class ApiTest extends ApiTestCase
{
    public function testUnauthenticatedIsRejected(): void
    {
        self::assertSame(401, $this->call('GET', '/api/jobs')['_status']);
        self::assertSame(401, $this->call('GET', '/api/jobs', null, str_repeat('a', 64))['_status']);
        self::assertTrue($this->call('GET', '/api/health')['ok']);
    }

    public function testPinLockoutAfterTenWrongAttempts(): void
    {
        [$shop, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        for ($i = 0; $i < 10; ++$i) {
            self::assertSame('bad_pin', $this->call('POST', '/api/login', ['shop_id' => $shop, 'employee_id' => $ids['admin'], 'pin' => '0000'])['error']);
        }
        $r = $this->call('POST', '/api/login', ['shop_id' => $shop, 'employee_id' => $ids['admin'], 'pin' => '4826']);
        self::assertSame('locked', $r['error'], 'a helyes PIN sem enged be zárolás alatt');
    }

    public function testTenantIsolation(): void
    {
        [$a, $ia] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        [$b, $ib] = $this->shop('B', ['admin' => ['Bela Admin', '5937']]);
        $ta = $this->login($a, $ia['admin'], '4826');
        $tb = $this->login($b, $ib['admin'], '5937');
        self::assertTrue($this->call('PATCH', '/api/jobs/J-A1', ['patch' => ['client' => 'Titkos Ügyfél']], $ta)['ok']);

        self::assertSame([], $this->call('GET', '/api/jobs', null, $tb)['rows']);
        self::assertSame('not_found', $this->call('GET', '/api/jobs/J-A1', null, $tb)['error']);
        self::assertSame('not_found', $this->call('PATCH', '/api/jobs/J-A1', ['patch' => ['client' => 'x'], 'expected_version' => 1], $tb)['error']);
        self::assertSame('not_found', $this->call('POST', '/api/jobs/J-A1/transition', ['phase' => 1, 'action' => 'start', 'expected_version' => 1], $tb)['error']);
        self::assertSame('not_found', $this->call('POST', '/api/jobs/J-A1/trash', null, $tb)['error']);
        self::assertSame('Titkos Ügyfél', $this->call('GET', '/api/jobs/J-A1', null, $ta)['data']['data']['client']);
    }

    public function testVersionConflictAndProtectedFields(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $t = $this->login($s, $ids['admin'], '4826');
        self::assertSame(1, $this->call('PATCH', '/api/jobs/J1', ['patch' => ['client' => 'X']], $t)['version']);
        self::assertSame(2, $this->call('PATCH', '/api/jobs/J1', ['patch' => ['phone' => '07'], 'expected_version' => 1], $t)['version']);
        $stale = $this->call('PATCH', '/api/jobs/J1', ['patch' => ['phone' => '08'], 'expected_version' => 1], $t);
        self::assertSame('version_conflict', $stale['error']);
        self::assertSame(409, $stale['_status']);
        self::assertSame(2, $stale['server_version']);
        self::assertSame('expected_version_required', $this->call('PATCH', '/api/jobs/J1', ['patch' => ['phone' => '08']], $t)['error']);
        $p = $this->call('PATCH', '/api/jobs/J1', ['patch' => ['inchis' => true], 'expected_version' => 2], $t);
        self::assertSame('protected_workflow_field', $p['error']);
        self::assertSame('bad_request', $this->call('PATCH', '/api/jobs/J1', ['patch' => 'x'], $t)['error']);
    }

    public function testFullJobSaveOnlyChecksRealChanges(): void
    {
        [$s, $ids] = $this->shop('A', ['receptie' => ['Rita Recepție', '4826']]);
        $t = $this->login($s, $ids['receptie'], '4826');
        $forged = $this->call('PATCH', '/api/jobs/J1', ['patch' => ['client' => 'X', 'phase' => 5, 'inchis' => true]], $t);
        self::assertSame('protected_workflow_field', $forged['error'], 'a REST API szigorú: workflow-mező új munkán sem');
        $job = $this->call('PATCH', '/api/jobs/J1', ['patch' => ['client' => 'X']], $t);
        self::assertSame(1, $job['data']['phase']);
        $full = $job['data'];
        $full['client'] = 'Y';
        $full['observatii'] = 'zgârietură';
        $full['version'] = 1;
        $r = $this->call('PATCH', '/api/jobs/J1', ['patch' => $full, 'expected_version' => 1], $t);
        self::assertTrue($r['ok'], json_encode($r));
        self::assertArrayNotHasKey('version', $r['data'], 'a metaadat nem kerül az adatba');
        $full = $r['data'];
        $full['phases']['1']['status'] = 'done';
        $d = $this->call('PATCH', '/api/jobs/J1', ['patch' => $full, 'expected_version' => 2], $t);
        self::assertSame('protected_workflow_field', $d['error']);
        self::assertSame(['phases.1.status'], $d['fields']);
        $same = $this->call('PATCH', '/api/jobs/J1', ['patch' => $r['data'], 'expected_version' => 2], $t);
        self::assertSame(2, $same['version'], 'változás nélkül nincs új verzió');
    }

    public function testFreshJobKeepsPendingPhasesAndNullFillIsNoChange(): void
    {
        [$s, $ids] = $this->shop('A', ['receptie' => ['Rita Recepție', '4826']]);
        $t = $this->login($s, $ids['receptie'], '4826');
        $pending = array_fill_keys(['1', '2', '3', '4', '5', '6', '7'], ['status' => 'pending', 'started' => null]);
        $c = $this->call('PATCH', '/api/jobs/J1', ['patch' => ['client' => 'X', 'phases' => $pending]], $t);
        self::assertSame('pending', $c['data']['phases']['1']['status'], 'friss munka: az 1. fázist a recepció indítja');
        $forged = $this->call('PATCH', '/api/jobs/J2', ['patch' => ['client' => 'Y', 'phases' => ['1' => ['status' => 'done']]]], $t);
        self::assertSame('protected_workflow_field', $forged['error'], 'előrehaladott állapot nem hozható új munkán');
        // a kliens migrációja null-mezőket pótol — ez nem írás
        $full = $c['data'];
        foreach ($full['phases'] as $k => $p) {
            $full['phases'][$k] += ['finished' => null, 'completedBy' => null, 'lastChangedAt' => null];
        }
        $full['client'] = 'Z';
        $r = $this->call('PATCH', '/api/jobs/J1', ['patch' => $full, 'expected_version' => 1], $t);
        self::assertTrue($r['ok'], json_encode($r));
    }

    public function testRoleBasedFieldAndPhasePermissions(): void
    {
        [$s, $ids] = $this->shop('A', ['receptie' => ['Rita Recepție', '4826'], 'auditor' => ['Sanyi Szerelő', '5937']]);
        $rec = $this->login($s, $ids['receptie'], '4826');
        $aud = $this->login($s, $ids['auditor'], '5937');
        self::assertTrue($this->call('PATCH', '/api/jobs/J1', ['patch' => ['client' => 'X', 'plate' => 'B1']], $rec)['ok']);
        $d = $this->call('PATCH', '/api/jobs/J1', ['patch' => ['closing' => ['factura' => 'F']], 'expected_version' => 1], $rec);
        self::assertSame('not_allowed', $d['error']);
        self::assertSame('close', $d['need']);
        self::assertSame('not_allowed', $this->call('PATCH', '/api/jobs/J2', ['patch' => ['client' => 'Y']], $aud)['error']);
        self::assertCount(1, $this->call('GET', '/api/jobs', null, $aud)['rows'], 'a szerelő olvashat');
        self::assertSame('not_allowed', $this->call('POST', '/api/jobs/J1/trash', null, $rec)['error']);
    }

    public function testFullLifecycleThroughApiWithAudit(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $t = $this->login($s, $ids['admin'], '4826');
        $num = $this->call('POST', '/api/jobs/number', ['prefix' => 'RPW'], $t)['data'];
        self::assertSame('RPW-00001', $num['number']);
        self::assertSame('RPW-00002', $this->call('POST', '/api/jobs/number', [], $t)['data']['number']);

        $id = 'RPW-00001';
        $v = $this->call('PATCH', "/api/jobs/$id", ['patch' => Fixtures::receptionReady()], $t)['version'];
        $step = function (int $phase, array $patch = []) use ($t, $id, &$v) {
            if ($patch !== []) {
                $v = $this->call('PATCH', "/api/jobs/$id", ['patch' => $patch, 'expected_version' => $v], $t)['version'];
            }
            $r = $this->call('POST', "/api/jobs/$id/transition", ['phase' => $phase, 'action' => 'complete', 'expected_version' => $v], $t);
            self::assertTrue($r['ok'] ?? false, json_encode($r));
            $v = $r['version'];

            return $r['data'];
        };
        $step(1);
        $step(2, Fixtures::evalReady([]));
        $step(4, ['bodyRows' => [Fixtures::row()]]);
        $step(5, ['paintRows' => [Fixtures::row()]]);
        $step(6, ['control' => ['allDone' => true, 'lastResult' => 'ok']]);
        $final = $step(7, Fixtures::closingReady([]));
        self::assertTrue($final['inchis']);

        $req = $this->call('GET', "/api/jobs/$id/requirements", null, $t)['data'];
        self::assertTrue($req['inchis']);
        $audit = $this->call('GET', "/api/jobs/$id/audit", null, $t)['rows'];
        self::assertContains('transition:complete', array_column($audit, 'action'));
        self::assertSame('Ana Admin', $audit[0]['actor']);

        $closed = $this->call('PATCH', "/api/jobs/$id", ['patch' => ['client' => 'Utólag'], 'expected_version' => $v], $t);
        self::assertTrue($closed['ok'], 'adatmező lezárt munkán is javítható (a régi rendszer is engedte)');
        $re = $this->call('POST', "/api/jobs/$id/transition", ['phase' => 7, 'action' => 'start', 'expected_version' => $closed['version']], $t);
        self::assertSame('job_closed', $re['error']);
    }

    public function testDeniedAttemptsAreAudited(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $t = $this->login($s, $ids['admin'], '4826');
        $this->call('PATCH', '/api/jobs/J1', ['patch' => ['client' => 'X']], $t);
        $this->call('POST', '/api/jobs/J1/transition', ['phase' => 1, 'action' => 'complete', 'expected_version' => 1], $t);
        $actions = array_column($this->call('GET', '/api/jobs/J1/audit', null, $t)['rows'], 'action');
        self::assertContains('denied:requirements_missing', $actions);
    }

    public function testTrashRestorePurge(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $t = $this->login($s, $ids['admin'], '4826');
        $this->call('PATCH', '/api/jobs/J1', ['patch' => ['client' => 'X']], $t);
        self::assertSame('not_found', $this->call('DELETE', '/api/jobs/J1', null, $t)['error'], 'végleges törlés csak kosárból');
        self::assertTrue($this->call('POST', '/api/jobs/J1/trash', null, $t)['ok']);
        self::assertSame('already_trashed', $this->call('POST', '/api/jobs/J1/trash', null, $t)['error']);
        self::assertCount(1, $this->call('GET', '/api/jobs?trashed=1', null, $t)['rows']);
        self::assertTrue($this->call('POST', '/api/jobs/J1/restore', null, $t)['ok']);
        $this->call('POST', '/api/jobs/J1/trash', null, $t);
        self::assertTrue($this->call('DELETE', '/api/jobs/J1', null, $t)['ok']);
        self::assertSame([], $this->call('GET', '/api/jobs?trashed=1', null, $t)['rows']);
    }

    public function testPinManagement(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826'], 'vopsitor' => ['Vasile Vopsitor', '5937']]);
        $adm = $this->login($s, $ids['admin'], '4826');
        $vop = $this->login($s, $ids['vopsitor'], '5937');
        self::assertSame('weak_pin', $this->call('POST', '/api/team/pin', ['pin' => '1234'], $vop)['error']);
        // 2026-11-23: no "pin_taken" oracle — a colleague's PIN is accepted (login is employee + PIN)
        self::assertTrue($this->call('POST', '/api/team/pin', ['pin' => '4826'], $vop)['ok'], 'a colleague\'s PIN must not be revealed');
        $this->login($s, $ids['admin'], '4826');
        $this->login($s, $ids['vopsitor'], '4826');
        self::assertSame('not_allowed', $this->call('POST', '/api/team/pin', ['employee_id' => $ids['admin'], 'pin' => '7391'], $vop)['error']);
        self::assertTrue($this->call('POST', '/api/team/pin', ['pin' => '7391'], $vop)['ok']);
        $this->login($s, $ids['vopsitor'], '7391');
        $hash = $this->db->fetchOne('SELECT pin_hash FROM rpw_employees WHERE id = ?', [$ids['vopsitor']]);
        self::assertStringStartsWith('$2a$', $hash, 'a régi pgcrypto-kompatibilis előtag');
        self::assertTrue($this->call('POST', '/api/logout', null, $adm)['ok']);
        self::assertSame(401, $this->call('GET', '/api/session', null, $adm)['_status']);
    }
}
