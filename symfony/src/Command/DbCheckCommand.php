<?php

declare(strict_types=1);

namespace App\Command;

use App\Infrastructure\Db\RpwSchema;
use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * KAPU a párhuzamos üzem előtt: csak OLVAS, semmit nem módosít.
 * Kilépési kód 0 = a séma megfelel; 1 = hiány van (a lista kiírva).
 */
#[AsCommand(name: 'rpw:db:check', description: 'Ellenőrzi, hogy a meglévő adatbázis sémája megfelel-e az új backendnek (csak olvas).')]
final class DbCheckCommand extends Command
{
    public function __construct(private readonly Connection $db)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $diff = RpwSchema::diff($this->db);
        if ($diff === []) {
            $output->writeln('<info>OK — minden elvárt tábla és oszlop megvan.</info>');

            return Command::SUCCESS;
        }
        foreach ($diff as $table => $cols) {
            $output->writeln(sprintf('<error>HIÁNY</error> %s: %s', $table, $cols === ['*'] ? 'a tábla nem létezik' : implode(', ', $cols)));
        }

        return Command::FAILURE;
    }
}
