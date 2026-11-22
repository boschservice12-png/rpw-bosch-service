<?php

declare(strict_types=1);

namespace App\Security;

use App\Infrastructure\Storage\ObjectStore;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * 2. RÉTEG — BIZTONSÁGI FEJLÉCEK minden válaszon, a szerver saját maga adja
 * (nem a hostingtól függ). A netlify.toml fejléceinek utódja, SZIGORÚBB CSP-vel:
 * az új backenden a böngésző kizárólag a saját szerverrel beszél — nincs
 * Supabase, nincs Anthropic, nincs CDN (a könyvtárak helyi másolatból jönnek).
 *
 * ⚠ 'unsafe-inline' a script-src-ben MARAD (ismert kockázat, REMAINING-RISKS 4):
 * a felület több száz inline kezelőt használ. Ezért a többi irányelv szűk.
 */
final class SecurityHeadersSubscriber implements EventSubscriberInterface
{
    public const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        ."font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' blob:; "
        ."object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; frame-src 'none'; worker-src 'self'; manifest-src 'self'";

    private const DATA_PATHS = ['/api', '/rest/', '/functions/', '/storage/', '/.netlify/'];

    /** Objektumtár módban a böngésző a fotókat közvetlenül a tárból tölti és oda tölt fel — CSAK ezt az egy eredetet engedjük. */
    public function __construct(private readonly ?ObjectStore $objects = null)
    {
    }

    public function csp(): string
    {
        $o = $this->objects?->browserOrigin();
        if ($o === null || preg_match('#^https://[a-z0-9.-]+(:\d+)?$#', $o) !== 1) {
            return self::CSP;
        }

        return str_replace(["img-src 'self' data: blob:;", "connect-src 'self';"], ["img-src 'self' data: blob: $o;", "connect-src 'self' $o;"], self::CSP);
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::RESPONSE => ['onResponse', -10]];
    }

    public function onResponse(ResponseEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }
        $req = $event->getRequest();
        $h = $event->getResponse()->headers;
        $h->set('X-Content-Type-Options', 'nosniff');
        $h->set('X-Frame-Options', 'DENY');
        $h->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $h->set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
        $h->set('Cross-Origin-Opener-Policy', 'same-origin');
        $h->set('Cross-Origin-Resource-Policy', 'same-origin');
        if (!$h->has('Content-Security-Policy')) {          // a fájlkiszolgálás a saját, szigorúbb CSP-jét adja
            $h->set('Content-Security-Policy', $this->csp());
        }
        if ($req->isSecure()) {
            $h->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }
        $path = $req->getPathInfo();
        foreach (self::DATA_PATHS as $p) {
            if (str_starts_with($path, $p)) {
                // adat (munkák, tokenek, fotók): sem a böngésző, sem proxy nem tárolhatja
                if (!str_starts_with($path, '/storage/')) {
                    $h->set('Cache-Control', 'no-store');
                }
                break;
            }
        }
        $h->remove('X-Powered-By');
    }
}
