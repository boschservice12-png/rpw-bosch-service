<?php

declare(strict_types=1);

namespace App\Domain\Auth;

/**
 * A bejelentkezett ember — a régi rpw__ctx() eredményének megfelelője.
 * A jogosultság KAPCSOLÓKBÓL jön (rpw_roles.can), nem a szerepkör nevéből.
 */
final class Actor
{
    /** Az ismert kapcsolók. Ismeretlen kapcsoló sosem ad jogot. */
    public const CAPS = ['open', 'reception', 'work', 'close', 'override', 'delete', 'team', 'posts'];

    /** @param array<string,bool> $can */
    public function __construct(
        public readonly string $id,
        public readonly string $name,
        public readonly string $shopId,
        public readonly ?string $roleCode,
        public readonly array $can,
    ) {
    }

    public function can(string $cap): bool
    {
        return \in_array($cap, self::CAPS, true) && ($this->can[$cap] ?? false) === true;
    }

    public function toArray(): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'shop_id' => $this->shopId,
            'role_code' => $this->roleCode, 'can' => (object) $this->can];
    }

    /** rpw_roles.can JSON → szigorú bool-térkép (a "true" szöveg is igaz, minden más hamis). */
    public static function normalizeCaps(mixed $raw): array
    {
        if (\is_string($raw)) {
            $raw = json_decode($raw, true) ?: [];
        }
        $out = [];
        foreach (\is_array($raw) ? $raw : [] as $k => $v) {
            if (\in_array($k, self::CAPS, true)) {
                $out[$k] = $v === true || $v === 'true' || $v === 1 || $v === '1';
            }
        }

        return $out;
    }
}
