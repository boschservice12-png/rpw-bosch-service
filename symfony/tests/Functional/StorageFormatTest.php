<?php

declare(strict_types=1);

namespace App\Tests\Functional;

/**
 * Csak VALÓDI JPG és PDF kerülhet a fotótárba — ezt kéri a biztosító, az e-mail és az Audatex
 * (Ferenc, 2026-11-22). A név nem elég: a helyi tár a bájtokat is megnézi.
 */
final class StorageFormatTest extends ApiTestCase
{
    private function rpc(string $fn, array $args): array
    {
        $this->client->request('POST', '/rest/v1/rpc/'.$fn, [], [], ['CONTENT_TYPE' => 'application/json'], json_encode($args));

        return json_decode((string) $this->client->getResponse()->getContent(), true) ?? [];
    }

    private function gw(array $body, ?string $tok = null): array
    {
        $h = ['CONTENT_TYPE' => 'application/json'] + ($tok ? ['HTTP_X_RPW_TOKEN' => $tok] : []);
        $this->client->request('POST', '/functions/v1/rpw-storage', [], [], $h, json_encode($body));

        return [$this->client->getResponse()->getStatusCode(), json_decode((string) $this->client->getResponse()->getContent(), true)];
    }

    private function put(string $path, string $token, string $bytes): int
    {
        $this->client->request('PUT', '/storage/v1/object/upload/sign/rpw-photos/'.$path.'?token='.$token, [], [], ['CONTENT_TYPE' => 'image/jpeg'], $bytes);

        return $this->client->getResponse()->getStatusCode();
    }

    public function testOnlyRealJpgAndPdf(): void
    {
        [$a, $ia] = $this->shop('A', ['admin' => ['Ana Admin', '4826']]);
        $t = $this->rpc('rpw2_login', ['p_shop_id' => $a, 'p_employee_id' => $ia['admin'], 'p_pin' => '4826'])['token'];
        $id = 'RPW-2b6c3f0e-1a2b-4c3d-9e8f-0123456789ab';
        $this->rpc('rpw_patch_v3', ['p_token' => $t, 'p_id' => $id, 'p_patch' => ['client' => 'X']]);

        foreach (['ov_0.png', 'ov_0.heic', 'ov_0.webp', 'acte/x.docx', 'x.html'] as $bad) {
            self::assertSame(400, $this->gw(['op' => 'sign-upload', 'path' => "$id/$bad"], $t)[0], "elutasítva: $bad");
        }
        self::assertSame(400, $this->gw(['op' => 'client-sign-upload', 'path' => "$id/client_1732200000000_ab12.heic"])[0]);

        $jpeg = "\xFF\xD8\xFF\xE0".random_bytes(60);
        $png = "\x89PNG\r\n\x1a\n".random_bytes(60);
        [, $j] = $this->gw(['op' => 'sign-upload', 'path' => "$id/ov_0.jpg"], $t);
        self::assertSame(415, $this->put("$id/ov_0.jpg", $j['token'], $png), 'PNG „.jpg” néven: elutasítva');
        self::assertSame(200, $this->put("$id/ov_0.jpg", $j['token'], $jpeg), 'valódi JPG: elfogadva');

        [, $p] = $this->gw(['op' => 'sign-upload', 'path' => "$id/deviz_file.pdf"], $t);
        self::assertSame(415, $this->put("$id/deviz_file.pdf", $p['token'], $jpeg));
        self::assertSame(200, $this->put("$id/deviz_file.pdf", $p['token'], '%PDF-1.7 '.random_bytes(30)));
    }
}
