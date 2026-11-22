<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Command\DbCheckCommand;
use App\Controller\JsonInput;
use Symfony\Component\Console\Tester\CommandTester;

/** Méretkorlátok: a túl nagy mentés érthető hibát ad; a db:check átállás előtt jelzi a nem menthető munkát. */
final class SizeLimitsTest extends ApiTestCase
{
    public function testOversizedSaveIsClear413(): void
    {
        $this->client->request('POST', '/rest/v1/rpc/rpw_patch_v3', [], [], ['CONTENT_TYPE' => 'application/json'],
            json_encode(['p_id' => 'RPW-x', 'p_patch' => ['x' => str_repeat('A', JsonInput::MAX_BYTES)]]));
        self::assertSame(413, $this->client->getResponse()->getStatusCode());
        $b = json_decode((string) $this->client->getResponse()->getContent(), true);
        self::assertSame('payload_too_large', $b['error']);
        self::assertStringContainsString('max. 2 MB', $b['message'], 'román, érthető üzenet');
    }

    public function testDbCheckFlagsJobsThatCannotBeSaved(): void
    {
        [$s] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $this->db->insert('rpw_jobs', ['id' => 'RPW-kicsi', 'shop_id' => $s, 'data' => '{"a":1}', 'version' => 1]);
        $t = new CommandTester(new DbCheckCommand($this->db));
        self::assertSame(0, $t->execute([]));

        $this->db->insert('rpw_jobs', ['id' => 'RPW-nagy', 'shop_id' => $s, 'data' => json_encode(['reconstPhotos' => [['data' => str_repeat('A', 1_900_000)]]]), 'version' => 1]);
        self::assertSame(1, $t->execute([]), 'túl nagy munka → a kapu zárva');
        self::assertStringContainsString('RPW-nagy', $t->getDisplay());
        self::assertStringNotContainsString('RPW-kicsi', $t->getDisplay());
    }
}
