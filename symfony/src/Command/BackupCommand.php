<?php

declare(strict_types=1);

namespace App\Command;

use App\Infrastructure\Backup\BackupService;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'rpw:backup', description: 'Titkosított mentés (adatbázis + fotók) sha256-tal, visszaellenőrzéssel és megőrzési idővel')]
final class BackupCommand extends Command
{
    public function __construct(private readonly BackupService $backup)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('to', null, InputOption::VALUE_REQUIRED, 'Célmappa (a webgyökéren KÍVÜL, lehetőleg másik lemez)', 'var/backups')
            ->addOption('keep', null, InputOption::VALUE_REQUIRED, 'Ennyi legutóbbi mentés marad', '14')
            ->addOption('insecure', null, InputOption::VALUE_NONE, 'Titkosítás nélkül (CSAK helyi próbához)')
            ->addOption('verify', null, InputOption::VALUE_REQUIRED, 'Egy meglévő mentés visszaellenőrzése (mappa)')
            ->addOption('keygen', null, InputOption::VALUE_NONE, 'Új RPW_BACKUP_KEY előállítása (tedd a szerver környezetébe, és őrizd meg külön is!)');
    }

    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        if ($in->getOption('keygen')) {
            $out->writeln('RPW_BACKUP_KEY='.base64_encode(sodium_crypto_secretstream_xchacha20poly1305_keygen()));
            $out->writeln('<comment>A kulcs nélkül a mentés NEM állítható vissza — őrizd meg a szerveren kívül is.</comment>');

            return Command::SUCCESS;
        }
        if (($dir = $in->getOption('verify')) !== null) {
            $v = $this->backup->verify((string) $dir);
            $out->writeln($v['ok'] ? '<info>OK — a mentés visszafejthető, minden hash egyezik.</info>' : '<error>HIBA: '.implode('; ', $v['errors']).'</error>');

            return $v['ok'] ? Command::SUCCESS : Command::FAILURE;
        }
        try {
            $r = $this->backup->create((string) $in->getOption('to'), (bool) $in->getOption('insecure'));
        } catch (\RuntimeException $e) {
            $out->writeln('<error>'.$e->getMessage().'</error>');

            return Command::FAILURE;
        }
        $v = $this->backup->verify($r['dir']);
        if (!$v['ok']) {
            $out->writeln('<error>A friss mentés visszaellenőrzése SIKERTELEN: '.implode('; ', $v['errors']).'</error>');

            return Command::FAILURE;
        }
        foreach ($r['files'] as $n => $m) {
            $out->writeln(sprintf('  %-12s %10d bájt  sha256 %s…', $n, $m['bytes'], substr($m['sha256'], 0, 16)));
        }
        $gone = $this->backup->prune((string) $in->getOption('to'), max(1, (int) $in->getOption('keep')));
        $out->writeln('<info>Mentés kész és ellenőrizve: '.$r['dir'].'</info>'.($gone ? ' (törölve: '.implode(', ', $gone).')' : ''));

        return Command::SUCCESS;
    }
}
