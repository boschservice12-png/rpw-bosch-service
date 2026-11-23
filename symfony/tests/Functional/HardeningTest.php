<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Command\SeedShopCommand;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;

/** 2026-11-23 (AUDIT-SYMFONY-LOCALHOST §3–5): PIN oracle, client link on closed jobs, demo seeding, known PINs. */
final class HardeningTest extends ApiTestCase
{
    private const J = 'RPW-11111111-2222-3333-4444-555555555555';

    private function rpc(string $fn, array $args): array
    {
        $this->client->request('POST', '/rest/v1/rpc/'.$fn, [], [], ['CONTENT_TYPE' => 'application/json'], json_encode($args));

        return json_decode((string) $this->client->getResponse()->getContent(), true) ?? [];
    }

    private function job(string $shop, array $data): void
    {
        $this->db->insert('rpw_jobs', ['id' => self::J, 'shop_id' => $shop, 'data' => json_encode($data), 'version' => 1]);
    }

    private function command(string $name): CommandTester
    {
        return new CommandTester((new Application(static::$kernel))->find($name));
    }

    public function testClientLinkCannotTouchAClosedJob(): void
    {
        [$s] = $this->shop('A', ['admin' => ['Ana', '4826']]);
        $this->job($s, ['inchis' => true, 'dosarActe' => ['talon' => [['path' => self::J.'/acta_talon_1.jpg', 'src' => 'staff']]]]);
        $r = $this->rpc('rpw_client_upload', ['p_job_id' => self::J, 'p_patch' => ['clientGata' => ['at' => 'x', 'files' => 1]]]);
        self::assertSame('closed', $r['error'] ?? null);
        self::assertSame(1, (int) $this->db->fetchOne('SELECT version FROM rpw_jobs WHERE id = ?', [self::J]));
        $svc = static::getContainer()->get(\App\Application\ClientUploadService::class);
        self::assertNull($svc->openJobShop(self::J), 'the storage gateway refuses client-sign on a closed job');
    }

    public function testClientLinkKeepsTheStaffDocuments(): void
    {
        [$s] = $this->shop('A', ['admin' => ['Ana', '4826']]);
        $staff = ['path' => self::J.'/acta_talon_1.jpg', 'src' => 'staff'];
        $this->job($s, ['dosarActe' => ['talon' => [$staff]]]);
        $r = $this->rpc('rpw_client_upload', ['p_job_id' => self::J, 'p_patch' => ['dosarActe' => ['talon' => []]]]);
        self::assertTrue($r['ok'] ?? false, json_encode($r));
        $d = json_decode((string) $this->db->fetchOne('SELECT data FROM rpw_jobs WHERE id = ?', [self::J]), true);
        self::assertSame([$staff], $d['dosarActe']['talon'], 'an empty slot from the client deletes nothing of the staff');
        self::assertNotNull(static::getContainer()->get(\App\Application\ClientUploadService::class)->openJobShop(self::J));
    }

    public function testDemoSeedingNeedsExplicitOptIn(): void
    {
        $old = $_SERVER['RPW_DEMO'] ?? null;
        unset($_SERVER['RPW_DEMO']);
        putenv('RPW_DEMO');
        try {
            $t = $this->command('rpw:shop:seed');
            self::assertNotSame(0, $t->execute(['shop' => 'X', 'admin' => 'Ana', 'pin' => '7391', '--demo' => true]));
            self::assertSame(0, (int) $this->db->fetchOne('SELECT COUNT(*) FROM rpw_employees'), 'nothing written without RPW_DEMO=1');
            $_SERVER['RPW_DEMO'] = '1';
            self::assertSame(0, $this->command('rpw:shop:seed')->execute(['shop' => 'X', 'admin' => 'Ana', 'pin' => '7391', '--demo' => true]));
            self::assertGreaterThan(1, (int) $this->db->fetchOne('SELECT COUNT(*) FROM rpw_employees'));
        } finally {
            if ($old === null) {
                unset($_SERVER['RPW_DEMO']);
            } else {
                $_SERVER['RPW_DEMO'] = $old;
            }
        }
    }

    public function testSecurityCheckFlagsPinsWrittenInTheSource(): void
    {
        $this->shop('A', ['admin' => ['Ana', SeedShopCommand::FIRST_ADMIN_PIN]]);
        $t = $this->command('rpw:security:check');
        $t->execute([]);
        self::assertStringContainsString('forráskódban szereplő PIN-nel', $t->getDisplay());
        $this->db->executeStatement('UPDATE rpw_employees SET pin_hash = ?', [password_hash('7391', \PASSWORD_BCRYPT, ['cost' => 4])]);
        $t->execute([]);
        self::assertStringContainsString('nincs a forráskódban szereplő', $t->getDisplay());
    }
}
