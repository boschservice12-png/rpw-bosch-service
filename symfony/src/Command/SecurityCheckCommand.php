<?php

declare(strict_types=1);

namespace App\Command;

use App\Infrastructure\Db\Sql;
use App\Security\ProductionGuardSubscriber;
use App\Security\SecretPolicy;
use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * ÉLESÍTÉS ELŐTTI BIZTONSÁGI KAPU — csak olvas. Rétegenként ellenőrzi a beállítást.
 * HIBA = nem élesíthető (kilépési kód 1); FIGYELEM = döntés kell, de nem blokkol.
 */
#[AsCommand(name: 'rpw:security:check', description: 'Élesítés előtti biztonsági ellenőrzés rétegenként (csak olvas)')]
final class SecurityCheckCommand extends Command
{
    public function __construct(
        private readonly Connection $db,
        #[Autowire('%kernel.environment%')] private readonly string $env,
        #[Autowire('%kernel.debug%')] private readonly bool $debug,
        #[Autowire('%kernel.project_dir%')] private readonly string $root,
        #[Autowire('%env(default::APP_SECRET)%')] private readonly ?string $secret = null,
        #[Autowire('%env(default::RPW_BACKUP_KEY)%')] private readonly ?string $backupKey = null,
        #[Autowire('%env(default::ANTHROPIC_API_KEY)%')] private readonly ?string $aiKey = null,
        #[Autowire('%env(default::RESEND_API_KEY)%')] private readonly ?string $mailKey = null,
        #[Autowire('%env(default::TRUSTED_PROXIES)%')] private readonly ?string $proxies = null,
        #[Autowire('%env(default:rpw.storage_default:RPW_STORAGE_DIR)%')] private readonly string $storage = '',
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $in, OutputInterface $out): int
    {
        $rows = [];
        $add = static function (string $layer, string $status, string $what) use (&$rows): void {
            $rows[] = [$layer, $status, $what];
        };
        // 4. adat / titkok
        $add('4 adat', $this->env === 'prod' ? 'OK' : 'HIBA', 'APP_ENV = '.$this->env.($this->env === 'prod' ? '' : ' (élesben prod kell)'));
        $add('4 adat', $this->debug ? 'HIBA' : 'OK', 'APP_DEBUG '.($this->debug ? 'BE — hibarészletek szivároghatnak' : 'ki'));
        $add('4 adat', SecretPolicy::weak($this->secret) ? 'HIBA' : 'OK', 'APP_SECRET '.(SecretPolicy::weak($this->secret) ? 'gyenge/alapértelmezett (a fotó-linkek hamisíthatók)' : 'erős'));
        $k = base64_decode((string) $this->backupKey, true);
        $add('4 adat', $k !== false && \strlen($k) === 32 ? 'OK' : 'HIBA', 'RPW_BACKUP_KEY '.($k !== false && \strlen($k) === 32 ? 'beállítva' : 'hiányzik — rpw:backup --keygen'));
        $add('4 adat', Sql::isPg($this->db) ? 'OK' : 'FIGYELEM', 'adatbázis: '.(Sql::isPg($this->db) ? 'PostgreSQL' : 'SQLite (egy gépes próbához jó, élesben PostgreSQL ajánlott)'));
        $st = realpath($this->storage) ?: $this->storage;
        $inPublic = str_starts_with($st, realpath($this->root.'/public') ?: $this->root.'/public');
        $add('4 adat', $inPublic ? 'HIBA' : 'OK', 'fotótár a webgyökéren '.($inPublic ? 'BELÜL — közvetlenül letölthető!' : 'kívül: '.$st));
        if (is_dir($st)) {
            $world = (fileperms($st) & 0o007) !== 0;
            $add('4 adat', $world ? 'FIGYELEM' : 'OK', 'fotótár jogai: '.substr(\sprintf('%o', fileperms($st)), -4).($world ? ' (mások is olvashatják — chmod 750)' : ''));
        }
        // 3. alkalmazás
        $noPin = (int) $this->db->fetchOne('SELECT COUNT(*) FROM rpw_employees WHERE active = :t AND pin_hash IS NULL', ['t' => true], ['t' => \Doctrine\DBAL\ParameterType::BOOLEAN]);
        $add('3 alkalmazás', $noPin === 0 ? 'OK' : 'FIGYELEM', $noPin === 0 ? 'minden aktív dolgozónak van PIN-je' : $noPin.' aktív dolgozónak nincs PIN-je (nem tud belépni)');
        // 2026-11-23: PINs that are written in the source (demo team, first admin) must not stay in use.
        $known = array_merge(array_column(SeedShopCommand::DEMO, 2), [SeedShopCommand::FIRST_ADMIN_PIN]);
        $weak = 0;
        foreach ($this->db->fetchFirstColumn('SELECT pin_hash FROM rpw_employees WHERE active = :t AND pin_hash IS NOT NULL', ['t' => true], ['t' => \Doctrine\DBAL\ParameterType::BOOLEAN]) as $h) {
            foreach ($known as $p) {
                if (password_verify($p, (string) $h)) {
                    ++$weak;
                    break;
                }
            }
        }
        $add('3 alkalmazás', $weak === 0 ? 'OK' : 'HIBA', $weak === 0 ? 'nincs a forráskódban szereplő (minta-) PIN használatban' : $weak.' aktív dolgozó a forráskódban szereplő PIN-nel lép be — cseréld (RPW-PIN-csere.bat / Echipă)');
        $admins = 0;
        foreach ($this->db->fetchFirstColumn('SELECT r.can FROM rpw_employees e JOIN rpw_roles r ON r.shop_id = e.shop_id AND r.code = e.role_code WHERE e.active = :t', ['t' => true], ['t' => \Doctrine\DBAL\ParameterType::BOOLEAN]) as $c) {
            $admins += (int) ((Sql::decode($c)['delete'] ?? false) === true);
        }
        $add('3 alkalmazás', $admins <= 2 ? 'OK' : 'FIGYELEM', $admins.' dolgozó törölhet véglegesen (`delete` jog) — a legkisebb jogosultság elve: 1–2');
        $add('3 alkalmazás', ($this->aiKey ?? '') !== '' ? 'OK' : 'FIGYELEM', 'ANTHROPIC_API_KEY '.(($this->aiKey ?? '') !== '' ? 'beállítva' : 'hiányzik (OCR kézi bevitellel megy)'));
        $add('3 alkalmazás', ($this->mailKey ?? '') !== '' ? 'OK' : 'FIGYELEM', 'RESEND_API_KEY '.(($this->mailKey ?? '') !== '' ? 'beállítva' : 'hiányzik (levélküldés nem megy)'));
        // 2. web-határ
        $add('2 web-határ', ($this->proxies ?? '') !== '' ? 'OK' : 'FIGYELEM', 'TRUSTED_PROXIES '.(($this->proxies ?? '') !== '' ? $this->proxies : 'üres — fordított proxy (Caddy) mögött állítsd be, különben a fékek és a napló a proxy IP-jét látják'));
        $add('2 web-határ', 'FIGYELEM', 'HTTPS: offline nem mérhető — élesítés után: curl -sI https://<domain>/api/health | grep -i strict-transport');
        // 1. PHP / szerver
        $add('1 szerver', \ini_get('display_errors') ? 'HIBA' : 'OK', 'display_errors '.(\ini_get('display_errors') ? 'BE' : 'ki'));
        $add('1 szerver', \ini_get('expose_php') ? 'FIGYELEM' : 'OK', 'expose_php '.(\ini_get('expose_php') ? 'be (a PHP-verzió látszik)' : 'ki'));
        foreach (ProductionGuardSubscriber::problems($this->env, $this->debug, $this->secret) as $p) {
            $add('kapu', 'HIBA', 'a szerver így 503-mal áll: '.$p);
        }

        $fail = 0;
        foreach ($rows as [$l, $s, $w]) {
            $fail += (int) ($s === 'HIBA');
            $tag = ['OK' => 'info', 'FIGYELEM' => 'comment', 'HIBA' => 'error'][$s];
            $out->writeln(\sprintf('%-13s <%s>%-9s</%s> %s', $l, $tag, $s, $tag, $w));
        }
        $out->writeln($fail === 0 ? '<info>Élesíthető (a FIGYELEM-pontok döntést kérnek).</info>' : '<error>NEM élesíthető: '.$fail.' HIBA.</error>');

        return $fail === 0 ? Command::SUCCESS : Command::FAILURE;
    }
}
