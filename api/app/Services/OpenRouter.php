<?php

declare(strict_types=1);

namespace App\Services;

use App\Ai\Agents\DiscoveryIntent;
use App\Exceptions\GenerationException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Illuminate\Validation\ValidationException;
use Laravel\Ai\Ai;
use Laravel\Ai\Audio;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\PendingResponses\PendingTranscriptionGeneration;
use Laravel\Ai\Providers\OpenRouterProvider;
use Throwable;

class OpenRouter
{
    public function ensureConfigured(): void
    {
        $key = config('ai.providers.openrouter.key');
        if (! is_string($key) || trim($key) === '') {
            throw ValidationException::withMessages(['key' => __('app.connect_your_openrouter_key_in_settings')]);
        }
    }

    private function configureProvider(OpenRouterGateway $gateway): void
    {
        $this->ensureConfigured();
        $provider = Ai::instance('openrouter');
        assert($provider instanceof OpenRouterProvider);
        $provider->useTextGateway($gateway);
        $provider->useTranscriptionGateway($gateway);
        $provider->useAudioGateway($gateway);

    }

    public function models(): array
    {
        return Cache::remember('openrouter.catalog', now()->addMinutes(30), function (): array {
            $all = [];
            foreach (['text', 'transcription', 'speech'] as $modality) {
                $r = Http::timeout(20)->get('https://openrouter.ai/api/v1/models', ['output_modalities' => $modality]);
                if (! $r->successful()) {
                    throw new GenerationException('app.the_model_catalog_is_temporarily_unavailable');
                }

                foreach ($r->json('data', []) as $m) {
                    $all[] = ['id' => $m['id'], 'name' => $m['name'], 'kind' => $modality, 'voices' => $m['supported_voices'] ?? [], 'pricing' => $m['pricing'] ?? []];
                }
            }

            return $all;
        });
    }

    public function checkModel(string $id, string $kind): void
    {
        $disabled = json_decode(DB::table('site_settings')->where('key', 'disabled_models')->value('value') ?? '[]', true);
        if (in_array($id, $disabled, true) || ! collect($this->models())->contains(fn ($m): bool => $m['id'] === $id && $m['kind'] === $kind)) {
            throw ValidationException::withMessages(['model' => __('app.this_model_is_unavailable_or_disabled')]);
        }
    }

    /** @return array{text: string, usage: array<string, mixed>} */
    public function prompt(Agent $agent, string $model, string $prompt): array
    {
        $this->checkModel($model, 'text');
        $this->configureProvider(app(OpenRouterGateway::class));

        try {
            $response = $agent->prompt($prompt, provider: 'openrouter', model: $model, timeout: 90);
        } catch (Throwable) {
            throw new GenerationException('app.ai_generation_failed_check_your_key_credits_and_model_settings');
        }

        if (trim($response->text) === '') {
            throw new GenerationException('app.the_model_returned_no_text');
        }

        $usage = $response->raw instanceof Response ? ($response->raw->json('usage') ?? []) : [
            'prompt_tokens' => $response->usage->inputTokens,
            'completion_tokens' => $response->usage->outputTokens,
            'total_tokens' => $response->usage->totalTokens(),
        ];

        return ['text' => $response->text, 'usage' => $usage];
    }

    public function discoveryIntent(string $model, string $prompt): array
    {
        $this->checkModel($model, 'text');
        $this->configureProvider(app(OpenRouterGateway::class));
        try {
            return (new DiscoveryIntent)->prompt($prompt, provider: 'openrouter', model: $model, timeout: 90)->toArray();
        } catch (Throwable) {
            throw new GenerationException('app.ai_generation_failed_check_your_key_credits_and_model_settings');
        }
    }

    public function transcribe(string $model, PendingTranscriptionGeneration $request, ?string $language = null): array
    {
        $this->checkModel($model, 'transcription');
        $gateway = app(OpenRouterGateway::class);
        $this->configureProvider($gateway);

        try {
            $request->timeout(90)->withProviderOptions(['response_format' => 'verbose_json', 'timestamp_granularities' => ['segment']]);
            if ($language) {
                $request->language($language);
            }

            $response = $request->generate(provider: 'openrouter', model: $model);
            if (trim($response->text) === '' || isset($gateway->responseData['error']) || ($gateway->responseData !== null && ! is_string($gateway->responseData['text'] ?? null))) {
                throw new GenerationException('app.transcription_failed_check_the_selected_model_and_source_audio');
            }

            return $gateway->responseData ?? ['text' => $response->text, 'usage' => $response->usage->toArray()];
        } catch (Throwable) {
            throw new GenerationException('app.transcription_failed_check_the_selected_model_and_source_audio');
        }
    }

    public function speech(string $model, string $voice, string $text): string
    {
        $this->checkModel($model, 'speech');
        $gateway = app(OpenRouterGateway::class);
        $this->configureProvider($gateway);

        try {
            $response = Audio::of($text)->voice($voice)->timeout(90)->generate(provider: 'openrouter', model: $model);
            $bytes = base64_decode($response->audio, true);
            if ($bytes === false || $bytes === '' || $gateway->responseData !== null || str_contains($gateway->responseContentType ?? '', 'json')) {
                throw new GenerationException('app.narration_failed_check_that_the_model_supports_this_voice_and_burmese');
            }

            if ($response->mimeType() === 'audio/pcm') {
                $bytes = $this->pcmToMp3($bytes);
            }

            if (! str_starts_with($bytes, 'ID3') && ! (strlen($bytes) > 1 && ord($bytes[0]) === 255 && (ord($bytes[1]) & 224) === 224)) {
                throw new GenerationException('app.narration_failed_check_that_the_model_supports_this_voice_and_burmese');
            }

            return $bytes;
        } catch (Throwable) {
            throw new GenerationException('app.narration_failed_check_that_the_model_supports_this_voice_and_burmese');
        }
    }

    private function pcmToMp3(string $bytes): string
    {
        $input = tempnam(sys_get_temp_dir(), 'recap-pcm-');
        $output = tempnam(sys_get_temp_dir(), 'recap-mp3-');
        try {
            if ($input === false || $output === false || file_put_contents($input, $bytes) === false) {
                throw new GenerationException('app.narration_failed_check_that_the_model_supports_this_voice_and_burmese');
            }

            $result = Process::timeout(90)->run([config('recap.ffmpeg'), '-y', '-f', 's16le', '-ar', '24000', '-ac', '1', '-i', $input, '-c:a', 'libmp3lame', '-f', 'mp3', $output]);
            if (! $result->successful()) {
                throw new GenerationException('app.narration_failed_check_that_the_model_supports_this_voice_and_burmese');
            }

            return file_get_contents($output);
        } finally {
            if ($input !== false) {
                unlink($input);
            }

            if ($output !== false) {
                unlink($output);
            }
        }
    }
}
