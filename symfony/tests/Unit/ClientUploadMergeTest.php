<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Application\ClientUploadService;
use PHPUnit\Framework\TestCase;

/** 2026-11-23 (AUDIT-SYMFONY-LOCALHOST §4): the client link may add its own files — never overwrite the staff's. */
final class ClientUploadMergeTest extends TestCase
{
    private const J = 'RPW-11111111-2222-3333-4444-555555555555';

    private static function e(string $key, string $src = 'whatsapp', ?string $job = null): array
    {
        return ['key' => $key, 'path' => ($job ?? self::J).'/'.$key.'.jpg', 'name' => $key.'.jpg', 'src' => $src];
    }

    public function testStaffEntriesInASlotSurviveTheClientPatch(): void
    {
        $data = ['dosarActe' => ['talon' => [self::e('acta_talon_1', 'staff'), self::e('acta_talon_2')]]];
        // the client page sends the slot back with only its own new file (non-multi slot: arr = [])
        $r = ClientUploadService::mergeClientPatch($data, ['dosarActe' => ['talon' => [self::e('acta_talon_3')]]], self::J);
        $paths = array_column($r['data']['dosarActe']['talon'], 'path');
        self::assertSame([self::J.'/acta_talon_1.jpg', self::J.'/acta_talon_3.jpg'], $paths, 'staff kept, client entry replaced');
    }

    public function testStaffEntrySentBackByTheClientIsNotDuplicatedOrRetagged(): void
    {
        $staff = self::e('acta_talon_1', 'staff');
        $r = ClientUploadService::mergeClientPatch(['dosarActe' => ['talon' => [$staff]]], ['dosarActe' => ['talon' => [$staff, self::e('acta_talon_9')]]], self::J);
        $slot = $r['data']['dosarActe']['talon'];
        self::assertCount(2, $slot);
        self::assertSame('staff', $slot[0]['src']);
    }

    public function testForgedEntriesAreDropped(): void
    {
        $bad = [
            self::e('acta_x', 'whatsapp', 'RPW-99999999-2222-3333-4444-555555555555'),  // another job's file
            ['path' => self::J.'/foto_1.jpg'],                                         // not an acta_ file
            ['path' => self::J.'/acta_../../etc'],                                     // path trick
            'string-entry',
        ];
        $r = ClientUploadService::mergeClientPatch([], ['dosarActe' => ['talon' => $bad]], self::J);
        self::assertSame([], $r['data']['dosarActe']['talon']);
        $ok = ClientUploadService::mergeClientPatch([], ['dosarActe' => ['talon' => [self::e('acta_t') + ['src' => 'staff']]]], self::J);
        self::assertSame('whatsapp', $ok['data']['dosarActe']['talon'][0]['src'], 'src is forced to whatsapp');
        self::assertSame('bad_request', ClientUploadService::mergeClientPatch([], ['dosarActe' => ['bad slot!' => []]], self::J)['error']);
    }

    public function testClientUploadsAreAppendOnly(): void
    {
        $data = ['clientUploads' => [self::e('client_1')]];
        $r = ClientUploadService::mergeClientPatch($data, ['clientUploads' => [self::e('client_2'), self::e('client_2')]], self::J);
        self::assertSame([self::J.'/client_1.jpg', self::J.'/client_2.jpg'], array_column($r['data']['clientUploads'], 'path'), 'an empty/short list deletes nothing, duplicates merge');
        $r = ClientUploadService::mergeClientPatch($data, ['clientUploads' => []], self::J);
        self::assertCount(1, $r['data']['clientUploads']);
    }

    public function testClientGataIsValidated(): void
    {
        self::assertSame(['at' => '2026-11-23T10:00:00Z', 'files' => 3],
            ClientUploadService::mergeClientPatch([], ['clientGata' => ['at' => '2026-11-23T10:00:00Z', 'files' => 3, 'inchis' => true]], self::J)['data']['clientGata']);
        self::assertSame('bad_request', ClientUploadService::mergeClientPatch([], ['clientGata' => ['at' => str_repeat('x', 41), 'files' => 1]], self::J)['error']);
        self::assertSame('bad_request', ClientUploadService::mergeClientPatch([], ['clientGata' => ['at' => 'x', 'files' => -1]], self::J)['error']);
    }
}
