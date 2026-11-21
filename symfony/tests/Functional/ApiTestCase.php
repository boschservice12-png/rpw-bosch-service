<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Command\SeedShopCommand;
use App\Infrastructure\Db\RpwSchema;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\ParameterType;
use Doctrine\DBAL\Types\Types;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Uid\Uuid;

abstract class ApiTestCase extends WebTestCase
{
    protected KernelBrowser $client;
    protected Connection $db;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $this->db = static::getContainer()->get(Connection::class);
        // RPW_TEST_EXISTING_SCHEMA=1: a régi rendszer VALÓDI sémáján fut (a _migrations/001–018
        // eredménye) — ez igazolja, hogy a két rendszer egy adatbázison párhuzamosan üzemelhet.
        if (($_SERVER['RPW_TEST_EXISTING_SCHEMA'] ?? getenv('RPW_TEST_EXISTING_SCHEMA')) === '1') {
            $this->db->executeStatement('TRUNCATE shops, rpw_audit, rpw_job_counters, rpw_pin_attempt, rpw_pin_log, rpw_jobs, rpw_sessions, rpw_employees, rpw_roles CASCADE');

            return;
        }
        foreach (RpwSchema::tables() as $t) {
            $this->db->executeStatement('DROP TABLE IF EXISTS '.$t->getObjectName()->getUnqualifiedName()->getValue());
        }
        RpwSchema::createMissing($this->db);
    }

    /** Szerviz a mai szerepkörökkel; visszaadja: [shopId, [szerep => employeeId]] */
    protected function shop(string $name, array $people): array
    {
        $shop = Uuid::v4()->toRfc4122();
        $this->db->insert('shops', ['id' => $shop, 'name' => $name]);
        foreach (SeedShopCommand::ROLES as $code => [$label, $can]) {
            $this->db->insert('rpw_roles', ['id' => Uuid::v4()->toRfc4122(), 'shop_id' => $shop, 'code' => $code, 'label' => $label,
                'can' => (object) $can, 'sort_order' => 1, 'active' => true], ['can' => Types::JSON, 'active' => ParameterType::BOOLEAN]);
        }
        $ids = [];
        foreach ($people as $role => [$person, $pin]) {
            $ids[$role] = Uuid::v4()->toRfc4122();
            $this->db->insert('rpw_employees', ['id' => $ids[$role], 'shop_id' => $shop, 'name' => $person, 'role_code' => $role,
                'pin_hash' => password_hash($pin, \PASSWORD_BCRYPT, ['cost' => 4]), 'active' => true], ['active' => ParameterType::BOOLEAN]);
        }

        return [$shop, $ids];
    }

    protected function call(string $method, string $uri, ?array $body = null, ?string $token = null): array
    {
        $headers = ['CONTENT_TYPE' => 'application/json'];
        if ($token !== null) {
            $headers['HTTP_AUTHORIZATION'] = 'Bearer '.$token;
        }
        $this->client->request($method, $uri, [], [], $headers, $body === null ? '' : json_encode($body));
        $res = json_decode((string) $this->client->getResponse()->getContent(), true);
        $res['_status'] = $this->client->getResponse()->getStatusCode();

        return $res;
    }

    protected function login(string $shop, string $employee, string $pin): string
    {
        $r = $this->call('POST', '/api/login', ['shop_id' => $shop, 'employee_id' => $employee, 'pin' => $pin]);
        self::assertTrue($r['ok'] ?? false, json_encode($r));

        return $r['token'];
    }
}
