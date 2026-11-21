<?php

declare(strict_types=1);

namespace App\Security;

/** Az APP_SECRET-ből készül a fotók aláírt URL-je: kitalálható titok = hamisítható link. */
final class SecretPolicy
{
    public const PLACEHOLDERS = ['', 'change-me-in-env-local', 'dev-only-not-a-secret', 'test-secret-not-for-production', 'ThisTokenIsNotSoSecretChangeIt'];

    public static function weak(?string $secret): bool
    {
        $s = (string) $secret;

        return \in_array($s, self::PLACEHOLDERS, true) || \strlen($s) < 32 || \count(array_unique(str_split($s))) < 10;
    }
}
