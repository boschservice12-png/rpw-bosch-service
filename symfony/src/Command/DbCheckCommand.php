<?php

declare(strict_types=1);

namespace App\Command;

use App\Controller\JsonInput;
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
        $big = $diff === [] ? $this->oversizedJobs() : [];
        foreach ($big as [$id, $bytes]) {
            $output->writeln(sprintf('<error>TÚL NAGY</error> %s: %.1f MB — az új szerveren NEM menthető (max. %.1f MB). Előbb a beágyazott fotók a tárba (rpw-cleanup.html).',
                $id, $bytes / 1e6, JsonInput::MAX_BYTES / 1e6));
        }
        if ($diff === [] && $big === []) {
            $output->writeln('<info>OK — minden elvárt tábla és oszlop megvan, és minden munka menthető méretű.</info>');

            return Command::SUCCESS;
        }
        if ($diff === []) {
            return Command::FAILURE;
        }
        foreach ($diff as $table => $cols) {
            $output->writeln(sprintf('<error>HIÁNY</error> %s: %s', $table, $cols === ['*'] ? 'a tábla nem létezik' : implode(', ', $cols)));
        }

        return Command::FAILURE;
    }

    /**
     * Az élő mentés a TELJES munkát küldi; a 2 MB fölötti munka az új szerveren nem menthető.
     * (A régi rendszerben a fotók egy része base64-ként a munkában ült.) A határ 90%-ától jelez.
     *
     * @return list<array{0:string,1:int}>
     */
    private function oversizedJobs(): array
    {
        $out = [];
        foreach ($this->db->iterateAssociative('SELECT id, data FROM rpw_jobs WHERE deleted_at IS NULL') as $row) {
            $n = \strlen(\is_string($row['data']) ? $row['data'] : json_encode($row['data']));
            if ($n > JsonInput::MAX_BYTES * 0.9) {
                $out[] = [(string) $row['id'], $n];
            }
        }

        return $out;
    }
}
