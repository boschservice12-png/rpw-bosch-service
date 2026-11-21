<?php

declare(strict_types=1);

namespace App\Domain\Workflow;

/** Elutasított átmenet: stabil hibakód + részletek (a régi rpw__deny mintája). */
final class TransitionDenied extends \DomainException
{
    public function __construct(public readonly string $errorCode, public readonly array $details = [])
    {
        parent::__construct(Messages::server($errorCode));
    }
}
