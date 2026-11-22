<?php

declare(strict_types=1);

namespace App\Controller;

use App\Application\AuthService;
use App\Security\ActorUser;
use Doctrine\DBAL\Connection;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

#[Route('/api')]
final class AuthController
{
    public function __construct(
        private readonly AuthService $auth,
        private readonly Connection $db,
        #[Autowire('%kernel.project_dir%/../REVISION')] private readonly string $revisionFile = '',
    )
    {
    }

    #[Route('/health', methods: ['GET'])]
    public function health(): JsonResponse
    {
        // Az adatbázist is megszólítja: a telepítő egészség-ellenőrzése így a valódi működést méri,
        // nem csak azt, hogy a PHP elindul. Hibarészletet nem ad ki.
        try {
            $db = $this->db->fetchOne('SELECT 1') !== false;
        } catch (\Throwable) {
            $db = false;
        }

        // a futó kiadás commitja: a telepítő ezzel igazolja, hogy TÉNYLEG az új kód válaszol (nem egy gyorsítótárazott régi)
        $rev = is_file($this->revisionFile) ? substr(trim((string) file_get_contents($this->revisionFile)), 0, 12) : null;

        return new JsonResponse(['ok' => $db, 'service' => 'rpw-symfony', 'db' => $db, 'rev' => $rev, 'time' => gmdate(\DATE_ATOM)], $db ? 200 : 503);
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
