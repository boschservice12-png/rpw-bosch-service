<?php

declare(strict_types=1);

namespace App\Command;

use App\Infrastructure\Storage\ObjectStore;
use App\Infrastructure\Storage\S3ObjectStore;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'rpw:storage:check', description: 'Fotótár beüzemelési próba (feltöltés → olvasás → törlés a valódi tárral); --cors=https://<domain> beállítja a tár CORS-szabályát')]
final class StorageCheckCommand extends Command
{
    public function __construct(private readonly ObjectStore $store)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('cors', null, InputOption::VALUE_REQUIRED, 'A tár CORS-szabálya erre az egy eredetre (pl. https://rpw.redassistance.net)');
    }

    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        if (!$this->store instanceof S3ObjectStore) {
            $out->writeln('Fotótár: helyi lemez (RPW_STORAGE_BACKEND=local) — nincs mit ellenőrizni a tárnál.');

            return Command::SUCCESS;
        }
        $out->writeln('Fotótár: objektumtár — '.$this->store->browserOrigin());
        $fail = 0;
        if (\is_string($cors = $in->getOption('cors'))) {
            $c = $this->store->applyCors($cors);
            $ok = $c === 200 || $c === 204;
            $fail += $ok ? 0 : 1;
            $out->writeln(sprintf('  %s CORS: csak %s (HTTP %d)', $ok ? '✔' : '✘', $cors, $c));
        }
        foreach ($this->store->probe() as [$name, $ok, $detail]) {
            $fail += $ok ? 0 : 1;
            $out->writeln(sprintf('  %s %s — %s', $ok ? '✔' : '✘', $name, $detail));
        }
        $out->writeln($fail === 0 ? 'OK — a fotótár használható.' : 'HIBA — a fotótár NEM használható; a fenti lépés mutatja, hol.');

        return $fail === 0 ? Command::SUCCESS : Command::FAILURE;
    }
}
