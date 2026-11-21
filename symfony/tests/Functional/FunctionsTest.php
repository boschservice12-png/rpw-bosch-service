<?php

declare(strict_types=1);

namespace App\Tests\Functional;

use App\Tests\Support\FakeHttp;

final class FunctionsTest extends ApiTestCase
{
    private function fn(string $name, array $body, ?string $token): array
    {
        $h = ['CONTENT_TYPE' => 'application/json'] + ($token ? ['HTTP_AUTHORIZATION' => 'Bearer '.$token] : []);
        $this->client->request('POST', '/.netlify/functions/'.$name, [], [], $h, json_encode($body));

        return [$this->client->getResponse()->getStatusCode(), json_decode((string) $this->client->getResponse()->getContent(), true)];
    }

    public function testFunctionsRequireLoginAndWork(): void
    {
        [$s, $ids] = $this->shop('A', ['receptie' => ['Rita Recepție', '4826']]);
        $t = $this->login($s, $ids['receptie'], '4826');
        self::assertSame(401, $this->fn('ocr', ['image' => '/9j/AAAA', 'type' => 'talon'], null)[0], 'belépés nélkül nincs fizetős AI-hívás');

        [$st, $b] = $this->fn('ocr', ['image' => '/9j/AAAA', 'type' => 'talon'], $t);
        self::assertSame(200, $st);
        self::assertSame('x-brand', json_decode($b['result'], true)['brand']);
        [$st, $b] = $this->fn('classify', ['image' => '/9j/AAAA'], $t);
        self::assertSame([200, 'constatare_amiabila'], [$st, $b['type']]);

        [$st, $b] = $this->fn('sendmail', ['to' => 'asig@example.com', 'subject' => "Dosar\r\nBcc: x@y.z", 'text' => 'ok',
            'attachments' => [['filename' => '../dosar.pdf', 'content' => 'JVBERi0x']]], $t);
        self::assertSame([200, 'msg_test_1'], [$st, $b['id']]);
        $sent = end(FakeHttp::$sent)['body'];
        self::assertStringNotContainsString("\n", $sent['subject'], 'fejléc-injektálás kizárva');
        self::assertSame('..dosar.pdf', $sent['attachments'][0]['filename'], 'útvonal nélkül (a régi függvénnyel azonosan)');
        self::assertSame(400, $this->fn('sendmail', ['to' => 'nem-email', 'subject' => 'x'], $t)[0]);
        self::assertSame(400, $this->fn('sendmail', ['to' => 'a@b.ro', 'subject' => 'x', 'attachments' => [['filename' => 'virus.exe', 'content' => 'TVqQ']]], $t)[0]);

        $actions = $this->db->fetchFirstColumn("SELECT action FROM rpw_audit WHERE action LIKE 'fn:%' ORDER BY id");
        self::assertSame(['fn:ocr', 'fn:classify', 'fn:sendmail', 'fn:sendmail:failed', 'fn:sendmail:failed'], $actions);
    }
}
