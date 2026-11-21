<?php

declare(strict_types=1);

namespace App\Controller\Compat;

use App\Application\ApiError;
use App\Application\AuthService;
use App\Application\ClientUploadService;
use App\Application\JobService;
use App\Application\TeamService;
use App\Domain\Auth\Actor;
use App\Domain\Workflow\Messages;
use App\Domain\Workflow\Phase;
use App\Domain\Workflow\PhaseRules;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;

/**
 * SUPABASE-KOMPATIBILIS RPC-FELÜLET — a meglévő felület VÁLTOZATLANUL hívja.
 *
 * A supabase-js `sb.rpc(név, args)` hívása: POST /rest/v1/rpc/<név>, JSON-törzs.
 * A régi SQL-függvények HTTP 200-zal adták vissza az `{ok:false, …}` elutasítást
 * is; ezt a szerződést tartjuk, hogy a kliens hibakezelése (unwrap) változatlan
 * maradjon. Minden DÖNTÉST az új szolgáltatások hoznak (bérlő, verzió, jog, audit).
 *
 * Ismeretlen vagy LEZÁRT régi út (rpw_patch, rpw_patch_v2, rpw_login, …) → 404,
 * ahogy a PostgREST adja: a kliens ezt hálózati hibaként kezeli, nem sikerként.
 */
final class RpcController
{
    public const SCHEMA_VERSION = '006';

    private const FUNCTIONS = [
        'rpw2_roster', 'rpw2_login', 'rpw2_session', 'rpw_logout',
        'rpw_jobs_list', 'rpw_job_get', 'rpw_patch_v3', 'rpw_transition', 'rpw_requirements', 'rpw_can_complete',
        'rpw_job_trash', 'rpw_job_restore', 'rpw_job_purge', 'rpw_job_number',
        'rpw2_team', 'rpw2_employee_save', 'rpw2_role_save', 'rpw2_pin_set', 'rpw2_pin_status', 'rpw2_pin_unlock',
        'rpw_posts_get', 'rpw_post_assign', 'rpw_post_upsert',
        'rpw_cleanup_list', 'rpw_cleanup_hard_delete',
        'rpw_client_job_get', 'rpw_client_upload',
        'rpw_server_capabilities',
    ];

    public function __construct(
        private readonly AuthService $auth,
        private readonly JobService $jobs,
        private readonly TeamService $team,
        private readonly ClientUploadService $client,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/rest/v1/rpc/{fn}', name: 'compat_rpc', methods: ['POST'], requirements: ['fn' => '[a-z0-9_]{1,64}'])]
    public function rpc(string $fn, Request $r, RateLimiterFactoryInterface $loginLimiter): JsonResponse
    {
        if (!\in_array($fn, self::FUNCTIONS, true)) {
            return new JsonResponse(['code' => 'PGRST202', 'message' => 'Could not find the function public.'.$fn, 'details' => null, 'hint' => null], 404);
        }
        $raw = $r->getContent();
        try {
            $a = $raw === '' ? [] : \App\Infrastructure\Json::decode($raw, 64);
        } catch (\JsonException) {
            $a = null;
        }
        if ($a instanceof \stdClass) {
            $a = [];
        }
        if (!\is_array($a) || \strlen($raw) > 2_000_000) {
            return new JsonResponse(['code' => 'PGRST102', 'message' => 'Invalid JSON body'], 400);
        }
        if ($fn === 'rpw2_login' && !$loginLimiter->create($r->getClientIp() ?? 'x')->consume()->isAccepted()) {
            return $this->fail(new ApiError('locked'));
        }
        try {
            return new JsonResponse($this->dispatch($fn, $a));
        } catch (ApiError $e) {
            return $this->fail($e);
        } catch (\Throwable $e) {
            $ref = bin2hex(random_bytes(4));
            $this->logger->error('RPC {fn} hiba {ref}: {msg}', ['fn' => $fn, 'ref' => $ref, 'msg' => $e->getMessage(), 'exception' => $e]);

            return new JsonResponse(['ok' => false, 'error' => 'server_error', 'message' => 'Eroare internă. Cod: '.$ref], 200);
        }
    }

    private function dispatch(string $fn, array $a): array
    {
        switch ($fn) {
            // ── belépés (token nélkül) ────────────────────────────────
            case 'rpw2_roster':
                // a belépőlap SIMA LISTÁT vár (az éles függvény is azt ad; a 002-es fájl {ok,rows}-t írt)
                return $this->auth->roster($this->s($a, 'p_shop_id'));
            case 'rpw2_login':
                $res = $this->auth->login($this->s($a, 'p_shop_id'), $this->s($a, 'p_employee_id'), $this->s($a, 'p_pin'));
                $actor = $this->auth->actorFromToken($res['token']);

                return ['ok' => true, 'token' => $res['token'], 'employee' => $actor ? $this->auth->employeeInfo($actor) : null];
            case 'rpw_client_job_get':
                return $this->client->get($this->s($a, 'p_job_id'));
            case 'rpw_client_upload':
                return $this->client->upload($this->s($a, 'p_job_id'), $a['p_patch'] ?? null);
            case 'rpw_server_capabilities':
                return ['ok' => true, 'schema_version' => self::SCHEMA_VERSION, 'rpcs' => self::FUNCTIONS, 'rls_locked' => true,
                    'rules_version' => 5, 'business_gates_server_side' => true, 'storage_mode' => 'private',
                    'backend' => 'symfony', 'server_time' => gmdate(\DATE_ATOM)];
            case 'rpw2_session':
                $actor = $this->auth->actorFromToken($this->s($a, 'p_token'));

                return $actor === null ? ['ok' => false, 'error' => 'invalid', 'message' => 'Sesiune invalidă sau expirată.']
                    : ['ok' => true, 'employee' => $this->auth->employeeInfo($actor)];
            case 'rpw_logout':
                $this->auth->logout($this->s($a, 'p_token'));

                return ['ok' => true];
        }

        $me = $this->actor($a);
        $id = $this->s($a, 'p_id');

        return match ($fn) {
            'rpw_jobs_list' => ['ok' => true, 'rows' => $this->jobs->list($me, ($a['p_trashed'] ?? false) === true), 'version' => null],
            // a felület LAPOS választ vár: r.data.id / r.data.data / r.data.version (rpw-db.js getRow)
            'rpw_job_get' => ['ok' => true] + array_diff_key($this->jobs->get($me, $id), ['deleted_at' => 1]),
            // a régi felület a teljes munkát küldi: a védett workflow-mezőket a szerver kiszűri
            'rpw_patch_v3' => ['ok' => true] + $this->onlyDataVersion($this->jobs->patch($me, $id, \is_array($a['p_patch'] ?? null) ? $a['p_patch'] : [],
                $this->i($a, 'p_expected_version'), isset($a['p_phase']) ? (string) $a['p_phase'] : null, true)),
            'rpw_transition' => $this->transition($me, $id, $a),
            'rpw_requirements' => ['ok' => true, 'rows' => [], 'rules_version' => 5, 'source' => 'server:PhaseRules'],
            'rpw_can_complete' => $this->canComplete($me, $id, (int) $this->i($a, 'p_phase')),
            'rpw_job_trash' => $this->idResult(fn () => $this->jobs->trash($me, $id), $id),
            'rpw_job_restore' => $this->idResult(fn () => $this->jobs->restore($me, $id), $id),
            'rpw_job_purge' => $this->idResult(fn () => $this->jobs->purge($me, $id), $id),
            'rpw_job_number' => (function () use ($me, $a) {
                $n = $this->jobs->nextNumber($me, $this->s($a, 'p_prefix') ?: 'RPW');

                // a felület a `number`-t a felső szinten keresi, a régi RPC `data` alatt adta — mindkettő
                return ['ok' => true, 'n' => $n['n'], 'number' => $n['number'], 'data' => $n];
            })(),
            'rpw2_team' => ['ok' => true] + $this->team->team($me, ($a['p_include_left'] ?? false) === true),
            'rpw2_employee_save' => ['ok' => true, 'data' => ['id' => $this->team->saveEmployee($me, $a['p_id'] ?? null, $a['p_name'] ?? null,
                $a['p_role_code'] ?? null, $a['p_phone'] ?? null, isset($a['p_active']) ? (bool) $a['p_active'] : null)]],
            'rpw2_role_save' => (function () use ($me, $a) {
                $this->team->saveRole($me, $this->s($a, 'p_code'), $this->s($a, 'p_label'), $a['p_can'] ?? [], $this->i($a, 'p_sort'),
                    isset($a['p_active']) ? (bool) $a['p_active'] : null);

                return ['ok' => true];
            })(),
            'rpw2_pin_set' => (function () use ($me, $a) {
                $this->auth->setPin($me, $this->s($a, 'p_employee_id'), $this->s($a, 'p_new_pin'), $this->s($a, 'p_token'));

                return ['ok' => true];
            })(),
            'rpw2_pin_status' => ['ok' => true, 'rows' => $this->auth->pinStatus($me)],
            'rpw2_pin_unlock' => ['ok' => true, 'cleared' => $this->auth->unlockPin($me, $this->s($a, 'p_employee_id'))],
            'rpw_posts_get' => ['ok' => true, 'rows' => $this->team->posts($me)],
            'rpw_post_assign' => (function () use ($me, $a) {
                $this->team->assignPost($me, $this->s($a, 'p_code'), $a['p_employee_id'] ?? null);

                return ['ok' => true];
            })(),
            'rpw_post_upsert' => (function () use ($me, $a) {
                $this->team->upsertPost($me, $this->s($a, 'p_code'), $this->s($a, 'p_label'), $a['p_note'] ?? null, $this->i($a, 'p_sort'),
                    isset($a['p_active']) ? (bool) $a['p_active'] : null);

                return ['ok' => true];
            })(),
            'rpw_cleanup_list' => ['ok' => true, 'rows' => $this->jobs->cleanupList($me)],
            'rpw_cleanup_hard_delete' => (function () use ($me, $id, $a) {
                $this->jobs->hardDelete($me, $id, $this->s($a, 'p_reason'));

                return ['ok' => true];
            })(),
        };
    }

    /**
     * Fázisátmenet. A felület a rework részleteit a `p_extra`-ban küldi
     * (category, assigned_to, description, resolved_by). Ha hiányoznak,
     * a régi szerver-szemantika szerint a fázisból és az indoklásból
     * vezetjük le — a felelős hiánya viszont NEM pótolható csendben.
     */
    private function transition(Actor $me, string $id, array $a): array
    {
        $phase = (int) $this->i($a, 'p_phase');
        $action = $this->s($a, 'p_action');
        $extra = \is_array($a['p_extra'] ?? null) ? $a['p_extra'] : [];
        $args = array_filter([
            'reason' => $a['p_reason'] ?? null, 'rework_id' => $a['p_rework_id'] ?? null, 'note' => $a['p_note'] ?? ($extra['note'] ?? null),
            'category' => $extra['category'] ?? null, 'assigned_to' => $extra['assigned_to'] ?? null,
            'description' => $extra['description'] ?? null, 'resolved_by' => $extra['resolved_by'] ?? null,
        ], static fn ($v) => $v !== null && $v !== '');
        $args = array_map(static fn ($v) => mb_substr((string) $v, 0, 2000), $args);
        if ($action === 'rework_open') {
            $args['category'] ??= match ($phase) { 4 => 'tinichigerie', 5 => 'vopsitorie', default => 'manager' };
            $args['description'] ??= $args['reason'] ?? '';
        }
        try {
            return ['ok' => true] + $this->onlyDataVersion($this->jobs->transition($me, $id, $phase, $action, $this->i($a, 'p_expected_version'), $args));
        } catch (ApiError $e) {
            // a rework/override hiánykódja (wf_*) a felület fordítható üzenete
            if (\in_array($e->errorCode, ['rework_invalid', 'override_invalid'], true) && !empty($e->details['missing'])) {
                throw new ApiError((string) $e->details['missing'][0], $e->details);
            }
            throw $e;
        }
    }

    private function canComplete(Actor $me, string $id, int $phase): array
    {
        if (!Phase::isValid($phase)) {
            throw new ApiError('bad_phase');
        }
        $job = $this->jobs->get($me, $id);
        $miss = PhaseRules::blocking($job['data'], $phase, false);

        return ['ok' => true, 'can' => $miss === [], 'version' => $job['version'],
            'missing' => array_map(static fn (string $c) => ['code' => $c, 'message' => $c, 'phase' => $phase, 'severity' => 'block',
                'overridable' => \in_array($c, PhaseRules::OVERRIDABLE, true)], $miss)];
    }

    private function actor(array $a): Actor
    {
        $actor = $this->auth->actorFromToken(isset($a['p_token']) && \is_string($a['p_token']) ? $a['p_token'] : null);
        if ($actor === null) {
            throw new ApiError('unauthorized');
        }

        return $actor;
    }

    private function onlyDataVersion(array $r): array
    {
        return ['data' => $r['data'], 'version' => $r['version']];
    }

    private function idResult(callable $fn, string $id): array
    {
        $fn();

        return ['ok' => true, 'data' => ['id' => $id]];
    }

    private function s(array $a, string $k): string
    {
        $v = $a[$k] ?? '';

        return \is_scalar($v) ? (string) $v : '';
    }

    private function i(array $a, string $k): ?int
    {
        $v = $a[$k] ?? null;

        return is_numeric($v) ? (int) $v : null;
    }

    private function fail(ApiError $e): JsonResponse
    {
        $body = $e->toArray();
        if (str_starts_with($e->errorCode, 'wf_')) {
            $body['message'] = Messages::server('requirements_missing');
        }

        return new JsonResponse($body, 200);
    }
}
