<?php

declare(strict_types=1);

namespace App\Infrastructure\Mail;

use Psr\Log\LoggerInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Levélküldés a Resend API-n (a functions/sendmail.js utódja), ugyanazokkal a
 * korlátokkal: 1–5 címzett, max 10 melléklet / 10 MB, csak pdf/jpg/png, a
 * fejlécbe nem juthat sortörés. A szolgáltató hibarészlete nem szivárog ki.
 */
final class ResendMailer
{
    public const MAX_RECIPIENTS = 5;
    public const MAX_ATTACH = 10;
    public const MAX_ATTACH_TOTAL = 10 * 1024 * 1024;
    private const EMAIL_RE = '/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/';
    private const EXT = ['pdf', 'jpg', 'jpeg', 'png'];

    public function __construct(
        private readonly HttpClientInterface $http,
        private readonly LoggerInterface $logger,
        private readonly ?string $apiKey = null,
        private readonly string $from = 'dosar@redassistance.com',
    ) {
    }

    public static function validEmail(mixed $e): bool
    {
        return \is_string($e) && preg_match(self::EMAIL_RE, trim($e)) === 1;
    }

    /** @return array{status:int, body:array, recipients?:int} */
    public function send(array $p): array
    {
        if ($this->apiKey === null || $this->apiKey === '') {
            return ['status' => 503, 'body' => ['error' => 'Trimiterea e-mail nu este configurată pe server.', 'code' => 'not_configured']];
        }
        if (empty($p['to']) || empty($p['subject'])) {
            return ['status' => 400, 'body' => ['error' => 'to + subject obligatoriu']];
        }
        $to = array_values(array_filter(array_map(static fn ($x) => trim((string) $x), \is_array($p['to']) ? $p['to'] : [$p['to']])));
        if ($to === [] || \count($to) > self::MAX_RECIPIENTS) {
            return ['status' => 400, 'body' => ['error' => 'Număr destinatari invalid (1–'.self::MAX_RECIPIENTS.')']];
        }
        foreach ($to as $t) {
            if (!self::validEmail($t)) {
                return ['status' => 400, 'body' => ['error' => 'Adresă destinatar invalidă']];
            }
        }
        $fromName = trim(preg_replace('/[<>"\r\n]/', '', (string) ($p['from_name'] ?? 'RedAssistance')) ?? '') ?: 'RedAssistance';
        $payload = ['from' => $fromName.' <'.$this->from.'>', 'to' => $to,
            'subject' => mb_substr(preg_replace('/[\r\n]/', ' ', (string) $p['subject']) ?? '', 0, 200)];
        if (!empty($p['reply_to'])) {
            $rt = trim(preg_replace('/[\r\n<>]/', '', (string) $p['reply_to']) ?? '');
            if (self::validEmail($rt)) {
                $payload['reply_to'] = $rt;
            }
        }
        if (isset($p['html'])) {
            $payload['html'] = (string) $p['html'];
        }
        if (isset($p['text'])) {
            $payload['text'] = (string) $p['text'];
        }
        if (!isset($payload['html']) && !isset($payload['text'])) {
            $payload['text'] = ' ';
        }
        if (\is_array($p['attachments'] ?? null) && $p['attachments'] !== []) {
            if (\count($p['attachments']) > self::MAX_ATTACH) {
                return ['status' => 400, 'body' => ['error' => 'Prea multe atașamente (max '.self::MAX_ATTACH.')']];
            }
            $total = 0;
            foreach ($p['attachments'] as $a) {
                $name = \is_array($a) ? substr(preg_replace('/[^A-Za-z0-9._-]/', '_', preg_replace('/[\\\\\/\r\n\0]/', '', (string) ($a['filename'] ?? '')) ?? '') ?? '', 0, 120) : '';
                $ext = strtolower(pathinfo($name, \PATHINFO_EXTENSION));
                if ($name === '' || !\in_array($ext, self::EXT, true) || !\is_string($a['content'] ?? null) || $a['content'] === '') {
                    return ['status' => 400, 'body' => ['error' => 'Atașament invalid (doar pdf/jpg/png)']];
                }
                $total += \strlen($a['content']);
                if ($total > self::MAX_ATTACH_TOTAL) {
                    return ['status' => 413, 'body' => ['error' => 'Atașamente prea mari']];
                }
                $payload['attachments'][] = ['filename' => $name, 'content' => $a['content']];
            }
        }
        try {
            $r = $this->http->request('POST', 'https://api.resend.com/emails', [
                'headers' => ['Authorization' => 'Bearer '.$this->apiKey], 'json' => $payload, 'timeout' => 30]);
            $status = $r->getStatusCode();
            $data = $r->toArray(false);
        } catch (\Throwable $e) {
            $this->logger->error('Resend: kivétel', ['msg' => $e->getMessage()]);

            return ['status' => 502, 'body' => ['error' => 'Trimitere eșuată']];
        }
        if ($status >= 300) {
            $this->logger->error('Resend: hiba', ['status' => $status]);

            return ['status' => 502, 'body' => ['error' => 'Trimitere eșuată']];
        }

        return ['status' => 200, 'body' => ['ok' => true, 'id' => $data['id'] ?? null], 'recipients' => \count($to)];
    }
}
