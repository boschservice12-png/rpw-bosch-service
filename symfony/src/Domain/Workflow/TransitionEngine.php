<?php

declare(strict_types=1);

namespace App\Domain\Workflow;

use App\Domain\Auth\Actor;
use App\Domain\Job\JobData as D;

/**
 * ÁLLAPOTGÉP — minden fázisváltás EGYETLEN tölcsére.
 *
 * Tiszta függvény: (munka, parancs, ember, idő) → új munka, vagy
 * TransitionDenied. Nem ír adatbázist; a verziózárat és az auditot az
 * alkalmazási réteg (JobService) végzi, ugyanabban a tranzakcióban.
 *
 * Forrás: 006_workflow_enforcement.sql rpw_transition (jogok, sorrend,
 * indoklás) + rpw-workflow.js (rework- és override-szemantika, auto-skip).
 */
final class TransitionEngine
{
    public const ACTIONS = ['start', 'complete', 'skip', 'reopen', 'rework_open', 'rework_close', 'override'];
    public const MIN_REASON = 5;
    public const MIN_LONG_TEXT = 10;
    public const REWORK_CATEGORIES = ['tinichigerie' => 4, 'bodywork' => 4, 'vopsitorie' => 5, 'paint' => 5, 'manager' => 6, 'other' => null];
    /** "other" (rpw-control-red.html: "alt motiv"): the target phase comes from the request and must be a workshop phase. */
    public const REWORK_OTHER_TARGETS = [4, 5];

    /**
     * @param array{reason?:?string, rework_id?:?string, note?:?string, category?:?string,
     *              description?:?string, assigned_to?:?string, resolved_by?:?string, to_phase?:?int} $args
     */
    public function apply(array $job, int $phase, string $action, Actor $actor, \DateTimeImmutable $now, array $args = []): array
    {
        if (!Phase::isValid($phase)) {
            throw new TransitionDenied('bad_phase');
        }
        if (!\in_array($action, self::ACTIONS, true)) {
            throw new TransitionDenied('bad_action');
        }
        $job = PhaseRules::normalize($job);
        $at = $now->format(\DATE_ATOM);
        $reason = trim((string) ($args['reason'] ?? ''));

        if ($job['inchis'] === true && $action !== 'reopen') {
            throw new TransitionDenied('job_closed');
        }

        return match ($action) {
            'start' => $this->start($job, $phase, $actor, $at),
            'complete' => $this->complete($job, $phase, $actor, $at, $reason),
            'skip' => $this->skip($job, $phase, $actor, $at, $reason),
            'reopen' => $this->reopen($job, $phase, $actor, $at, $reason),
            'rework_open' => $this->reworkOpen($job, $actor, $at, $args),
            'rework_close' => $this->reworkClose($job, $actor, $at, $args),
            'override' => $this->override($job, $phase, $actor, $at, $args),
        };
    }

    // ── start ─────────────────────────────────────────────────────────
    private function start(array $job, int $phase, Actor $actor, string $at): array
    {
        $this->need($actor, 'work');
        if (PhaseRules::status($job, $phase) === Phase::DONE) {
            throw new TransitionDenied('already_done');
        }
        $this->assertEnterable($job, $phase, $actor);
        $job = $this->set($job, $phase, Phase::ACTIVE, ['started' => $job['phases'][(string) $phase]['started'] ?? $at], $at);
        $job['phase'] = $phase;

        return $this->log($job, 'start', $phase, $phase, '', $actor, $at);
    }

    // ── complete ──────────────────────────────────────────────────────
    private function complete(array $job, int $phase, Actor $actor, string $at, string $reason): array
    {
        $this->need($actor, $phase === Phase::INCHIDERE ? 'close' : 'work');
        if (PhaseRules::status($job, $phase) === Phase::DONE) {
            throw new TransitionDenied('already_done');
        }
        $override = $actor->can('override');
        // Nyitott rework mellett NINCS lezárás — a jogosultság sem írja felül csendben.
        if (PhaseRules::openReworks($job) !== []) {
            throw new TransitionDenied('open_rework');
        }
        $this->assertEnterable($job, $phase, $actor);
        $missing = PhaseRules::blocking($job, $phase, $override);
        if ($missing !== []) {
            throw new TransitionDenied('requirements_missing', ['missing' => $missing]);
        }
        // a felülbírálási joggal ÁTLÉPETT (felülbírálható) hiányok nyoma a fázison és a naplóban
        $overridden = $override ? array_values(array_diff(PhaseRules::missing($job, $phase), $missing)) : [];
        if ($overridden !== []) {
            $reason = trim($reason.' [override: '.implode(', ', $overridden).']');
        }

        $job = $this->set($job, $phase, Phase::DONE, ['finished' => $at, 'completedBy' => $actor->name]
            + ($overridden !== [] ? ['overriddenRequirements' => $overridden] : []), $at);
        $next = $this->activateNext($job, $phase, $at);
        $job = $next['job'];
        if ($phase === Phase::INCHIDERE) {
            $job['inchis'] = true;
        }
        $job['phase'] = $next['phase'] ?? $phase;

        return $this->log($job, 'complete', $phase, $next['phase'], $reason, $actor, $at);
    }

    // ── skip ──────────────────────────────────────────────────────────
    /**
     * Kihagyás. Override joggal bármely fázis (indoklással). Munka-joggal
     * csak akkor, ha a kihagyás OBJEKTÍVEN igazolt: nincs végrehajtandó
     * lakatos/fényező sor, vagy saját zsebes munkán a reconstatare.
     * Ezt a szerver ellenőrzi, nem a kliens állítja.
     */
    private function skip(array $job, int $phase, Actor $actor, string $at, string $reason): array
    {
        $justified = ($phase === 4 || $phase === 5) && !PhaseRules::hasExecutableWork($job, $phase)
            || ($phase === 3 && D::isAuto($job));
        if ($justified) {
            $this->need($actor, 'work');
            if ($reason === '') {
                $reason = match ($phase) { 3 => 'auto:no-reconstatare', 4 => 'no_bodywork', default => 'no_paintwork' };
            }
        } else {
            if (!$actor->can('override')) {
                throw new TransitionDenied($actor->can('work') ? 'skip_not_justified' : 'not_allowed', ['need' => 'override']);
            }
            $this->assertReason($reason, self::MIN_REASON);
        }
        if (PhaseRules::status($job, $phase) === Phase::DONE) {
            throw new TransitionDenied('already_done');
        }
        $job = $this->set($job, $phase, Phase::SKIPPED, ['finished' => $at, 'skippedReason' => $reason, 'reason' => $reason], $at);
        $next = $this->activateNext($job, $phase, $at);
        $job = $next['job'];
        $job['phase'] = PhaseRules::currentActivePhase($job);

        return $this->log($job, 'skip', $phase, $next['phase'], $reason, $actor, $at);
    }

    // ── reopen ────────────────────────────────────────────────────────
    private function reopen(array $job, int $phase, Actor $actor, string $at, string $reason): array
    {
        $this->need($actor, 'override');
        $this->assertReason($reason, self::MIN_REASON);
        $job = $this->set($job, $phase, Phase::ACTIVE, ['reopened' => $at, 'reason' => $reason, 'finished' => null], $at);
        // a későbbi fázisok nem maradhatnak „lezárva” egy újranyitott előzmény mögött
        for ($n = $phase + 1; $n <= 7; ++$n) {
            if (PhaseRules::status($job, $n) === Phase::ACTIVE) {
                $job = $this->set($job, $n, Phase::PENDING, [], $at);
            }
        }
        $job['phase'] = $phase;
        $job['inchis'] = false;

        return $this->log($job, 'reopen', $phase, $phase, $reason, $actor, $at);
    }

    // ── rework ────────────────────────────────────────────────────────
    private function reworkOpen(array $job, Actor $actor, string $at, array $a): array
    {
        $this->need($actor, 'work');
        $category = trim((string) ($a['category'] ?? ''));
        $desc = trim((string) ($a['description'] ?? $a['reason'] ?? ''));
        $assigned = trim((string) ($a['assigned_to'] ?? ''));
        $errors = [];
        $target = null;
        if (!\array_key_exists($category, self::REWORK_CATEGORIES)) {
            $errors[] = $category === '' ? 'wf_rw_category' : 'wf_rw_target';
        } else {
            $target = self::REWORK_CATEGORIES[$category];
            if ($target === null) {   // "other": the target phase is chosen on the control page (4 or 5)
                $t = (int) ($a['target_phase'] ?? 0);
                $target = \in_array($t, self::REWORK_OTHER_TARGETS, true) ? $t : null;
                if ($target === null) {
                    $errors[] = 'wf_rw_target';
                }
            }
        }
        if (mb_strlen($desc) < self::MIN_LONG_TEXT) {
            $errors[] = 'wf_rw_desc';
        }
        if ($assigned === '') {
            $errors[] = 'wf_rw_assignee';
        }
        if ($errors !== []) {
            throw new TransitionDenied('rework_invalid', ['missing' => $errors]);
        }
        $rw = [
            'id' => 'rw_'.bin2hex(random_bytes(6)),
            'sourcePhase' => $target,
            'category' => $category,
            'description' => $desc,
            'assignedTo' => $assigned,
            'createdAt' => $at,
            'createdBy' => $actor->name,
            'relatedControlAt' => D::get($job, 'control.lastAt'),
            'status' => 'open',
            'resolvedAt' => null,
            'resolvedBy' => null,
            'resolutionNote' => '',
        ];
        $job['rework'][] = $rw;
        if ($category === 'manager') {
            $job = $this->set($job, 6, Phase::WAITING, ['blockedReason' => 'manager'], $at);
        } else {
            $job = $this->set($job, 6, Phase::BLOCKED, ['blockedReason' => 'rework'], $at);
            $job = $this->set($job, $target, Phase::REWORK, [], $at);
        }

        return $this->log($job, 'rework_create', 6, $target, $desc, $actor, $at);
    }

    private function reworkClose(array $job, Actor $actor, string $at, array $a): array
    {
        $this->need($actor, 'work');
        $id = trim((string) ($a['rework_id'] ?? ''));
        if ($id === '') {
            throw new TransitionDenied('rework_id_required');
        }
        $idx = null;
        foreach ($job['rework'] as $i => $r) {
            if (\is_array($r) && ($r['id'] ?? null) === $id && ($r['status'] ?? 'open') === 'open') {
                $idx = $i;
                break;
            }
        }
        if ($idx === null) {
            throw new TransitionDenied('rework_not_found');
        }
        $by = trim((string) ($a['resolved_by'] ?? $actor->name));
        $note = trim((string) ($a['note'] ?? ''));
        $errors = [];
        if (!D::isRealPerson($by)) {
            $errors[] = $by === '' ? 'wf_rw_resolver' : 'wf_rw_placeholder';
        }
        if ($note === '') {
            $errors[] = 'wf_rw_note';
        }
        if ($errors !== []) {
            throw new TransitionDenied('rework_invalid', ['missing' => $errors]);
        }
        $job['rework'][$idx] = array_merge($job['rework'][$idx], [
            'status' => 'done', 'resolvedAt' => $at, 'resolvedBy' => $by, 'resolutionNote' => $note, 'closedBy' => $actor->name,
        ]);
        $target = (int) ($job['rework'][$idx]['sourcePhase'] ?? 0);
        $stillOpenHere = array_filter(PhaseRules::openReworks($job), static fn ($r) => (int) ($r['sourcePhase'] ?? 0) === $target);
        if ($stillOpenHere === [] && $target >= 1 && $target <= 7 && $target !== 6) {
            $job = $this->set($job, $target, Phase::DONE, ['finished' => $at], $at);
        }
        if (PhaseRules::openReworks($job) === []) {
            // ÚJ kontrollkör: a korábbi „megfelelt” jelölések nem öröklődnek
            $c = D::obj($job['control'] ?? []);
            $c['history'] = D::arr($c['history'] ?? []);
            $c['history'][] = [
                'checks' => $job['controlChecks'] ?? (object) [],
                'note' => $job['controlNote'] ?? '',
                'result' => $c['lastResult'] ?? null,
                'at' => $c['lastAt'] ?? $at,
                'by' => $c['lastBy'] ?? null,
                'reworkIds' => array_values(array_map(static fn ($r) => $r['id'] ?? null,
                    array_filter($job['rework'], static fn ($r) => \is_array($r) && ($r['status'] ?? null) === 'done'))),
            ];
            $c['allDone'] = false;
            $c['lastResult'] = null;
            $job['control'] = $c;
            $job['controlChecks'] = (object) [];
            $job['controlNote'] = '';
            $job = $this->set($job, 6, Phase::ACTIVE, ['blockedReason' => null], $at);
        }
        $job['phase'] = PhaseRules::currentActivePhase($job);

        return $this->log($job, 'rework_resolve', $target, 6, $note, $actor, $at);
    }

    // ── vezetői felülbírálás ──────────────────────────────────────────
    /** Dokumentált kivétel: megnyitja a célfázist, de NEM hamisít befejezettséget. */
    private function override(array $job, int $toPhase, Actor $actor, string $at, array $a): array
    {
        $this->need($actor, 'override');
        $reason = trim((string) ($a['reason'] ?? ''));
        if (mb_strlen($reason) < self::MIN_LONG_TEXT) {
            throw new TransitionDenied('override_invalid', ['missing' => ['wf_override_reason_short']]);
        }
        $from = (int) $job['phase'];
        $job['overrideGrants'][] = ['fromPhase' => $from, 'toPhase' => $toPhase, 'actor' => $actor->name, 'reason' => $reason, 'at' => $at];
        if (PhaseRules::status($job, $toPhase) !== Phase::DONE) {
            $job = $this->set($job, $toPhase, Phase::ACTIVE, ['started' => $at], $at);
            $job['phase'] = $toPhase;
        }

        return $this->log($job, 'override', $from, $toPhase, $reason, $actor, $at);
    }

    // ── segédek ───────────────────────────────────────────────────────
    private function need(Actor $actor, string $cap): void
    {
        if (!$actor->can($cap)) {
            throw new TransitionDenied('not_allowed', ['need' => $cap]);
        }
    }

    private function assertReason(string $reason, int $min): void
    {
        if (mb_strlen($reason) < $min) {
            throw new TransitionDenied('reason_required');
        }
    }

    /**
     * A fázissorrend. A felülbírálási JOG önmagában NEM ugrik át fázist: ehhez
     * kifejezett, indokolt `override` művelet kell (dokumentált kivétel, grant).
     */
    private function assertEnterable(array $job, int $phase, Actor $actor): void
    {
        $e = PhaseRules::canEnter($job, $phase);
        if (!$e['allowed']) {
            $prev = $phase - 1;
            throw new TransitionDenied('prev_not_closed', [
                'prev_phase' => $prev, 'prev_status' => PhaseRules::status($job, $prev), 'reasons' => $e['reasons'],
            ]);
        }
    }

    private function set(array $job, int $phase, string $status, array $extra, string $at): array
    {
        $k = (string) $phase;
        $job['phases'][$k] = array_merge(\is_array($job['phases'][$k] ?? null) ? $job['phases'][$k] : [],
            $extra, ['status' => $status, 'lastChangedAt' => $at]);

        return $job;
    }

    /**
     * A következő fázis aktiválása. Saját zsebes munkán a 3. fázis
     * automatikusan kihagyott (dokumentált okkal), és a 4. indul.
     *
     * @return array{job:array, phase:?int}
     */
    private function activateNext(array $job, int $phase, string $at): array
    {
        $n = $phase + 1;
        while ($n <= 7) {
            if ($n === 3 && D::isAuto($job) && PhaseRules::status($job, 3) !== Phase::DONE) {
                $job = $this->set($job, 3, Phase::SKIPPED, ['skippedReason' => 'auto:no-reconstatare'], $at);
            }
            $st = PhaseRules::status($job, $n);
            if (\in_array($st, Phase::CLOSED_STATES, true)) {
                ++$n;
                continue;
            }
            if ($st === Phase::PENDING) {
                $job = $this->set($job, $n, Phase::ACTIVE, ['started' => $at], $at);
            }

            return ['job' => $job, 'phase' => $n];
        }

        return ['job' => $job, 'phase' => null];
    }

    private function log(array $job, string $action, ?int $from, ?int $to, string $reason, Actor $actor, string $at): array
    {
        $job['workflowHistory'][] = ['action' => $action, 'fromPhase' => $from, 'toPhase' => $to,
            'reason' => $reason, 'actor' => $actor->name, 'at' => $at];

        return $job;
    }
}
