<?php

declare(strict_types=1);

namespace App\Command;

use App\Infrastructure\Backup\RestoreService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Question\Question;

#[AsCommand(name: 'rpw:restore', description: 'Visszatöltés a titkosított mentésből. Alapból PRÓBA (külön adatbázisba, az élőhöz nem nyúl); --live: éles visszatöltés')]
final class RestoreCommand extends Command
{
    public function __construct(private readonly RestoreService $restore)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('backup', InputArgument::REQUIRED, 'A mentés mappája, vagy „latest” (a --from alatti legutóbbi)')
            ->addOption('from', null, InputOption::VALUE_REQUIRED, 'Mentések gyökere a „latest”-hez', '/var/backups/rpw')
            ->addOption('live', null, InputOption::VALUE_NONE, 'ÉLES visszatöltés (előtte biztonsági mentés a mostani állapotról)')
            ->addOption('yes', null, InputOption::VALUE_NONE, 'A megerősítő kérdés kihagyása (csak --live mellett, gépi futtatáshoz)')
            ->addOption('report', null, InputOption::VALUE_REQUIRED, 'A próba eredménye JSON-ként ide (a status.sh olvassa)');
    }

    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        $dir = (string) $in->getArgument('backup');
        if ($dir === 'latest') {
            $all = glob(rtrim((string) $in->getOption('from'), '/').'/rpw-*', \GLOB_ONLYDIR) ?: [];
            sort($all);
            $dir = (string) end($all);
            if ($dir === '') {
                $out->writeln('<error>Nincs mentés itt: '.$in->getOption('from').'</error>');

                return Command::FAILURE;
            }
        }
        $report = $in->getOption('report');
        try {
            if (!$in->getOption('live')) {
                $r = $this->restore->drill($dir);
                $out->writeln('PRÓBA OK — '.basename($dir).' → '.$r['target']);
                foreach ($r['tables'] as $t => $n) {
                    $out->writeln(sprintf('  %-14s %s', $t, $n < 0 ? 'HIÁNYZIK' : $n));
                }
                $out->writeln('  fotók a mentésben: '.$r['files']);
                $this->report($report, ['ok' => true, 'backup' => basename($dir)] + $r);

                return Command::SUCCESS;
            }
            if (!$in->getOption('yes')) {
                $q = new Question('ÉLES visszatöltés: az adatbázis a(z) '.basename($dir).' állapotára áll vissza. Írd be: VISSZAALLITAS > ');
                if ($this->getHelper('question')->ask($in, $out, $q) !== 'VISSZAALLITAS') {
                    $out->writeln('Megszakítva — semmi nem változott.');

                    return Command::FAILURE;
                }
            }
            $r = $this->restore->restoreLive($dir, \dirname($dir).'/pre-restore');
            $out->writeln('VISSZATÖLTVE — '.basename($dir));
            foreach ($r['tables'] as $t => $n) {
                $out->writeln(sprintf('  %-14s %s', $t, $n));
            }
            $out->writeln('  fotók: '.$r['files'].' · a visszatöltés előtti állapot mentése: '.$r['safety']);
            $out->writeln('Következő lépés: systemctl reload php8.3-fpm');

            return Command::SUCCESS;
        } catch (\Throwable $e) {
            $out->writeln('<error>HIBA: '.$e->getMessage().'</error>');
            $this->report($report, ['ok' => false, 'backup' => basename($dir), 'error' => mb_substr($e->getMessage(), 0, 300)]);

            return Command::FAILURE;
        }
    }

    private function report(mixed $file, array $data): void
    {
        if (\is_string($file) && $file !== '') {
            file_put_contents($file, json_encode($data + ['at' => gmdate(\DATE_ATOM)], \JSON_PRETTY_PRINT | \JSON_UNESCAPED_UNICODE));
        }
    }
}
