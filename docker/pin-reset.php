<?php
// RPW helyi gep: elfelejtett / nem cserelheto PIN visszaallitasa (RPW-PIN-csere.bat hivja).
// A PIN a NEWPIN kornyezeti valtozobol jon, kepernyore es fajlba nem kerul.
// Ugyanazok a szabalyok, mint a symfony/src/Domain/Auth/PinPolicy.php-ban; a zarolast is torli.
// 2026-11-23: nincs kollega-egyezes ellenorzes (a szerveren sincs — PIN-orakulum volt).
$p = trim((string) getenv('NEWPIN'));
$db = getenv('RPW_DB') ?: '/data/rpw.db';
$nev = getenv('RPW_NAME') ?: 'Ferenc Admin';
$hiba = null;
if (!preg_match('/^\d{4,8}$/', $p)) $hiba = 'csak szamjegy, 4-8 hosszu';
elseif (str_repeat($p[0], strlen($p)) === $p) $hiba = 'minden szamjegy azonos';
else { $a = $d = true; for ($i = 1; $i < strlen($p); $i++) { $a = $a && (int)$p[$i] === (int)$p[$i-1] + 1; $d = $d && (int)$p[$i] === (int)$p[$i-1] - 1; }
  if ($a || $d) $hiba = 'egymast koveto szamjegyek';
  elseif (strlen($p) === 4 && (int)$p >= 1900 && (int)$p <= 2099) $hiba = 'evszam'; }
if ($hiba) { echo "ELUTASITVA: $hiba. Probald ujra mas PIN-nel.\n"; exit(1); }
$pdo = new PDO('sqlite:' . $db); $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$q = $pdo->prepare('SELECT id FROM rpw_employees WHERE name = ? AND active = 1'); $q->execute([$nev]); $id = $q->fetchColumn();
if (!$id) { echo "HIBA: nincs aktiv '$nev' dolgozo.\n"; exit(1); }
$h = '$2a$' . substr(password_hash($p, PASSWORD_BCRYPT, ['cost' => 10]), 4);
$st = $pdo->prepare('UPDATE rpw_employees SET pin_hash = ?, pin_set_at = ? WHERE id = ?');
$st->execute([$h, gmdate('Y-m-d H:i:sP'), $id]);
$pdo->prepare('DELETE FROM rpw_pin_attempt WHERE employee_id = ?')->execute([$id]);
echo "KESZ: $nev PIN-je beallitva, a zarolas torolve. Lepj be az uj PIN-nel.\n";
