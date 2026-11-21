<?php

declare(strict_types=1);

namespace App\Application;

use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Target;
use Symfony\Component\HttpFoundation\RequestStack;

/**
 * 3/5. RÉTEG — BIZTONSÁGI ESEMÉNYNAPLÓ. Minden esemény két helyre megy:
 *  · rpw_audit (`sec:<esemény>`) — a szervizhez kötve, a felületen visszakereshető
 *  · var/log/security.log (JSON-sor, IP-vel) — ezt olvassa a fail2ban, és ide
 *    köthető riasztás. PIN, token, dokumentumtartalom SOHA nem kerül bele.
 */
final class SecurityLog
{
    public function __construct(
        private readonly AuditLog $audit,
        private readonly RequestStack $requests,
        #[Target('rpw_security')] private readonly LoggerInterface $logger,
    ) {
    }

    public function event(string $event, array $ctx = [], ?string $shopId = null, ?string $actor = null): void
    {
        $r = $this->requests->getMainRequest();
        $line = ['event' => $event, 'ip' => $r?->getClientIp(), 'ua' => mb_substr((string) $r?->headers->get('User-Agent'), 0, 160),
            'shop' => $shopId, 'actor' => $actor] + $ctx;
        $level = \in_array($event, ['login_ok', 'logout', 'pin_set'], true) ? 'info' : 'warning';
        $this->logger->log($level, 'rpw.security '.$event, $line);
        if ($shopId !== null) {
            try {
                $this->audit->write($shopId, null, $actor, 'sec:'.$event, null, array_filter(['ip' => $line['ip']] + $ctx, static fn ($v) => $v !== null));
            } catch (\Throwable) {
                // a napló hibája nem akaszthatja meg a belépést; a fájlnaplóban benne van
            }
        }
    }
}
