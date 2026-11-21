<?php

declare(strict_types=1);

namespace App\Command;

use App\Infrastructure\Db\RpwSchema;
use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'rpw:db:init', description: 'Létrehozza a hiányzó RPW-táblákat (friss telepítés / teszt). Meglévő táblához nem nyúl.')]
final class DbInitCommand extends Command
{
    public function __construct(private readonly Connection $db)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $created = RpwSchema::createMissing($this->db);
        $output->writeln($created === [] ? 'Minden tábla megvan.' : 'Létrehozva: '.implode(', ', $created));

        return Command::SUCCESS;
    }
}
