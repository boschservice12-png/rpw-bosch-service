<?php

declare(strict_types=1);

namespace App\Command;

use App\Application\PhotoExtractor;
use App\Controller\JsonInput;
use App\Infrastructure\Backup\BackupService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'rpw:jobs:extract-photos', description: 'A munkákba ágyazott régi (base64) fotók kiköltöztetése a tárba — átálláskor. Előtte teljes mentés; --dry-run: csak mér')]
final class ExtractPhotosCommand extends Command
{
    public function __construct(private readonly PhotoExtractor $extractor, private readonly BackupService $backup)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('dry-run', null, InputOption::VALUE_NONE, 'Csak megméri, mi menne ki — semmit nem ír')
            ->addOption('job', null, InputOption::VALUE_REQUIRED, 'Csak ez az egy munka')
            ->addOption('backup-to', null, InputOption::VALUE_REQUIRED, 'A kötelező előzetes mentés helye', '/var/backups/rpw/pre-extract');
    }

    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        $dry = (bool) $in->getOption('dry-run');
        if (!$dry) {
            try {
                $b = $this->backup->create((string) $in->getOption('backup-to'));
                $out->writeln('Mentés előtte: '.$b['dir']);
            } catch (\Throwable $e) {
                $out->writeln('<error>A mentés nem sikerült — NEM folytatom: '.$e->getMessage().'</error>');

                return Command::FAILURE;
            }
        }
        $r = $this->extractor->run($dry, \is_string($j = $in->getOption('job')) ? $j : null);
        $out->writeln(sprintf('%s munka: %d · érintett: %d · fotó: %d · méret: %.1f MB → %.1f MB',
            $dry ? 'PRÓBA —' : 'KÉSZ —', $r['jobs'], $dry ? \count(array_filter($r['largest'], static fn ($x) => $x[1] !== $x[2])) : $r['changed'],
            $r['photos'], $r['before'] / 1e6, $r['after'] / 1e6));
        $tooBig = 0;
        foreach ($r['largest'] as [$id, $before, $after]) {
            $flag = $after > JsonInput::MAX_BYTES ? '  ✘ MÉG MINDIG TÚL NAGY' : '';
            $tooBig += $flag !== '' ? 1 : 0;
            $out->writeln(sprintf('  %-44s %6.2f MB → %6.2f MB%s', $id, $before / 1e6, $after / 1e6, $flag));
        }
        foreach ($r['untouched'] as $u) {
            $out->writeln('  · a munkában maradt (a felület így várja / nem JPG-PNG-PDF): '.$u);
        }
        foreach ($r['skipped'] as $s) {
            $out->writeln('  ⚠ közben módosult, kihagyva — futtasd újra: '.$s);
        }
        foreach ($r['errors'] as $e) {
            $out->writeln('  ✘ '.$e);
        }

        return $r['errors'] === [] && $tooBig === 0 ? Command::SUCCESS : Command::FAILURE;
    }
}
