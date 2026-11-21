<?php

declare(strict_types=1);

namespace App\Controller;

use App\Application\AuditLog;
use App\Application\JobService;
use App\Security\ActorUser;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/api/jobs')]
final class JobController
{
    public function __construct(private readonly JobService $jobs, private readonly AuditLog $audit)
    {
    }

    #[Route('', methods: ['GET'])]
    public function list(Request $r, #[CurrentUser] ActorUser $u): JsonResponse
    {
        return new JsonResponse(['ok' => true, 'rows' => $this->jobs->list($u->actor, $r->query->getBoolean('trashed'))]);
    }

    #[Route('/number', methods: ['POST'])]
    public function number(Request $r, #[CurrentUser] ActorUser $u): JsonResponse
    {
        return new JsonResponse(['ok' => true, 'data' => $this->jobs->nextNumber($u->actor, (string) (JsonInput::str(JsonInput::body($r), 'prefix') ?? 'RPW'))]);
    }

    #[Route('/{id}', methods: ['GET'])]
    public function get(string $id, #[CurrentUser] ActorUser $u): JsonResponse
    {
        return new JsonResponse(['ok' => true, 'data' => $this->jobs->get($u->actor, $id)]);
    }

    /** Mentés: {patch:{...}, expected_version:int, phase?:string}. Új munkánál a verzió elhagyható. */
    #[Route('/{id}', methods: ['PATCH', 'PUT'])]
    public function patch(string $id, Request $r, #[CurrentUser] ActorUser $u): JsonResponse
    {
        $b = JsonInput::body($r);
        $patch = $b['patch'] ?? null;
        if (!\is_array($patch)) {
            throw new \App\Application\ApiError('bad_request', ['detail' => 'patch']);
        }

        return new JsonResponse(['ok' => true] + $this->jobs->patch($u->actor, $id, $patch, JsonInput::int($b, 'expected_version'), JsonInput::str($b, 'phase')));
    }

    /**
     * Fázisátmenet: {phase, action, expected_version, reason?, rework_id?, note?,
     * category?, description?, assigned_to?, resolved_by?}
     */
    #[Route('/{id}/transition', methods: ['POST'])]
    public function transition(string $id, Request $r, #[CurrentUser] ActorUser $u): JsonResponse
    {
        $b = JsonInput::body($r);
        $args = [];
        foreach (['reason', 'rework_id', 'note', 'category', 'description', 'assigned_to', 'resolved_by'] as $k) {
            if (($v = JsonInput::str($b, $k)) !== null) {
                $args[$k] = mb_substr($v, 0, 2000);
            }
        }

        return new JsonResponse(['ok' => true] + $this->jobs->transition($u->actor, $id, (int) JsonInput::int($b, 'phase'),
            (string) JsonInput::str($b, 'action'), JsonInput::int($b, 'expected_version'), $args));
    }

    #[Route('/{id}/requirements', methods: ['GET'])]
    public function requirements(string $id, #[CurrentUser] ActorUser $u): JsonResponse
    {
        return new JsonResponse(['ok' => true, 'data' => $this->jobs->requirements($u->actor, $id)]);
    }

    #[Route('/{id}/metrics', methods: ['GET'])]
    public function metrics(string $id, #[CurrentUser] ActorUser $u): JsonResponse
    {
        return new JsonResponse(['ok' => true, 'data' => $this->jobs->metrics($u->actor, $id)]);
    }

    #[Route('/{id}/gap-reason', methods: ['POST'])]
    public function gapReason(string $id, Request $r, #[CurrentUser] ActorUser $u): JsonResponse
    {
        $b = JsonInput::body($r);

        return new JsonResponse(['ok' => true] + $this->jobs->addGapReason($u->actor, $id, (string) JsonInput::str($b, 'reason'),
            (string) (JsonInput::str($b, 'note') ?? ''), JsonInput::int($b, 'expected_version')));
    }

    #[Route('/{id}/audit', methods: ['GET'])]
    public function audit(string $id, #[CurrentUser] ActorUser $u): JsonResponse
    {
        $this->jobs->get($u->actor, $id); // tulajdonjog-ellenőrzés

        return new JsonResponse(['ok' => true, 'rows' => $this->audit->forJob($u->actor->shopId, $id)]);
    }

    #[Route('/{id}/trash', methods: ['POST'])]
    public function trash(string $id, #[CurrentUser] ActorUser $u): JsonResponse
    {
        $this->jobs->trash($u->actor, $id);

        return new JsonResponse(['ok' => true, 'data' => ['id' => $id]]);
    }

    #[Route('/{id}/restore', methods: ['POST'])]
    public function restore(string $id, #[CurrentUser] ActorUser $u): JsonResponse
    {
        $this->jobs->restore($u->actor, $id);

        return new JsonResponse(['ok' => true, 'data' => ['id' => $id]]);
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function purge(string $id, #[CurrentUser] ActorUser $u): JsonResponse
    {
        $this->jobs->purge($u->actor, $id);

        return new JsonResponse(['ok' => true, 'data' => ['id' => $id]]);
    }
}
