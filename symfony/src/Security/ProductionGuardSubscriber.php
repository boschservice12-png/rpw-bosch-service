<?php

declare(strict_types=1);

namespace App\Security;

use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * 4. RÉTEG — ÉLESBEN FAIL-CLOSED. Ha éles környezetben gyenge / alapértelmezett
 * az APP_SECRET, vagy be van kapcsolva a hibakereső mód, a szerver SEMMIT nem
 * szolgál ki (503), csak naplóz. Jobb, ha áll, mint ha hamisítható fotó-linkkel
 * vagy kiszivárgó hibarészletekkel fut.
 */
final class ProductionGuardSubscriber implements EventSubscriberInterface
{
    public function __construct(
        private readonly LoggerInterface $logger,
        #[Autowire('%kernel.environment%')] private readonly string $env,
        #[Autowire('%kernel.debug%')] private readonly bool $debug,
        #[Autowire('%env(default::APP_SECRET)%')] private readonly ?string $secret = null,
    ) {
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::REQUEST => ['onRequest', 2048]];
    }

    public static function problems(string $env, bool $debug, ?string $secret): array
    {
        if ($env !== 'prod') {
            return [];
        }
        $p = [];
        if (SecretPolicy::weak($secret)) {
            $p[] = 'APP_SECRET gyenge vagy alapértelmezett';
        }
        if ($debug) {
            $p[] = 'APP_DEBUG be van kapcsolva éles környezetben';
        }

        return $p;
    }

    public function onRequest(RequestEvent $event): void
    {
        $p = self::problems($this->env, $this->debug, $this->secret);
        if ($p === [] || !$event->isMainRequest()) {
            return;
        }
        $this->logger->critical('RPW éles kapu: a szerver nem indul', ['problems' => $p]);
        $event->setResponse(new Response('Serviciu indisponibil — configurare de securitate incompletă.', 503, ['Content-Type' => 'text/plain; charset=utf-8']));
    }
}
