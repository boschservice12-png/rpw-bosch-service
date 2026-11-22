<?php

declare(strict_types=1);

namespace App\Command;

use App\Infrastructure\Storage\ObjectStore;
use App\Infrastructure\Storage\S3ObjectStore;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'rpw:storage:check', description: 'Fotótár beüzemelési próba (feltöltés → olvasás → törlés a valódi tárral); --cors=https://<domain> beállítja a tár CORS-szabályát')]
final class StorageCheckCommand extends Command
{
    public function __construct(
        private readonly ObjectStore $store,
        #[Autowire(service: 'rpw.replica')] private readonly ?S3ObjectStore $replica = null,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('replica', null, InputOption::VALUE_NONE, 'A MÁSOLAT tárát ellenőrzi: írni tud-e, és hogy TÖRÖLNI NE tudjon')
            ->addOption('cors', null, InputOption::VALUE_REQUIRED, 'A tár CORS-szabálya erre az egy eredetre (pl. https://rpw.redassistance.net)');
    }

    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        if ($in->getOption('replica')) {
            return $this->checkReplica($out);
        }
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

    /** A másolat tára: írás és olvasás menjen, a TÖRLÉS NE (feltört szerver se törölhesse a másolatot). */
    private function checkReplica(OutputInterface $out): int
    {
        if ($this->replica === null) {
            $out->writeln('✘ a másolat célja nincs beállítva (RPW_REPLICA_*)');

            return Command::FAILURE;
        }
        $out->writeln('Másolat: '.$this->replica->browserOrigin());
        $key = '_rpw-probe/replica-'.gmdate('Ymd-His').'.jpg';
        $body = "\xFF\xD8\xFF".random_bytes(16);
        $fail = 0;
        try {
            $this->replica->putRaw($key, $body, 'image/jpeg');
            $out->writeln('  ✔ írás');
            $okRead = $this->replica->getRaw($key) === $body;
            $out->writeln(sprintf('  %s olvasás (bájtra egyezik)', $okRead ? '✔' : '✘'));
            $fail += $okRead ? 0 : 1;
            try {
                $this->replica->remove('_rpw-probe', 'replica-del.jpg');   // nem létező kulcs: a JOGOT méri, nem töröl valódit
                $denied = false;
            } catch (\RuntimeException) {
                $denied = true;
            }
            $out->writeln($denied ? '  ✔ törlés TILTVA (helyes: a másolat csak hozzáírható)'
                : '  ⚠ a kulcs TÖRÖLNI IS tud — kérj a szolgáltatónál csak írási/olvasási jogú kulcsot (TELEPITES-SZERVER.md 5c)');
        } catch (\Throwable $e) {
            ++$fail;
            $out->writeln('  ✘ '.$e->getMessage());
        }
        $out->writeln($fail === 0 ? 'OK — a másolat tára használható.' : 'HIBA — a másolat tára NEM használható.');

        return $fail === 0 ? Command::SUCCESS : Command::FAILURE;
    }
}
