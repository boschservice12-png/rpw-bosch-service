<?php

declare(strict_types=1);

namespace App\Command;

use App\Domain\Auth\PinPolicy;
use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
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
        'manager' => ['Műszakvezető', ['open' => true, 'reception' => true, 'work' => true, 'close' => true, 'override' => true, 'team' => true, 'posts' => true]],
        'receptie' => ['Recepció', ['open' => true, 'reception' => true]],
        // A feliratok a kliens RPWRoles.EMPLOYEE_ROLE_MAP kulcsai — ezekből lesz a felületi szerep.
        'tinichigiu' => ['Karosszéria', ['work' => true]],
        'vopsitor' => ['Festő', ['work' => true]],
        'auditor' => ['Szerelő', []],
    ];

    /** Mintacsapat CSAK helyi próbához — éles szervizben ne használd. */
    public const DEMO = [
        ['Rita Recepție', 'receptie', '5937'],
        ['Mihai Műszakvezető', 'manager', '6148'],
        ['Lajos Lakatos', 'tinichigiu', '7259'],
        ['Vasile Festő', 'vopsitor', '8361'],
        ['Sanyi Szerelő', 'auditor', '9472'],
    ];

    public function __construct(private readonly Connection $db)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('shop', InputArgument::REQUIRED, 'Szerviz neve')
            ->addArgument('admin', InputArgument::REQUIRED, 'Az első admin neve')
            ->addArgument('pin', InputArgument::REQUIRED, 'Az admin PIN-je')
            ->addOption('id', null, InputOption::VALUE_REQUIRED, 'Rögzített shop_id (UUID); alapból új')
            ->addOption('demo', null, InputOption::VALUE_NONE, 'Mintacsapat is (recepció, lakatos, festő, műszakvezető, szerelő) a kiírt PIN-ekkel');
    }

    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        $pin = (string) $in->getArgument('pin');
        if (($err = PinPolicy::validate($pin)) !== null) {
            $out->writeln('<error>PIN elutasítva: '.$err.'</error>');

            return Command::FAILURE;
        }
        $shop = (string) ($in->getOption('id') ?? Uuid::v4()->toRfc4122());
        if (!Uuid::isValid($shop)) {
            $out->writeln('<error>A --id nem érvényes UUID.</error>');

            return Command::FAILURE;
        }
        if ($this->db->fetchOne('SELECT 1 FROM shops WHERE id = ?', [$shop]) !== false) {
            $out->writeln('Ez a szerviz már létezik: '.$shop);

            return Command::SUCCESS;
        }
        $demo = [];
        $this->db->transactional(function () use ($shop, $in, $pin, &$demo) {
            $this->db->insert('shops', ['id' => $shop, 'name' => $in->getArgument('shop'), 'created_at' => gmdate('Y-m-d H:i:sP')]);
            $i = 0;
            foreach (self::ROLES as $code => [$label, $can]) {
                $this->db->insert('rpw_roles', ['id' => Uuid::v4()->toRfc4122(), 'shop_id' => $shop, 'code' => $code, 'label' => $label,
                    'can' => (object) $can, 'sort_order' => ++$i * 10, 'active' => true], ['can' => \Doctrine\DBAL\Types\Types::JSON, 'active' => \Doctrine\DBAL\ParameterType::BOOLEAN]);
            }
            $this->db->insert('rpw_employees', ['id' => Uuid::v4()->toRfc4122(), 'shop_id' => $shop, 'name' => $in->getArgument('admin'),
                'role_code' => 'admin', 'pin_hash' => '$2a$'.substr(password_hash($pin, \PASSWORD_BCRYPT), 4), 'active' => true],
                ['active' => \Doctrine\DBAL\ParameterType::BOOLEAN]);
            if ($in->getOption('demo')) {
                foreach (self::DEMO as [$name, $role, $dpin]) {
                    $this->db->insert('rpw_employees', ['id' => Uuid::v4()->toRfc4122(), 'shop_id' => $shop, 'name' => $name, 'role_code' => $role,
                        'pin_hash' => '$2a$'.substr(password_hash($dpin, \PASSWORD_BCRYPT), 4), 'active' => true], ['active' => \Doctrine\DBAL\ParameterType::BOOLEAN]);
                    $demo[] = [$name, $role, $dpin];
                }
            }
        });
        $out->writeln('Szerviz létrehozva. shop_id: '.$shop);
        foreach ($demo as [$name, $role, $dpin]) {
            $out->writeln(sprintf('  minta: %-22s %-11s PIN %s', $name, $role, $dpin));
        }

        return Command::SUCCESS;
    }
}
