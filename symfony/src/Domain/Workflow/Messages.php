<?php

declare(strict_types=1);

namespace App\Domain\Workflow;

/** Szerver-hibaüzenetek (RO elsődleges, mint a régi rpw__msg) + HU/EN. */
final class Messages
{
    public const SERVER = [
        'not_found' => ['ro' => 'Dosarul nu a fost găsit.', 'hu' => 'A dosszié nem található.', 'en' => 'Job not found.'],
        'unauthorized' => ['ro' => 'Sesiune invalidă sau expirată.', 'hu' => 'Érvénytelen vagy lejárt munkamenet.', 'en' => 'Invalid or expired session.'],
        'bad_phase' => ['ro' => 'Fază invalidă.', 'hu' => 'Érvénytelen fázis.', 'en' => 'Invalid phase.'],
        'bad_action' => ['ro' => 'Acțiune invalidă.', 'hu' => 'Érvénytelen művelet.', 'en' => 'Invalid action.'],
        'bad_request' => ['ro' => 'Cerere invalidă.', 'hu' => 'Érvénytelen kérés.', 'en' => 'Invalid request.'],
        'job_closed' => ['ro' => 'Lucrarea este închisă. Redeschide-o întâi.', 'hu' => 'A munka le van zárva. Előbb nyisd újra.', 'en' => 'The job is closed. Reopen it first.'],
        'not_allowed' => ['ro' => 'Nu ai dreptul pentru această operațiune.', 'hu' => 'Nincs jogod ehhez a művelethez.', 'en' => 'You are not allowed to do this.'],
        'version_conflict' => ['ro' => 'Alt coleg a modificat dosarul între timp. Reîncarcă.', 'hu' => 'Egy kolléga közben módosította a dossziét. Töltsd újra.', 'en' => 'A colleague changed the job meanwhile. Reload.'],
        'expected_version_required' => ['ro' => 'Versiunea dosarului este obligatorie.', 'hu' => 'A dosszié verziója kötelező.', 'en' => 'Job version is required.'],
        'prev_not_closed' => ['ro' => 'Faza anterioară nu este închisă.', 'hu' => 'Az előző fázis nincs lezárva.', 'en' => 'The previous phase is not closed.'],
        'open_rework' => ['ro' => 'Există rework deschis — nu se poate închide.', 'hu' => 'Nyitott rework van — nem zárható le.', 'en' => 'There is an open rework.'],
        'already_done' => ['ro' => 'Faza este deja închisă.', 'hu' => 'A fázis már le van zárva.', 'en' => 'Phase already done.'],
        'already_trashed' => ['ro' => 'Dosarul este deja în coș.', 'hu' => 'A dosszié már a kosárban van.', 'en' => 'Job already in trash.'],
        'reason_required' => ['ro' => 'Motivul este obligatoriu (minim 5 caractere).', 'hu' => 'Az indoklás kötelező (legalább 5 karakter).', 'en' => 'A reason is required (min. 5 characters).'],
        'rework_id_required' => ['ro' => 'Identificatorul reworkului este obligatoriu.', 'hu' => 'A rework azonosítója kötelező.', 'en' => 'Rework id is required.'],
        'rework_not_found' => ['ro' => 'Reworkul nu a fost găsit sau este deja închis.', 'hu' => 'A rework nem található vagy már lezárt.', 'en' => 'Rework not found or already closed.'],
        'rework_invalid' => ['ro' => 'Datele reworkului sunt incomplete.', 'hu' => 'A rework adatai hiányosak.', 'en' => 'Rework data incomplete.'],
        'override_invalid' => ['ro' => 'Override incomplet.', 'hu' => 'Hiányos felülbírálás.', 'en' => 'Incomplete override.'],
        'requirements_missing' => ['ro' => 'Faza nu poate fi închisă.', 'hu' => 'A fázis nem zárható le.', 'en' => 'The phase cannot be closed.'],
        'phase_not_enterable' => ['ro' => 'Faza nu poate fi deschisă încă.', 'hu' => 'A fázis még nem nyitható meg.', 'en' => 'This phase cannot be opened yet.'],
        'skip_not_justified' => ['ro' => 'Faza are lucrări — nu poate fi omisă fără override.', 'hu' => 'A fázisban van munka — felülbírálás nélkül nem hagyható ki.', 'en' => 'The phase has work — cannot be skipped without override.'],
        'protected_workflow_field' => ['ro' => 'Câmpul de workflow poate fi modificat numai prin tranziția de fază.', 'hu' => 'A workflow-mező csak fázisátmenettel módosítható.', 'en' => 'Workflow fields can only change through a phase transition.'],
        'locked' => ['ro' => 'Prea multe încercări. Așteaptă 15 minute.', 'hu' => 'Túl sok próbálkozás. Várj 15 percet.', 'en' => 'Too many attempts. Wait 15 minutes.'],
        'bad_pin' => ['ro' => 'PIN incorect.', 'hu' => 'Hibás PIN.', 'en' => 'Wrong PIN.'],
        'pin_too_short' => ['ro' => 'PIN prea scurt (minim 4 cifre).', 'hu' => 'Túl rövid PIN (legalább 4 számjegy).', 'en' => 'PIN too short (min. 4 digits).'],
        'weak_pin' => ['ro' => 'PIN prea simplu — nu folosi un an, cifre identice sau consecutive.', 'hu' => 'Túl egyszerű PIN — ne évszám, azonos vagy egymást követő számjegy legyen.', 'en' => 'PIN too simple.'],
        'pin_taken' => ['ro' => 'PIN-ul e deja folosit de un coleg.', 'hu' => 'Ezt a PIN-t egy kolléga már használja.', 'en' => 'PIN already used by a colleague.'],
        'unknown_reason' => ['ro' => 'Motiv necunoscut.', 'hu' => 'Ismeretlen ok.', 'en' => 'Unknown reason.'],
    ];

    public static function server(string $code, string $lang = 'ro'): string
    {
        $m = self::SERVER[$code] ?? null;

        return $m === null ? 'Operațiunea a fost respinsă.' : ($m[$lang] ?? $m['ro']);
    }
}
