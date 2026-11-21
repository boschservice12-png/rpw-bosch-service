<?php

declare(strict_types=1);

namespace App\Controller;

use App\Application\AuthService;
use App\Security\ActorUser;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/api')]
final class AuthController
{
    public function __construct(private readonly AuthService $auth)
    {
    }

    #[Route('/health', methods: ['GET'])]
    public function health(): JsonResponse
    {
        return new JsonResponse(['ok' => true, 'service' => 'rpw-symfony', 'time' => gmdate(\DATE_ATOM)]);
    }

    #[Route('/roster/{shopId}', methods: ['GET'])]
    public function roster(string $shopId): JsonResponse
    {
        return new JsonResponse(['ok' => true, 'rows' => $this->auth->roster($shopId)]);
    }

    /** IP-alapú fékkel is: a dolgozónkénti zár mellett a tömeges próbálgatást is lassítja. */
    #[Route('/login', methods: ['POST'])]
    public function login(Request $r, RateLimiterFactoryInterface $loginLimiter): JsonResponse
    {
        if (!$loginLimiter->create($r->getClientIp() ?? 'x')->consume()->isAccepted()) {
            throw new \App\Application\ApiError('locked');
        }
        $b = JsonInput::body($r);
        $res = $this->auth->login((string) JsonInput::str($b, 'shop_id'), (string) JsonInput::str($b, 'employee_id'), (string) JsonInput::str($b, 'pin'));

        return new JsonResponse(['ok' => true] + $res);
    }

    #[Route('/logout', methods: ['POST'])]
    public function logout(#[CurrentUser] ActorUser $u): JsonResponse
    {
        $this->auth->logout($u->token);

        return new JsonResponse(['ok' => true]);
    }

    #[Route('/session', methods: ['GET'])]
    public function session(#[CurrentUser] ActorUser $u): JsonResponse
    {
        return new JsonResponse(['ok' => true, 'employee' => $u->actor->toArray()]);
    }

    #[Route('/team/pin', methods: ['POST'])]
    public function setPin(Request $r, #[CurrentUser] ActorUser $u): JsonResponse
    {
        $b = JsonInput::body($r);
        $this->auth->setPin($u->actor, (string) (JsonInput::str($b, 'employee_id') ?? $u->actor->id), (string) JsonInput::str($b, 'pin'), $u->token);

        return new JsonResponse(['ok' => true]);
    }

    #[Route('/team/pin-status', methods: ['GET'])]
    public function pinStatus(#[CurrentUser] ActorUser $u): JsonResponse
    {
        return new JsonResponse(['ok' => true, 'rows' => $this->auth->pinStatus($u->actor)]);
    }

    #[Route('/team/pin-unlock', methods: ['POST'])]
    public function pinUnlock(Request $r, #[CurrentUser] ActorUser $u): JsonResponse
    {
        $this->auth->unlockPin($u->actor, (string) JsonInput::str(JsonInput::body($r), 'employee_id'));

        return new JsonResponse(['ok' => true]);
    }
}
