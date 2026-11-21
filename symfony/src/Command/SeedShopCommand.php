<?php

declare(strict_types=1);

namespace App\Command;

use App\Domain\Auth\PinPolicy;
use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Uid\Uuid;

/**
 * Új szerviz alapbeállítása: szerepkörök a mai jogosultsági modellel +
 * egy irodavezető (minden kapcsoló) a megadott PIN-nel.
 */
#[AsCommand(name: 'rpw:shop:seed', description: 'Új szerviz: szerepkörök + első admin dolgozó')]
final class SeedShopCommand extends Command
{
    public const ROLES = [
        'admin' => ['Irodavezető', ['open' => true, 'reception' => true, 'work' => true, 'close' => true, 'override' => true, 'delete' => true, 'team' => true, 'posts' => true]],
        'manager' => ['Műszakvezető', ['open' => true, 'reception' => true, 'work' => true, 'close' => true, 'override' => true, 'team' => true]],
        'receptie' => ['Recepció', ['open' => true, 'reception' => true]],
        'evaluator' => ['Evaluator', ['work' => true]],
        'tinichigiu' => ['Karosszéria', ['work' => true]],
        'vopsitor' => ['Festő', ['work' => true]],
        'control' => ['Control', ['work' => true, 'close' => true]],
        'auditor' => ['Szerelő (csak olvasás)', []],
    ];

    public function __construct(private readonly Connection $db)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('shop', InputArgument::REQUIRED, 'Szerviz neve')
            ->addArgument('admin', InputArgument::REQUIRED, 'Az első admin neve')
            ->addArgument('pin', InputArgument::REQUIRED, 'Az admin PIN-je');
    }

    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        $pin = (string) $in->getArgument('pin');
        if (($err = PinPolicy::validate($pin)) !== null) {
            $out->writeln('<error>PIN elutasítva: '.$err.'</error>');

            return Command::FAILURE;
        }
        $shop = Uuid::v4()->toRfc4122();
        $this->db->transactional(function () use ($shop, $in, $pin) {
            $this->db->insert('shops', ['id' => $shop, 'name' => $in->getArgument('shop'), 'created_at' => gmdate('Y-m-d H:i:sP')]);
            $i = 0;
            foreach (self::ROLES as $code => [$label, $can]) {
                $this->db->insert('rpw_roles', ['id' => Uuid::v4()->toRfc4122(), 'shop_id' => $shop, 'code' => $code, 'label' => $label,
                    'can' => (object) $can, 'sort_order' => ++$i * 10, 'active' => true], ['can' => \Doctrine\DBAL\Types\Types::JSON, 'active' => \Doctrine\DBAL\ParameterType::BOOLEAN]);
            }
            $this->db->insert('rpw_employees', ['id' => Uuid::v4()->toRfc4122(), 'shop_id' => $shop, 'name' => $in->getArgument('admin'),
                'role_code' => 'admin', 'pin_hash' => '$2a$'.substr(password_hash($pin, \PASSWORD_BCRYPT), 4), 'active' => true],
                ['active' => \Doctrine\DBAL\ParameterType::BOOLEAN]);
        });
        $out->writeln('Szerviz létrehozva. shop_id: '.$shop);

        return Command::SUCCESS;
    }
}
