<?php

declare(strict_types=1);

namespace App\Ai\Gateways;

use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Laravel\Ai\Gateway\OpenRouter\OpenRouterGateway as SdkOpenRouterGateway;
use Laravel\Ai\Providers\Provider;

/**
 * Preserve provider metadata unavailable on SDK audio and transcription responses,
 * and keep voice IDs selected from the model catalog unchanged.
 */
class OpenRouterGateway extends SdkOpenRouterGateway
{
    /** @var array<string, mixed>|null */
    public ?array $responseData = null;

    public ?string $responseContentType = null;

    protected function client(Provider $provider, ?int $timeout = null): PendingRequest
    {
        return parent::client($provider, $timeout)->connectTimeout(15)
            ->afterResponse(function (Response $response): void {
                $this->responseContentType = $response->header('Content-Type');
                $data = $response->json();
                $this->responseData = is_array($data) ? $data : null;
            });
    }

    protected function resolveVoice(string $model, string $voice): string
    {
        return $voice;
    }
}
