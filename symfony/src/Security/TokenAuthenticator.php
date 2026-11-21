<?php

declare(strict_types=1);

namespace App\Security;

use App\Application\ApiError;
use App\Application\AuthService;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAuthenticationException;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;
use Symfony\Component\Security\Http\EntryPoint\AuthenticationEntryPointInterface;

/** `Authorization: Bearer <token>` → ActorUser. Állapotmentes: nincs süti, nincs PHP-session. */
final class TokenAuthenticator extends AbstractAuthenticator implements AuthenticationEntryPointInterface
{
    public function __construct(private readonly AuthService $auth)
    {
    }

    public static function bearer(Request $request): ?string
    {
        $h = (string) $request->headers->get('Authorization', '');

        return preg_match('/^Bearer\s+([A-Za-z0-9]{32,256})$/', $h, $m) === 1 ? $m[1] : null;
    }

    public function supports(Request $request): ?bool
    {
        return $request->headers->has('Authorization');
    }

    public function authenticate(Request $request): SelfValidatingPassport
    {
        $token = self::bearer($request);
        $actor = $this->auth->actorFromToken($token);
        if ($actor === null) {
            throw new CustomUserMessageAuthenticationException('unauthorized');
        }

        return new SelfValidatingPassport(new UserBadge($actor->id, static fn () => new ActorUser($actor, (string) $token)));
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token, string $firewallName): ?Response
    {
        return null;
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): Response
    {
        return new JsonResponse((new ApiError('unauthorized'))->toArray(), 401);
    }

    public function start(Request $request, ?AuthenticationException $authException = null): Response
    {
        return new JsonResponse((new ApiError('unauthorized'))->toArray(), 401);
    }
}
