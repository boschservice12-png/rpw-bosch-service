<?php

declare(strict_types=1);

namespace App\Security;

use App\Application\SecurityLog;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * 2. RÉTEG — EREDET-ŐR. Író kérés (POST/PUT/PATCH/DELETE) az adat-útvonalakon
 * csak a saját oldalról, vagy a kifejezetten engedélyezett eredetről jöhet
 * (RPW_ALLOWED_ORIGINS, vesszővel). Origin nélküli kérés (szerver, curl) átmegy —
 * azt a token-hitelesítés dönti el. A CORS nem jogosultság; ez sem az: ez a
 * böngészős visszaélés (idegen oldalról indított írás) elleni plusz réteg.
 */
final class OriginGuardSubscriber implements EventSubscriberInterface
{
    private const WRITE = ['POST', 'PUT', 'PATCH', 'DELETE'];
    private const DATA_PATHS = ['/api', '/rest/', '/functions/', '/storage/', '/.netlify/'];

    public function __construct(
        private readonly SecurityLog $log,
        #[Autowire('%env(default::RPW_ALLOWED_ORIGINS)%')] private readonly ?string $allowed = null,
    ) {
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::REQUEST => ['onRequest', 100]];
    }

    public function onRequest(RequestEvent $event): void
    {
        $r = $event->getRequest();
        if (!$event->isMainRequest() || !\in_array($r->getMethod(), self::WRITE, true)) {
            return;
        }
        $path = $r->getPathInfo();
        $data = false;
        foreach (self::DATA_PATHS as $p) {
            $data = $data || str_starts_with($path, $p);
        }
        $origin = $r->headers->get('Origin');
        if (!$data || $origin === null || $origin === '') {
            return;
        }
        $ok = array_filter(array_map('trim', explode(',', (string) $this->allowed)));
        $ok[] = $r->getSchemeAndHttpHost();
        if (\in_array(rtrim($origin, '/'), $ok, true)) {
            return;
        }
        $this->log->event('origin_blocked', ['origin' => mb_substr($origin, 0, 200), 'path' => $path]);
        $event->setResponse(new JsonResponse(['ok' => false, 'error' => 'origin', 'message' => 'Origine nepermisă.'], 403));
    }
}
