<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Application\DocumentAi;
use App\Tests\Support\FakeVisionModel;
use PHPUnit\Framework\TestCase;

final class DocumentAiTest extends TestCase
{
    private const JPEG = '/9j/4AAQSkZJRgABAQ';
    private const PDF = 'JVBERi0xLjQK';

    /**
     * SZERZŐDÉS: a séma minden mezőjét a felület TÉNYLEGESEN olvassa (`p.<mező>`).
     * A régi függvényben ez nem így volt — a talon fele, a kárlista és az
     * Audatex-órák csendben elvesztek. Ez a teszt a valódi oldalakat nézi.
     */
    public function testSchemaFieldsAreExactlyWhatThePagesRead(): void
    {
        $root = \dirname(__DIR__, 3);
        $pages = ['talon' => 'rpw-recepcio-red.html', 'buletin' => 'rpw-recepcio-red.html',
            'constatare' => 'rpw-recepcio-red.html', 'audatex' => 'rpw-evaluare-red.html'];
        foreach ($pages as $type => $page) {
            $html = (string) file_get_contents($root.'/'.$page);
            foreach (array_keys(DocumentAi::schema($type)['properties']) as $field) {
                self::assertStringContainsString('p.'.$field, $html, "$type.$field: a $page nem olvassa");
            }
        }
        // a lista a felület által várt TELJES készlet (a régi hibás nevek nincsenek benne)
        self::assertSame(['plate', 'vin', 'brand', 'model', 'year', 'capacitate', 'owner'], array_keys(DocumentAi::schema('talon')['properties']));
        self::assertArrayNotHasKey('marca', DocumentAi::schema('talon')['properties']);
        self::assertArrayHasKey('ore_tinichigerie', DocumentAi::schema('audatex')['properties']);
    }

    public function testSchemasAreStrictForStructuredOutputs(): void
    {
        foreach (DocumentAi::OCR_TYPES as $t) {
            $s = DocumentAi::schema($t);
            self::assertFalse($s['additionalProperties']);
            self::assertSame(array_keys($s['properties']), $s['required']);
        }
    }

    public function testOcrBuildsImageOrDocumentBlockAndReturnsOldShape(): void
    {
        $ai = new DocumentAi(new FakeVisionModel());
        $r = $ai->ocr('data:image/jpeg;base64,'.self::JPEG, 'talon');
        self::assertSame(200, $r['status']);
        $call = end(FakeVisionModel::$calls);
        self::assertSame(['type' => 'base64', 'mediaType' => 'image/jpeg', 'data' => self::JPEG], $call['media']['source']);
        self::assertStringContainsString('talon auto romanesc', $call['prompt'], 'a prompt szó szerint a régi');
        $parsed = json_decode($r['body']['result'], true);
        self::assertSame('x-brand', $parsed['brand'], 'a felület JSON.parse(data.result)-ot olvas');
        self::assertTrue($r['body']['uncertain']['vin']['ok']);
        self::assertTrue($r['body']['needsHumanReview']);

        $ai->ocr(self::PDF, 'audatex');
        $call = end(FakeVisionModel::$calls);
        self::assertSame('document', $call['media']['type']);
        self::assertSame('application/pdf', $call['media']['source']['mediaType']);
    }

    public function testRejectsUnknownFormatsAndTypes(): void
    {
        $ai = new DocumentAi(new FakeVisionModel());
        self::assertSame(415, $ai->ocr('SGVsbG8=', 'talon')['status'], 'ismeretlen formátum nem megy az AI-hoz');
        self::assertSame(400, $ai->ocr(self::JPEG, 'útlevél')['status']);
        self::assertSame(400, $ai->classify(self::PDF)['status'], 'besorolás csak képre');
    }

    public function testAiFailuresAreNotSuccess(): void
    {
        $ai = new DocumentAi(new FakeVisionModel());
        FakeVisionModel::$next = ['ok' => false, 'error' => 'not_configured'];
        self::assertSame(503, $ai->ocr(self::JPEG, 'talon')['status']);
        FakeVisionModel::$next = ['ok' => false, 'error' => 'ai_invalid_json'];
        self::assertSame(502, $ai->ocr(self::JPEG, 'talon')['status']);
        FakeVisionModel::$next = ['ok' => false, 'error' => 'ai_refused'];
        self::assertSame(422, $ai->classify(self::JPEG)['status']);
    }

    public function testClassifyValidation(): void
    {
        self::assertSame('talon_fata', DocumentAi::validateClassify(['type' => 'talon', 'confidence' => 0.9])['type'], 'régi név alias');
        self::assertSame('altceva', DocumentAi::validateClassify(['type' => 'pizza', 'confidence' => 0.99])['type']);
        self::assertSame(0.0, DocumentAi::validateClassify(['type' => 'buletin', 'confidence' => 7])['confidence']);
    }
}
