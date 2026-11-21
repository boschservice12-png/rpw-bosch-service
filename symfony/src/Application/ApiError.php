<?php

declare(strict_types=1);

namespace App\Application;

use App\Domain\Workflow\Messages;

/** Stabil hibakód + HTTP-státusz + részletek. A válasz alakja: {ok:false, error, message, ...}. */
final class ApiError extends \RuntimeException
{
    private const STATUS = [
        'unauthorized' => 401, 'not_allowed' => 403, 'not_found' => 404, 'version_conflict' => 409,
        'locked' => 429, 'bad_pin' => 401, 'already_trashed' => 409, 'already_done' => 409,
    ];

    public function __construct(public readonly string $errorCode, public readonly array $details = [], ?int $status = null)
    {
        parent::__construct(Messages::server($errorCode), $status ?? (self::STATUS[$errorCode] ?? 422));
    }

    public function toArray(): array
    {
        return ['ok' => false, 'error' => $this->errorCode, 'message' => $this->getMessage()] + $this->details;
    }
}
