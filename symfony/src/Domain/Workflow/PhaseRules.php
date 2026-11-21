<?php

declare(strict_types=1);

namespace App\Domain\Workflow;

use App\Domain\Job\JobData as D;

/**
 * FÁZISSZABÁLYOK — az EGYETLEN igazságforrás.
 *
 * A régi rendszerben két szabályhalmaz élt: a gazdag kliensoldali
 * (rpw-workflow.js checkPhase1..7) és egy szegényebb szerveroldali tábla
 * (rpw_phase_requirements). Ez volt a REMAINING-RISKS 5. pontja.
 * Itt a gazdag szabályhalmaz fut a SZERVEREN, és a kliens ugyanezt a
 * listát kapja vissza (GET /api/jobs/{id}/requirements). Egy forrás.
 *
 * A hibakódok változatlanok (wf_*), hogy a meglévő fordítások működjenek.
 */
final class PhaseRules
{
    private const OV_POZ = ['front', 'back', 'left', 'right', 'serieCaros', 'km'];
    private const OV_ACTE = [
        'front' => 'foto_fata', 'back' => 'foto_spate', 'left' => 'foto_stanga',
        'right' => 'foto_dreapta', 'serieCaros' => 'foto_serie_caroserie', 'km' => 'foto_km',
    ];

    /** Felülbírálható (override joggal átléphető) hiánykódok. */
    public const OVERRIDABLE = [
        'wf_constatare_missing', 'wf_nrdosar_missing', 'wf_kar_doc_missing', 'wf_overview_missing',
        'wf_reconst_no_response', 'wf_no_deviz', 'wf_no_deviz_file', 'wf_photos_not_five',
    ];

    // ── normalizálás (a JS migrateJob megfelelője) ───────────────────

    /** Hiányzó workflow-mezők pótlása — idempotens, adatot nem töröl. */
    public static function normalize(array $job): array
    {
        $phases = D::obj($job['phases'] ?? []);
        $current = \is_int($job['phase'] ?? null) ? $job['phase'] : 1;
        foreach (Phase::ALL as $n) {
            $p = $phases[(string) $n] ?? $phases[$n] ?? null;
            if (!\is_array($p)) {
                $p = ['status' => $n < $current ? Phase::DONE : ($n === $current ? Phase::ACTIVE : Phase::PENDING)];
            }
            if (!\in_array($p['status'] ?? null, Phase::STATES, true)) {
                $p['status'] = Phase::PENDING;
            }
            unset($phases[$n]);
            $phases[(string) $n] = $p;
        }
        $job['phases'] = $phases;

        if (D::isAuto($job)) {
            $s = $job['phases']['3']['status'];
            if ($s !== Phase::SKIPPED && $s !== Phase::DONE) {
                $job['phases']['3']['status'] = Phase::SKIPPED;
                $job['phases']['3']['skippedReason'] ??= 'auto:no-reconstatare';
            }
        }
        foreach (['rework', 'workflowHistory', 'overrideGrants'] as $k) {
            if (!\is_array($job[$k] ?? null) || !array_is_list($job[$k])) {
                $job[$k] = [];
            }
        }
        if (!\is_array($job['closing'] ?? null)) {
            $job['closing'] = [];
        }
        // a kliens migrateJob-jával AZONOS alapmezők — különben egy teljes-munka
        // mentés hamis „változást” mutatna (pl. egy recepciós closing-mezőt írna)
        foreach (['vehicleOperational', 'finalControlConfirmed', 'documentsDeliveredToOffice', 'handoverBy', 'handoverAt'] as $f) {
            if (!\array_key_exists($f, $job['closing'])) {
                $job['closing'][$f] = null;
            }
        }
        if (!\is_array($job['control'] ?? null)) {
            $job['control'] = ['results' => new \stdClass(), 'history' => [], 'allDone' => false, 'lastResult' => null];
        }
        if (!\is_array($job['control']['history'] ?? null)) {
            $job['control']['history'] = [];
        }
        $job['workflowVersion'] = 1;
        $job['phase'] = self::currentActivePhase($job);
        if (!\is_bool($job['inchis'] ?? null)) {
            $job['inchis'] = $job['phases']['7']['status'] === Phase::DONE;
        }

        return $job;
    }

    public static function status(array $job, int $phase): string
    {
        return (string) ($job['phases'][(string) $phase]['status'] ?? $job['phases'][$phase]['status'] ?? Phase::PENDING);
    }

    /** Az első nem lezárt fázis; ha minden lezárt, a 7. */
    public static function currentActivePhase(array $job): int
    {
        foreach (Phase::ALL as $n) {
            if (!\in_array(self::status($job, $n), Phase::CLOSED_STATES, true)) {
                return $n;
            }
        }

        return Phase::INCHIDERE;
    }

    // ── belépés ───────────────────────────────────────────────────────

    /** @return array{allowed:bool, reasons:list<string>, override?:bool} */
    public static function canEnter(array $job, int $phase): array
    {
        $job = self::normalize($job);
        if ($phase <= 1) {
            return ['allowed' => true, 'reasons' => []];
        }
        $r = [];
        for ($n = 1; $n < $phase; ++$n) {
            $st = self::status($job, $n);
            if (\in_array($st, Phase::CLOSED_STATES, true)) {
                continue;
            }
            if ($n === 2 && (D::get($job, 'evalData.status')) !== 'accepted') {
                $r[] = 'wf_eval_not_accepted';
            } elseif ($n === 3 && !D::isAuto($job)) {
                $rs = self::reconstStatus($job);
                $r[] = ($rs === 'draft' || $rs === 'sent') ? 'wf_reconst_waiting' : 'wf_prev_not_closed';
            } else {
                $r[] = 'wf_prev_not_closed';
            }
        }
        $r = array_values(array_unique($r));
        if ($r !== [] && self::hasOverrideGrant($job, $phase)) {
            return ['allowed' => true, 'reasons' => [], 'override' => true];
        }
        if ($r !== []) {
            array_unshift($r, 'wf_future_phase');
        }

        return ['allowed' => $r === [], 'reasons' => array_values(array_unique($r))];
    }

    public static function hasOverrideGrant(array $job, int $phase): bool
    {
        foreach (D::arr($job['overrideGrants'] ?? []) as $g) {
            if (\is_array($g) && (int) ($g['toPhase'] ?? 0) === $phase) {
                return true;
            }
        }

        return false;
    }

    // ── lezárás ───────────────────────────────────────────────────────

    /** @return list<string> a hiányzó feltételek kódjai; üres = lezárható */
    public static function missing(array $job, int $phase): array
    {
        $job = self::normalize($job);
        if ($phase === 3 && D::isAuto($job)) {
            return [];
        }
        $m = match ($phase) {
            1 => self::phase1($job),
            2 => self::phase2($job),
            3 => self::phase3($job),
            4 => self::execRows($job, self::bodyRows($job), 4),
            5 => self::execRows($job, self::paintRows($job), 5),
            6 => self::phase6($job),
            7 => self::phase7($job),
            default => [],
        };

        return array_values(array_unique($m));
    }

    /**
     * Hiánylista a szerver kapujához: override joggal a felülbírálható
     * tételek kimaradnak (a régi rpw__missing override_ok mintája).
     */
    public static function blocking(array $job, int $phase, bool $hasOverride): array
    {
        $m = self::missing($job, $phase);
        if ($hasOverride) {
            $m = array_values(array_filter($m, static fn (string $c) => !\in_array($c, self::OVERRIDABLE, true)));
        }

        return $m;
    }

    public static function percent(array $job, int $phase): int
    {
        $st = self::status(self::normalize($job), $phase);
        if ($st === Phase::DONE || $st === Phase::SKIPPED || ($phase === 3 && D::isAuto($job))) {
            return 100;
        }
        $total = [1 => 8, 2 => 4, 3 => 1, 4 => 3, 5 => 3, 6 => 2, 7 => 9][$phase] ?? 1;

        return (int) round(max(0, $total - \count(self::missing($job, $phase))) / $total * 100);
    }

    // ── termelési sorok ───────────────────────────────────────────────

    public static function bodyRows(array $job): array
    {
        $p = D::arr(D::get($job, 'production.body'));

        return $p !== [] ? $p : D::arr($job['bodyRows'] ?? []);
    }

    public static function paintRows(array $job): array
    {
        $p = D::arr(D::get($job, 'production.paint'));

        return $p !== [] ? $p : D::arr($job['paintRows'] ?? []);
    }

    /** Van-e végrehajtandó (nem „not_required”) sor a 4./5. fázisban? */
    public static function hasExecutableWork(array $job, int $phase): bool
    {
        $rows = $phase === 4 ? self::bodyRows($job) : self::paintRows($job);
        foreach ($rows as $r) {
            if (\is_array($r) && !self::notRequired($r)) {
                return true;
            }
        }

        return false;
    }

    public static function openReworks(array $job): array
    {
        return array_values(array_filter(D::arr($job['rework'] ?? []),
            static fn ($r) => \is_array($r) && ($r['status'] ?? 'open') === 'open'));
    }

    // ── fázisonkénti ellenőrzések ─────────────────────────────────────

    private static function phase1(array $job): array
    {
        $m = [];
        if (D::csakDosszie($job)) {
            if (DaunaDocs::missing($job) !== []) {
                $m[] = 'wf_acte_incomplete';
            }

            return $m;
        }
        if (!D::nonEmpty($job['damageType'] ?? null) && !D::nonEmpty($job['workType'] ?? null)) {
            $m[] = 'wf_worktype_missing';
        }
        $pk = D::obj($job['photoKeys'] ?? []);
        $talonPhotos = array_filter(D::arr($job['photos'] ?? []), static fn ($p) => \is_array($p) && ($p['type'] ?? null) === 'talon');
        $hasTalon = !empty($pk['talon']) || !empty($pk['photo_talon']) || DaunaDocs::slotHasFile($job, 'pag_talon_fata')
            || D::realPhotoCount(array_values($talonPhotos)) > 0;
        if (!$hasTalon) {
            $m[] = 'wf_talon_missing';
        }
        if (($job['damageType'] ?? null) === 'asig') {
            $karDoc = !empty($pk['doc_constatare'])
                || (bool) array_filter(D::arr($job['docs'] ?? []), static fn ($d) => \is_array($d) && preg_match('/constatare|proces/i', (string) ($d['type'] ?? '')) === 1)
                || D::obj($job['dosarActe'] ?? []) !== [];
            $dosarStatus = $job['dosarStatus'] ?? null;
            if (!$karDoc) {
                $m[] = 'wf_constatare_missing';
            }
            // A kárszám csak akkor követelhető, ha a dosszié már nyitva van a biztosítónál.
            if ($dosarStatus !== 'deschid') {
                $nr = D::nonEmpty($job['nrDosar'] ?? null) || D::nonEmpty(D::get($job, 'reconst.nrDosar'));
                if (!$nr) {
                    $m[] = $dosarStatus === 'deschis' ? 'wf_nrdosar_missing' : 'wf_kar_doc_missing';
                }
            }
        }
        if (self::overviewPhotoCount($job) < 6) {
            $m[] = 'wf_overview_missing';
        }
        [$ok, $proofOk] = self::elementsComplete($job);
        if (!$ok) {
            $m[] = 'wf_elements_incomplete';
        }
        if (!$proofOk) {
            $m[] = 'wf_proof_photo_missing';
        }
        $hasReport = \is_array($job['damageReport'] ?? null) || !empty($job['damageReportCreated'])
            || (D::obj($job['elements'] ?? []) !== [] && $ok);
        if (!$hasReport) {
            $m[] = 'wf_damage_report_missing';
        }

        return $m;
    }

    /** Az értékelés elfogadhatósága — a „Trimite în producție” ehhez kötött. */
    public static function evalAcceptable(array $job): array
    {
        $m = [];
        $items = D::arr(D::get($job, 'evalData.comanda'));
        if ($items === []) {
            $m[] = 'wf_no_work_item';
        } else {
            $anyOp = true;
            $anyHours = true;
            foreach ($items as $r) {
                $r = \is_array($r) ? $r : [];
                $anyOp = $anyOp && D::nonEmpty($r['op'] ?? null);
                $anyHours = $anyHours && D::pos($r['hours'] ?? null);
            }
            if (!$anyOp) {
                $m[] = 'wf_missing_op';
            }
            if (!$anyHours) {
                $m[] = 'wf_missing_hours';
            }
        }
        if (!D::nonEmpty($job['termenPredare'] ?? null)) {
            $m[] = 'wf_missing_termen';
        }

        return $m;
    }

    private static function phase2(array $job): array
    {
        $m = self::evalAcceptable($job);
        if (D::get($job, 'evalData.status') !== 'accepted') {
            $m[] = 'wf_eval_not_final';
        }

        return $m;
    }

    private static function reconstStatus(array $job): string
    {
        $r = D::obj($job['reconst'] ?? []);

        return (string) ($r['status'] ?? $r['response'] ?? 'draft');
    }

    private static function phase3(array $job): array
    {
        $rs = self::reconstStatus($job);
        if ($rs === 'draft' || $rs === 'sent') {
            return ['wf_reconst_no_response'];
        }
        if ($rs === 'rejected' && (!D::nonEmpty(D::get($job, 'reconst.responseNote')) || !D::nonEmpty(D::get($job, 'reconst.responseDate')))) {
            return ['wf_reconst_need_note'];
        }

        return [];
    }

    private static function notRequired(array $r): bool
    {
        return !empty($r['notRequired']) || ($r['status'] ?? null) === 'not_required';
    }

    private static function execRows(array $job, array $rows, int $phase): array
    {
        $exec = array_values(array_filter($rows, static fn ($r) => \is_array($r) && !self::notRequired($r)));
        if ($exec === []) {
            return ['wf_no_work_rows'];
        }
        $m = [];
        foreach ($exec as $r) {
            $name = D::nonEmpty($r['name'] ?? null) ? $r['name'] : ($r['denumire'] ?? $r['elKey'] ?? null);
            $op = $r['op'] ?? $r['bodyType'] ?? $r['paintType'] ?? $r['workType'] ?? null;
            if (!D::nonEmpty($name) || !D::nonEmpty($op) || !D::pos($r['hours'] ?? null) || ($r['approved'] ?? null) === false) {
                $m[] = 'wf_row_incomplete';
            }
            if (($r['completed'] ?? null) !== true) {
                $m[] = 'wf_row_not_completed';
            } elseif (!D::isRealPerson($r['completedBy'] ?? null)) {
                $m[] = 'wf_row_no_executor';
            }
        }
        foreach (self::openReworks($job) as $rw) {
            if ((int) ($rw['sourcePhase'] ?? 0) === $phase) {
                $m[] = 'wf_open_rework';
                break;
            }
        }

        return $m;
    }

    private static function phase6(array $job): array
    {
        $m = [];
        if (empty(D::get($job, 'control.allDone'))) {
            $m[] = 'wf_control_incomplete';
        }
        if (D::get($job, 'control.lastResult') === 'nok') {
            $m[] = 'wf_control_nok';
        }
        if (self::openReworks($job) !== []) {
            $m[] = 'wf_open_rework';
        }

        return $m;
    }

    private static function phase7(array $job): array
    {
        $m = [];
        if (self::status($job, 6) !== Phase::DONE) {
            $m[] = 'wf_prev_not_closed';
        }
        if (self::openReworks($job) !== []) {
            $m[] = 'wf_open_rework';
        }
        $cl = D::obj($job['closing'] ?? []);
        if (!D::nonEmpty($cl['factura'] ?? null)) {
            $m[] = 'wf_no_invoice';
        }
        if (!D::nonEmpty($cl['devizRef'] ?? null)) {
            $m[] = 'wf_no_deviz';
        }
        if (!D::nonEmpty($cl['devizFileUrl'] ?? null) && ($cl['devizNotRequired'] ?? null) !== true) {
            $m[] = 'wf_no_deviz_file';
        }
        if (D::realPhotoCount($job['closingPhotos'] ?? []) < 5) {
            $m[] = 'wf_photos_not_five';
        }
        if (($cl['vehicleOperational'] ?? null) !== true) {
            $m[] = 'wf_not_operational';
        }
        if (($cl['finalControlConfirmed'] ?? null) !== true) {
            $m[] = 'wf_final_control';
        }
        if (($cl['documentsDeliveredToOffice'] ?? null) !== true) {
            $m[] = 'wf_docs_not_delivered';
        }
        if (!D::nonEmpty($cl['handoverBy'] ?? null)) {
            $m[] = 'wf_no_handover';
        }

        return $m;
    }

    private static function overviewPhotoCount(array $job): int
    {
        $pk = D::obj($job['photoKeys'] ?? []);
        $c = 0;
        foreach (self::OV_POZ as $i => $p) {
            if (!empty($pk['ov_'.$i]) || !empty($pk['ov_'.$p]) || DaunaDocs::slotHasFile($job, self::OV_ACTE[$p])) {
                ++$c;
            }
        }
        if ($c === 0) {
            $c = D::realPhotoCount(array_values(array_filter(D::arr($job['photos'] ?? []),
                static fn ($q) => \is_array($q) && ($q['type'] ?? null) === 'overview')));
        }

        return $c;
    }

    /** @return array{0:bool,1:bool} [minden elemnek van státusza, minden sérülthöz van fotó] */
    private static function elementsComplete(array $job): array
    {
        $el = D::obj($job['elements'] ?? []);
        if ($el === []) {
            return [false, true];
        }
        $pk = D::obj($job['photoKeys'] ?? []);
        $ok = true;
        $proof = true;
        foreach ($el as $k => $e) {
            $e = \is_array($e) ? $e : [];
            $s = $e['statusV2'] ?? $e['status'] ?? null;
            if (!D::nonEmpty($s)) {
                $ok = false;
            }
            if (\in_array($s, ['damaged', 'avariata', 'suggested', 'recomandata'], true)) {
                $has = !empty($pk['elem_'.$k]) || (D::nonEmpty($e['photo'] ?? null) && !\is_array($e['photo']))
                    || D::isRealPhoto($e['photo'] ?? null) || !empty($e['photoRef']);
                if (!$has) {
                    $proof = false;
                }
            }
        }

        return [$ok, $proof];
    }
}
