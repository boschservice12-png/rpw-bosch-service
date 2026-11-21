<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Tests\Unit\Fixtures;

/** A meglévő felület szerződése: ugyanazok a függvénynevek, ugyanazok a válaszalakok. */
final class CompatTest extends ApiTestCase
{
    private function rpc(string $fn, array $args = []): array
    {
        $this->client->request('POST', '/rest/v1/rpc/'.$fn, [], [], ['CONTENT_TYPE' => 'application/json'], json_encode($args));
        $res = json_decode((string) $this->client->getResponse()->getContent(), true) ?? [];
        $res['_status'] = $this->client->getResponse()->getStatusCode();

        return $res;
    }

    private function loginRpc(string $shop, string $emp, string $pin): array
    {
        $r = $this->rpc('rpw2_login', ['p_shop_id' => $shop, 'p_employee_id' => $emp, 'p_pin' => $pin]);
        self::assertTrue($r['ok'] ?? false, json_encode($r));

        return $r;
    }

    public function testLoginSessionAndEmployeeShape(): void
    {
        [$s, $ids] = $this->shop('A', ['manager' => ['Mihai Műszakvezető', '4826']]);
        $roster = $this->rpc('rpw2_roster', ['p_shop_id' => $s]);
        self::assertSame('Műszakvezető', $roster[0]['role'], 'a belépőlap sima listát vár');
        self::assertTrue($roster[0]['hasPin']);
        self::assertSame('bad_pin', $this->rpc('rpw2_login', ['p_shop_id' => $s, 'p_employee_id' => $ids['manager'], 'p_pin' => '0000'])['error']);
        $r = $this->loginRpc($s, $ids['manager'], '4826');
        self::assertSame(64, \strlen($r['token']));
        self::assertSame('Műszakvezető', $r['employee']['role'], 'a kliens a feliratból képezi a szerepet');
        self::assertSame('manager', $r['employee']['role_code']);
        self::assertTrue($r['employee']['can']['override']);
        self::assertTrue($this->rpc('rpw2_session', ['p_token' => $r['token']])['ok']);
        $this->rpc('rpw_logout', ['p_token' => $r['token']]);
        self::assertSame('invalid', $this->rpc('rpw2_session', ['p_token' => $r['token']])['error']);
    }

    public function testRejectionsAre200WithOkFalseAndClosedPathsAre404(): void
    {
        $r = $this->rpc('rpw_jobs_list', ['p_token' => str_repeat('x', 64)]);
        self::assertSame(200, $r['_status'], 'a régi függvények HTTP 200-zal utasítottak el');
        self::assertSame(['ok' => false, 'error' => 'unauthorized'], ['ok' => $r['ok'], 'error' => $r['error']]);
        foreach (['rpw_patch', 'rpw_patch_v2', 'rpw_login', 'rpw_next_job_number', 'nincs_ilyen'] as $fn) {
            self::assertSame(404, $this->rpc($fn, [])['_status'], $fn.' lezárt út');
        }
        $cap = $this->rpc('rpw_server_capabilities');
        foreach (['rpw_jobs_list', 'rpw_job_get', 'rpw_patch_v3', 'rpw_transition', 'rpw2_session', 'rpw2_login', 'rpw_requirements'] as $need) {
            self::assertContains($need, $cap['rpcs']);
        }
        self::assertGreaterThanOrEqual('005', $cap['schema_version']);
    }

    public function testJobLifecycleThroughOldContract(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $t = $this->loginRpc($s, $ids['admin'], '4826')['token'];
        $num = $this->rpc('rpw_job_number', ['p_token' => $t, 'p_prefix' => 'MS-26-']);
        self::assertSame('MS-26-1', $num['number'], 'a felület a felső szinten keresi');
        self::assertSame('MS-26-1', $num['data']['number']);
        $id = 'RPW-0b6c3f0e-1a2b-4c3d-9e8f-0123456789ab';
        $c = $this->rpc('rpw_patch_v3', ['p_token' => $t, 'p_id' => $id, 'p_patch' => ['id' => $id, 'number' => 'MS-26-1'] + Fixtures::receptionReady(), 'p_expected_version' => null, 'p_phase' => null]);
        self::assertTrue($c['ok'], json_encode($c));
        self::assertSame(1, $c['version']);
        $job = $this->rpc('rpw_job_get', ['p_token' => $t, 'p_id' => $id]);
        self::assertSame($id, $job['id'], 'LAPOS válasz: a rpw-db.js getRow r.data.id-t olvas');
        self::assertSame(1, $job['version']);
        self::assertSame('MS-26-1', $job['data']['number'], 'a `data` maga a munka');

        // a felület a TELJES munkát küldi vissza — a változatlan fázismezők nem akadnak fenn
        $full = $job['data'];
        $full['observatii'] = 'Lovitură bară față';
        $full['version'] = 1;
        $p = $this->rpc('rpw_patch_v3', ['p_token' => $t, 'p_id' => $id, 'p_patch' => $full, 'p_expected_version' => 1, 'p_phase' => '1']);
        self::assertTrue($p['ok'], json_encode($p));

        $tr = $this->rpc('rpw_transition', ['p_token' => $t, 'p_id' => $id, 'p_phase' => 1, 'p_action' => 'complete', 'p_expected_version' => 2,
            'p_reason' => null, 'p_rework_id' => null, 'p_note' => null]);
        self::assertTrue($tr['ok'], json_encode($tr));
        self::assertSame(2, $tr['data']['phase']);
        self::assertSame(3, $tr['version']);
        $stale = $this->rpc('rpw_transition', ['p_token' => $t, 'p_id' => $id, 'p_phase' => 2, 'p_action' => 'start', 'p_expected_version' => 2]);
        self::assertSame('version_conflict', $stale['error']);
        self::assertSame(3, $stale['server_version']);

        self::assertCount(1, $this->rpc('rpw_jobs_list', ['p_token' => $t, 'p_trashed' => false])['rows']);
        self::assertTrue($this->rpc('rpw_job_trash', ['p_token' => $t, 'p_id' => $id])['ok']);
        self::assertSame($id, $this->rpc('rpw_cleanup_list', ['p_token' => $t])['rows'][0]['uid']);
        self::assertSame('reason_required', $this->rpc('rpw_cleanup_hard_delete', ['p_token' => $t, 'p_id' => $id, 'p_reason' => ' '])['error']);
        self::assertTrue($this->rpc('rpw_cleanup_hard_delete', ['p_token' => $t, 'p_id' => $id, 'p_reason' => 'duplicat'])['ok']);
    }

    public function testOldClientWorkflowFieldsAreIgnoredNotWritten(): void
    {
        [$s, $ids] = $this->shop('A', ['receptie' => ['Rita Recepție', '4826']]);
        $t = $this->loginRpc($s, $ids['receptie'], '4826')['token'];
        $id = 'RPW-3b6c3f0e-1a2b-4c3d-9e8f-0123456789ab';
        $pending = array_fill_keys(['1', '2', '3', '4', '5', '6', '7'], ['status' => 'pending', 'started' => null]);
        $c = $this->rpc('rpw_patch_v3', ['p_token' => $t, 'p_id' => $id, 'p_patch' => ['id' => $id, 'client' => 'X', 'phase' => 1, 'phases' => $pending]]);
        self::assertSame('pending', $c['data']['phases']['1']['status'], 'friss munka: az 1. fázist a recepció indítja');
        // a régi kliens: damageType=auto, és HELYBEN levezetett / időbélyegzett fázisadat, sőt hamis lezárás
        $full = $c['data'];
        $full['damageType'] = 'auto';
        $full['phases']['3'] = ['status' => 'skipped', 'lastChangedAt' => '2026-11-21T10:00:00Z'];
        $full['phases']['1'] = ['status' => 'done'];
        $full['inchis'] = true;
        $r = $this->rpc('rpw_patch_v3', ['p_token' => $t, 'p_id' => $id, 'p_patch' => $full, 'p_expected_version' => 1]);
        self::assertTrue($r['ok'], json_encode($r));
        self::assertSame('auto', $r['data']['damageType'], 'a normál adat íródik');
        self::assertSame('pending', $r['data']['phases']['1']['status'], 'a hamis lezárás NEM íródik');
        self::assertFalse($r['data']['inchis']);
        self::assertSame('skipped', $r['data']['phases']['3']['status'], 'a 3. fázis kihagyását a SZERVER vezeti le');
    }

    public function testEmptyObjectsSurviveTheRoundTrip(): void
    {
        // CSENDES ADATVESZTÉS ELLEN: a felület `elements: {}`-be ír kulcsokat. Ha a
        // szerver `[]`-t adna vissza, a JS-tömb nevesített kulcsai mentéskor elvesznének.
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $t = $this->loginRpc($s, $ids['admin'], '4826')['token'];
        $id = 'RPW-4b6c3f0e-1a2b-4c3d-9e8f-0123456789ab';
        $raw = '{"p_token":"'.$t.'","p_id":"'.$id.'","p_patch":{"id":"'.$id.'","client":"X","elements":{},"photoKeys":{},"dosarActe":{}}}';
        $this->client->request('POST', '/rest/v1/rpc/rpw_patch_v3', [], [], ['CONTENT_TYPE' => 'application/json'], $raw);
        $body = (string) $this->client->getResponse()->getContent();
        self::assertStringContainsString('"elements":{}', $body);
        self::assertStringContainsString('"photoKeys":{}', $body);
        $this->client->request('POST', '/rest/v1/rpc/rpw_job_get', [], [], ['CONTENT_TYPE' => 'application/json'], json_encode(['p_token' => $t, 'p_id' => $id]));
        $got = (string) $this->client->getResponse()->getContent();
        self::assertStringContainsString('"elements":{}', $got, 'az adatbázisból visszaolvasva is objektum');
        self::assertStringContainsString('"results":{}', $got, 'a szerver által létrehozott control.results is objektum');
        $r = $this->rpc('rpw_patch_v3', ['p_token' => $t, 'p_id' => $id, 'p_patch' => ['elements' => ['capota' => ['statusV2' => 'ok']]], 'p_expected_version' => 1]);
        self::assertSame('ok', $r['data']['elements']['capota']['statusV2']);
    }

    public function testReworkCycleWithExtraDetails(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $t = $this->loginRpc($s, $ids['admin'], '4826')['token'];
        $id = 'RPW-1b6c3f0e-1a2b-4c3d-9e8f-0123456789ab';
        $data = ['phases' => array_fill_keys(['1', '2', '3', '4', '5'], ['status' => 'done']) + ['6' => ['status' => 'active']]];
        $this->db->insert('rpw_jobs', ['id' => $id, 'shop_id' => $s, 'data' => json_encode($data), 'version' => 1]);
        $bad = $this->rpc('rpw_transition', ['p_token' => $t, 'p_id' => $id, 'p_phase' => 5, 'p_action' => 'rework_open', 'p_expected_version' => 1, 'p_reason' => 'nuanță']);
        self::assertSame('wf_rw_desc', $bad['error'], 'a felület fordítható wf_-kódot kap');
        $ok = $this->rpc('rpw_transition', ['p_token' => $t, 'p_id' => $id, 'p_phase' => 5, 'p_action' => 'rework_open', 'p_expected_version' => 1,
            'p_reason' => 'Diferență de nuanță pe aripa stângă', 'p_extra' => ['category' => 'vopsitorie', 'assigned_to' => 'Vasile Pop']]);
        self::assertTrue($ok['ok'], json_encode($ok));
        $rw = $ok['data']['rework'][0];
        self::assertSame('Vasile Pop', $rw['assignedTo']);
        self::assertSame(5, $rw['sourcePhase']);
        $done = $this->rpc('rpw_transition', ['p_token' => $t, 'p_id' => $id, 'p_phase' => 6, 'p_action' => 'rework_close', 'p_expected_version' => 2,
            'p_rework_id' => $rw['id'], 'p_note' => 'Revopsit', 'p_extra' => ['resolved_by' => 'Vasile Pop']]);
        self::assertTrue($done['ok'], json_encode($done));
        self::assertSame('active', $done['data']['phases']['6']['status']);
    }

    public function testTeamPostsAndLastManagerLock(): void
    {
        [$s, $ids] = $this->shop('A', ['admin' => ['Ana Admin', '4826'], 'vopsitor' => ['Vasile Pop', '5937']]);
        $t = $this->loginRpc($s, $ids['admin'], '4826')['token'];
        $team = $this->rpc('rpw2_team', ['p_token' => $t, 'p_include_left' => false]);
        self::assertCount(2, $team['employees']);
        self::assertNotEmpty($team['roles']);
        $lock = $this->rpc('rpw2_employee_save', ['p_token' => $t, 'p_id' => $ids['admin'], 'p_active' => false]);
        self::assertSame('last_manager_lock', $lock['error'], 'a szerviz nem maradhat csapatkezelő nélkül');
        $new = $this->rpc('rpw2_employee_save', ['p_token' => $t, 'p_id' => null, 'p_name' => 'Ion Nou', 'p_role_code' => 'tinichigiu']);
        self::assertTrue($new['ok']);
        $nid = $new['data']['id'];
        self::assertTrue($this->rpc('rpw2_pin_set', ['p_token' => $t, 'p_employee_id' => $nid, 'p_new_pin' => '7391'])['ok']);
        $vt = $this->loginRpc($s, $nid, '7391')['token'];
        self::assertTrue($this->rpc('rpw2_employee_save', ['p_token' => $t, 'p_id' => $nid, 'p_active' => false])['ok']);
        self::assertSame('invalid', $this->rpc('rpw2_session', ['p_token' => $vt])['error'], 'kilépéskor a munkamenet megszűnik');
        self::assertTrue($this->rpc('rpw_post_upsert', ['p_token' => $t, 'p_code' => 'RECEPTIE', 'p_label' => 'Recepție'])['ok']);
        self::assertTrue($this->rpc('rpw_post_assign', ['p_token' => $t, 'p_code' => 'RECEPTIE', 'p_employee_id' => $ids['vopsitor']])['ok']);
        self::assertSame('Vasile Pop', $this->rpc('rpw_posts_get', ['p_token' => $t])['rows'][0]['employee_name']);
        $vop = $this->loginRpc($s, $ids['vopsitor'], '5937')['token'];
        self::assertSame('not_allowed', $this->rpc('rpw2_team', ['p_token' => $vop])['error']);
    }

    public function testStorageGatewayAndSignedUrls(): void
    {
        [$a, $ia] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        [$b, $ib] = $this->shop('B', ['admin' => ['Bela Admin', '5937']]);
        $ta = $this->loginRpc($a, $ia['admin'], '4826')['token'];
        $tb = $this->loginRpc($b, $ib['admin'], '5937')['token'];
        $id = 'RPW-2b6c3f0e-1a2b-4c3d-9e8f-0123456789ab';
        $this->rpc('rpw_patch_v3', ['p_token' => $ta, 'p_id' => $id, 'p_patch' => ['client' => 'X']]);
        $gw = function (array $body, ?string $tok) {
            $h = ['CONTENT_TYPE' => 'application/json'] + ($tok ? ['HTTP_X_RPW_TOKEN' => $tok] : []);
            $this->client->request('POST', '/functions/v1/rpw-storage', [], [], $h, json_encode($body));

            return [$this->client->getResponse()->getStatusCode(), json_decode((string) $this->client->getResponse()->getContent(), true)];
        };
        $path = $id.'/foto_fata.jpg';
        self::assertSame(401, $gw(['op' => 'sign-upload', 'path' => $path], null)[0]);
        self::assertSame(403, $gw(['op' => 'sign-upload', 'path' => $path], $tb)[0], 'idegen szerviz nem tölthet fel');
        self::assertSame(400, $gw(['op' => 'sign-upload', 'path' => $id.'/../x.jpg'], $ta)[0]);
        [$st, $ticket] = $gw(['op' => 'sign-upload', 'path' => $path], $ta);
        self::assertSame(200, $st);

        // supabase-js: PUT multipart, a fájl névtelen mezőben
        $jpeg = base64_decode('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=');
        $bnd = 'XyZ123';
        $body = "--$bnd\r\nContent-Disposition: form-data; name=\"cacheControl\"\r\n\r\n3600\r\n--$bnd\r\nContent-Disposition: form-data; name=\"\"; filename=\"blob\"\r\nContent-Type: image/jpeg\r\n\r\n".$jpeg."\r\n--$bnd--\r\n";
        $this->client->request('PUT', '/storage/v1/object/upload/sign/rpw-photos/'.$path.'?token='.$ticket['token'], [], [], ['CONTENT_TYPE' => 'multipart/form-data; boundary='.$bnd], $body);
        self::assertSame(200, $this->client->getResponse()->getStatusCode(), (string) $this->client->getResponse()->getContent());
        self::assertSame('rpw-photos/'.$path, json_decode((string) $this->client->getResponse()->getContent(), true)['Key']);
        // a token máshoz nem használható
        $this->client->request('PUT', '/storage/v1/object/upload/sign/rpw-photos/'.$id.'/mas.jpg?token='.$ticket['token'], [], [], [], $jpeg);
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        [, $read] = $gw(['op' => 'sign-read', 'paths' => [$path]], $ta);
        $url = parse_url($read['urls'][0]['signedUrl']);
        $this->client->request('GET', $url['path'].'?'.$url['query']);
        self::assertSame(200, $this->client->getResponse()->getStatusCode());
        self::assertSame('image/jpeg', $this->client->getResponse()->headers->get('Content-Type'));
        $this->client->request('GET', $url['path'].'?token=hamis.token');
        self::assertSame(403, $this->client->getResponse()->getStatusCode());

        // ügyfél: csak ügyfél-nevű fájl, felülírás nélkül
        self::assertSame(403, $gw(['op' => 'client-sign-upload', 'path' => $path], null)[0]);
        [$cs] = $gw(['op' => 'client-sign-upload', 'path' => $id.'/client_1732200000000_ab12.jpg'], null);
        self::assertSame(200, $cs);
        [$rs, $rm] = $gw(['op' => 'remove', 'paths' => [$path]], $ta);
        self::assertSame([200, 1], [$rs, $rm['removed']]);
    }
}
