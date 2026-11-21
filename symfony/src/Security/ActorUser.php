<?php

declare(strict_types=1);

namespace App\Security;

use App\Domain\Auth\Actor;
use Symfony\Component\Security\Core\User\UserInterface;

/** Symfony-felhasználó, amely a domain Actor-t hordozza. */
final class ActorUser implements UserInterface
{
    public function __construct(public readonly Actor $actor, public readonly string $token)
    {
    }

    public function getRoles(): array
    {
        $roles = ['ROLE_USER'];
        foreach ($this->actor->can as $cap => $on) {
            if ($on) {
                $roles[] = 'ROLE_CAN_'.strtoupper($cap);
            }
        }

        return $roles;
    }

    public function eraseCredentials(): void
    {
    }

    public function getUserIdentifier(): string
    {
        return $this->actor->id;
    }
}
