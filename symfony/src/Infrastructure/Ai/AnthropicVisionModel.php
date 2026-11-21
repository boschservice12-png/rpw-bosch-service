<?php

declare(strict_types=1);

namespace App\Infrastructure\Ai;

use Anthropic\Client;
use Anthropic\Core\Exceptions\APIConnectionException;
use Anthropic\Core\Exceptions\APIStatusException;
use Anthropic\Core\Exceptions\RateLimitException;
use Psr\Log\LoggerInterface;

/**
 * Claude a hivatalos PHP SDK-n át (anthropic-ai/sdk).
 *
 *  · MODELL: a projekt korábbi, dokumentált döntése (`claude-sonnet-5`, a
 *    functions/ocr.js fejléce) — RPW_AI_MODEL felülírja.
 *  · GONDOLKODÁS KI: egy talon leolvasása nem igényel gondolkodást; a
 *    Sonnet 5 a `disabled` beállítást elfogadja. (Más modellnél — pl. Opus 5.5 —
 *    ez 400-at adna: ott a `thinking` mezőt el kell hagyni.)
 *  · STRUKTURÁLT KIMENET: az API garantálja, hogy a válasz a sémának megfelelő
 *    JSON — a mezőnevek nem csúszhatnak el a felület által várttól.
 *  · Az API-kulcs CSAK a szerveren (ANTHROPIC_API_KEY); a kliens soha nem látja.
 */
final class AnthropicVisionModel implements VisionModel
{
    public const DEFAULT_MODEL = 'claude-sonnet-5';

    private ?Client $client = null;

    public function __construct(
        private readonly LoggerInterface $logger,
        private readonly ?string $apiKey = null,
        private readonly ?string $modelId = null,
    ) {
    }

    public function model(): string
    {
        return $this->modelId !== null && $this->modelId !== '' ? $this->modelId : self::DEFAULT_MODEL;
    }

    public function configured(): bool
    {
        return $this->apiKey !== null && $this->apiKey !== '';
    }

    public function extract(array $media, string $prompt, array $schema, int $maxTokens): array
    {
        if (!$this->configured()) {
            return ['ok' => false, 'error' => 'not_configured'];
        }
        $this->client ??= new Client(apiKey: $this->apiKey, requestOptions: ['timeout' => 60.0, 'maxRetries' => 2]);
        $model = $this->model();
        try {
            $message = $this->client->messages->create(
                model: $model,
                maxTokens: $maxTokens,
                // a Sonnet 5 a kikapcsolt gondolkodást elfogadja; más modellnél a mező elhagyandó
                thinking: $model === self::DEFAULT_MODEL ? ['type' => 'disabled'] : null,
                outputConfig: ['format' => ['type' => 'json_schema', 'schema' => $schema]],
                messages: [['role' => 'user', 'content' => [$media, ['type' => 'text', 'text' => $prompt]]]],
            );
        } catch (RateLimitException $e) {
            $this->logger->warning('AI: rate limit', ['msg' => $e->getMessage()]);

            return ['ok' => false, 'error' => 'ai_busy'];
        } catch (APIStatusException $e) {
            $this->logger->error('AI: API-hiba', ['type' => $e->type?->value, 'msg' => $e->getMessage()]);

            return ['ok' => false, 'error' => 'ai_unavailable'];
        } catch (APIConnectionException $e) {
            $this->logger->error('AI: kapcsolódási hiba', ['msg' => $e->getMessage()]);

            return ['ok' => false, 'error' => 'ai_unavailable'];
        }
        if ($message->stopReason === 'refusal') {
            return ['ok' => false, 'error' => 'ai_refused'];
        }
        if ($message->stopReason === 'max_tokens') {
            return ['ok' => false, 'error' => 'ai_truncated'];
        }
        foreach ($message->content as $block) {
            if ($block->type === 'text') {
                $data = json_decode($block->text, true);

                return \is_array($data) ? ['ok' => true, 'data' => $data] : ['ok' => false, 'error' => 'ai_invalid_json'];
            }
        }

        return ['ok' => false, 'error' => 'ai_empty'];
    }
}
