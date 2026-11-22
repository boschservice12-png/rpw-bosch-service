<?php

declare(strict_types=1);

namespace App\Command;

use App\Infrastructure\Storage\MigrateService;
use App\Infrastructure\Storage\ObjectStoreFactory;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

#[AsCommand(name: 'rpw:storage:migrate', description: 'A meglévő fotók átvitele az objektumtárba (helyi lemezről vagy a régi Supabase-tárból). Újrafuttatható: csak a hiányzót viszi')]
final class StorageMigrateCommand extends Command
{
    public function __construct(private readonly MigrateService $migrate, private readonly HttpClientInterface $http)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('from-local', null, InputOption::VALUE_REQUIRED, 'Helyi fotótár mappája (benne: rpw-photos/)')
            ->addOption('from-legacy', null, InputOption::VALUE_NONE, 'A régi rendszer tára S3-protokollon: RPW_LEGACY_S3_ENDPOINT/_REGION/_BUCKET/_ACCESS_KEY/_SECRET_KEY')
            ->addOption('dry-run', null, InputOption::VALUE_NONE, 'Csak megszámol, nem másol')
            ->addOption('report', null, InputOption::VALUE_REQUIRED, 'Eredmény JSON-ként ide');
    }

    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        try {
            if (\is_string($dir = $in->getOption('from-local'))) {
                $src = $this->migrate->fromLocal($dir);
                $label = 'helyi: '.$dir;
            } elseif ($in->getOption('from-legacy')) {
                $e = static fn (string $k) => (string) ($_SERVER[$k] ?? $_ENV[$k] ?? getenv($k) ?: '');
                $legacy = ObjectStoreFactory::s3($this->http, $e('RPW_LEGACY_S3_ENDPOINT'), $e('RPW_LEGACY_S3_REGION'), $e('RPW_LEGACY_S3_BUCKET'),
                    $e('RPW_LEGACY_S3_ACCESS_KEY'), $e('RPW_LEGACY_S3_SECRET_KEY'));
                $src = $this->migrate->fromLegacyS3($legacy);
                $label = 'régi tár: '.$legacy->browserOrigin();
            } else {
                $out->writeln('<error>Add meg a forrást: --from-local=<mappa> vagy --from-legacy</error>');

                return Command::INVALID;
            }
            $r = $this->migrate->run($src, (bool) $in->getOption('dry-run'));
        } catch (\Throwable $e) {
            $out->writeln('<error>HIBA: '.$e->getMessage().'</error>');

            return Command::FAILURE;
        }
        $ok = $r['missing_after'] === 0 && $r['errors'] === [];
        $out->writeln(sprintf('%s %s — forrás: %d · már a tárban: %d · most átvive: %d (%.1f MB) · át nem vitt: %d',
            $ok ? '✔' : '✘', $label, $r['source'], $r['already'], $r['copied'], $r['bytes'] / 1048576, $r['missing_after']));
        foreach ($r['per_shop'] as $shop => $n) {
            $out->writeln(sprintf('  %-38s %d fotó', $shop, $n));
        }
        if ($r['unknownJob'] > 0) {
            $out->writeln(sprintf('  ⚠ %d fotó ismeretlen munkához tartozik → „_ismeretlen/” alatt (előbb az ADATOK átvitele kell?)', $r['unknownJob']));
        }
        if ($r['invalid'] !== []) {
            $out->writeln('  ⚠ nem valódi JPG/PDF (név és tartalom eltér) — e-mailben / Audatexben hibás lehet:');
            foreach ($r['invalid'] as $k) {
                $out->writeln('    '.$k);
            }
        }
        foreach ($r['errors'] as $e) {
            $out->writeln('  ✘ '.$e);
        }
        if (\is_string($f = $in->getOption('report'))) {
            file_put_contents($f, json_encode(['ok' => $ok, 'source' => $label] + $r + ['at' => gmdate(\DATE_ATOM)], \JSON_PRETTY_PRINT | \JSON_UNESCAPED_UNICODE | \JSON_UNESCAPED_SLASHES));
        }

        return $ok ? Command::SUCCESS : Command::FAILURE;
    }
}
