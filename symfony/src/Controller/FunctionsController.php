<?php

declare(strict_types=1);

namespace App\Controller;

use App\Application\AuditLog;
use App\Application\AuthService;
use App\Application\DocumentAi;
use App\Infrastructure\Json;
use App\Infrastructure\Mail\ResendMailer;
use App\Security\TokenAuthenticator;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactoryInterface;
use Symfony\Component\Routing\Attribute\Route;

/**
 * A régi Netlify-függvények UGYANAZON a címen (a felület változatlanul hívja):
 *   POST /.netlify/functions/ocr       {image, type}     → {result, fields, uncertain, …}
 *   POST /.netlify/functions/classify  {image}           → {type, confidence, label}
 *   POST /.netlify/functions/sendmail  {to, subject, …}  → {ok, id}
 * Mindhárom KÖTELEZŐEN belépett dolgozót kér (Bearer token), IP-fékkel.
 */
final class FunctionsController
{
    public const MAX_BODY = 12 * 1024 * 1024;

    public function __construct(
        private readonly AuthService $auth,
        private readonly DocumentAi $ai,
        private readonly ResendMailer $mailer,
        private readonly AuditLog $audit,
    ) {
    }

    #[Route('/.netlify/functions/{name}', name: 'functions', methods: ['POST', 'OPTIONS'], requirements: ['name' => 'ocr|classify|sendmail'])]
    public function call(string $name, Request $r, RateLimiterFactoryInterface $aiLimiter, RateLimiterFactoryInterface $mailLimiter): JsonResponse
    {
        if ($r->getMethod() === 'OPTIONS') {
            return new JsonResponse(null, 204);
        }
        if (\strlen($r->getContent()) > self::MAX_BODY) {
            return new JsonResponse(['error' => 'Payload prea mare'], 413);
        }
        $limiter = $name === 'sendmail' ? $mailLimiter : $aiLimiter;
        if (!$limiter->create($r->getClientIp() ?? 'x')->consume()->isAccepted()) {
            return new JsonResponse(['error' => 'Prea multe cereri'], 429);
        }
        $actor = $this->auth->actorFromToken(TokenAuthenticator::bearer($r));
        if ($actor === null) {
            return new JsonResponse(['error' => 'Autentificare necesară'], 401);
        }
        try {
            $body = $r->getContent() === '' ? [] : Json::decode($r->getContent(), 32);
        } catch (\JsonException) {
            return new JsonResponse(['error' => 'Invalid JSON body'], 400);
        }
        if (!\is_array($body)) {
            return new JsonResponse(['error' => 'Invalid JSON body'], 400);
        }

        $res = match ($name) {
            'ocr' => $this->ai->ocr($body['image'] ?? null, $body['type'] ?? null),
            'classify' => $this->ai->classify($body['image'] ?? null),
            'sendmail' => $this->mailer->send($body),
        };
        // napló: ki, mit, sikerült-e — tartalom (kép, levélszöveg) NÉLKÜL
        $this->audit->write($actor->shopId, null, $actor->name, 'fn:'.$name.($res['status'] === 200 ? '' : ':failed'), null,
            array_filter(['type' => \is_string($body['type'] ?? null) ? $body['type'] : null, 'status' => $res['status'],
                'recipients' => $res['recipients'] ?? null, 'code' => $res['body']['code'] ?? null], static fn ($v) => $v !== null));

        return new JsonResponse($res['body'], $res['status']);
    }
}
