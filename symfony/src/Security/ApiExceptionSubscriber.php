<?php

declare(strict_types=1);

namespace App\Security;

use App\Application\ApiError;
use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\Security\Core\Exception\AccessDeniedException;

/**
 * Egységes JSON-hibaválasz az /api alatt: {ok:false, error, message}.
 * Váratlan hibánál a részletek a naplóba mennek, NEM a kliensnek.
 */
final class ApiExceptionSubscriber implements EventSubscriberInterface
{
    public function __construct(private readonly LoggerInterface $logger, private readonly Security $security)
    {
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::EXCEPTION => ['onException', 10]];
    }

    public function onException(ExceptionEvent $event): void
    {
        if (!str_starts_with($event->getRequest()->getPathInfo(), '/api')) {
            return;
        }
        $e = $event->getThrowable();
        if ($e instanceof ApiError) {
            $event->setResponse(new JsonResponse($e->toArray(), $e->getCode()));

            return;
        }
        if ($e instanceof AccessDeniedException || $e instanceof AccessDeniedHttpException) {
            // token nélkül: 401 (jelentkezz be); bejelentkezve: 403 (nincs jogod)
            $err = $this->security->getUser() === null ? new ApiError('unauthorized') : new ApiError('not_allowed');
            $event->setResponse(new JsonResponse($err->toArray(), $err->getCode()));

            return;
        }
        if ($e instanceof HttpExceptionInterface) {
            $code = $e->getStatusCode() === 404 ? 'not_found' : 'bad_request';
            $event->setResponse(new JsonResponse((new ApiError($code, [], $e->getStatusCode()))->toArray(), $e->getStatusCode()));

            return;
        }
        $ref = bin2hex(random_bytes(4));
        $this->logger->error('RPW API hiba {ref}: {msg}', ['ref' => $ref, 'msg' => $e->getMessage(), 'exception' => $e]);
        $event->setResponse(new JsonResponse(['ok' => false, 'error' => 'server_error', 'message' => 'Eroare internă. Cod: '.$ref, 'ref' => $ref], 500));
    }
}
