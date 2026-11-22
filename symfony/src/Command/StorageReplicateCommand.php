<?php

declare(strict_types=1);

namespace App\Command;

use App\Infrastructure\Storage\ReplicaService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'rpw:storage:replicate', description: 'A fotók másolata a másik szolgáltatóhoz (csak az új fotók; a célban soha nem töröl). --reverse: visszatöltés a másolatból')]
final class StorageReplicateCommand extends Command
{
    public function __construct(private readonly ReplicaService $replica)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('reverse', null, InputOption::VALUE_NONE, 'Katasztrófa után: a másolatból az elsődleges tárba (meglévőt nem ír felül)')
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Csak megszámolja, mi hiányzik a másolatból')
            ->addOption('report', null, InputOption::VALUE_REQUIRED, 'Eredmény JSON-ként ide (a status.sh olvassa)');
    }

    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        if (!$this->replica->configured()) {
            $out->writeln('<error>A másolat célja nincs beállítva (RPW_REPLICA_* a .env.local-ban) — a fotóknak NINCS gépen kívüli másolata.</error>');
            $this->report($in->getOption('report'), ['ok' => false, 'error' => 'not_configured']);

            return Command::FAILURE;
        }
        try {
            if ($in->getOption('reverse')) {
                $r = $this->replica->reverse();
                $out->writeln(sprintf('Visszatöltve a másolatból: %d (a másolatban: %d)', $r['restored'], $r['replica']));
                foreach ($r['errors'] as $e) {
                    $out->writeln('  ✘ '.$e);
                }

                return $r['errors'] === [] ? Command::SUCCESS : Command::FAILURE;
            }
            $r = $this->replica->replicate((bool) $in->getOption('dry-run'));
        } catch (\Throwable $e) {
            $out->writeln('<error>HIBA: '.$e->getMessage().'</error>');
            $this->report($in->getOption('report'), ['ok' => false, 'error' => mb_substr($e->getMessage(), 0, 300)]);

            return Command::FAILURE;
        }
        $ok = $r['missing_after'] === 0 && $r['errors'] === [];
        $out->writeln(sprintf('%s fotó a tárban: %d · a másolatban volt: %d · most átmásolva: %d (%.1f MB) · másolat nélkül: %d',
            $ok ? '✔' : '✘', $r['source'], $r['replica_before'], $r['copied'], $r['bytes'] / 1048576, $r['missing_after']));
        foreach ($r['errors'] as $e) {
            $out->writeln('  ✘ '.$e);
        }
        if ($r['invalid'] !== []) {
            $out->writeln('  ⚠ nem valódi JPG/PDF (a név és a tartalom eltér) — e-mailben / Audatexben hibás lehet:');
            foreach ($r['invalid'] as $k) {
                $out->writeln('    '.$k);
            }
        }
        $this->report($in->getOption('report'), ['ok' => $ok] + $r);

        return $ok ? Command::SUCCESS : Command::FAILURE;
    }

    private function report(mixed $file, array $data): void
    {
        if (\is_string($file) && $file !== '') {
            file_put_contents($file, json_encode($data + ['at' => gmdate(\DATE_ATOM)], \JSON_PRETTY_PRINT | \JSON_UNESCAPED_UNICODE | \JSON_UNESCAPED_SLASHES));
        }
    }
}
