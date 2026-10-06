<?php

namespace App\Services;

use App\Models\Credential;
use App\Models\User;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Validation\ValidationException;
use RuntimeException;

class OpenRouter
{
    public function client(User $user): PendingRequest
    {
        $credential = Credential::where('user_id', $user->id)->where('provider', 'openrouter')->first();
        if (! $credential) {
            throw ValidationException::withMessages(['key' => 'Connect your OpenRouter key in Settings.']);
        }

        return Http::baseUrl('https://openrouter.ai/api/v1')->withToken($credential->secret)->acceptJson()->timeout(90)->connectTimeout(15)->withHeaders(['HTTP-Referer' => config('recap.frontend_url'), 'X-Title' => 'Ricapilo']);
    }

    public function models(): array
    {
        return Cache::remember('openrouter.catalog', now()->addMinutes(30), function (): array {
            $all = [];
            foreach (['text', 'transcription', 'speech'] as $modality) {
                $r = Http::timeout(20)->get('https://openrouter.ai/api/v1/models', ['output_modalities' => $modality]);
                if (! $r->successful()) {
                    throw new RuntimeException('The model catalog is temporarily unavailable.');
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
            throw ValidationException::withMessages(['model' => 'This model is unavailable or disabled.']);
        }
    }

    public function chat(User $user, string $model, array $messages): array
    {
        $this->checkModel($model, 'text');
        $r = $this->client($user)->post('/chat/completions', ['model' => $model, 'messages' => $messages, 'max_tokens' => 4000]);
        if (! $r->successful()) {
            throw new RuntimeException('AI generation failed. Check your key, credits, and model settings.');
        }

        $text = $r->json('choices.0.message.content');
        if (! is_string($text) || trim($text) === '') {
            throw new RuntimeException('The model returned no text.');
        }

        return ['text' => $text, 'usage' => $r->json('usage', [])];
    }

    public function transcribe(User $user, string $model, string $bytes, string $format, ?string $language = null): array
    {
        $this->checkModel($model, 'transcription');
        $body = ['model' => $model, 'input_audio' => ['data' => base64_encode($bytes), 'format' => $format], 'response_format' => 'verbose_json', 'timestamp_granularities' => ['segment']];
        if ($language) {
            $body['language'] = $language;
        }

        $r = $this->client($user)->post('/audio/transcriptions', $body);
        if (! $r->successful() || ! is_string($r->json('text'))) {
            throw new RuntimeException('Transcription failed. Check the selected model and source audio.');
        }

        return $r->json();
    }

    public function speech(User $user, string $model, string $voice, string $text): string
    {
        $this->checkModel($model, 'speech');
        $r = $this->client($user)->post('/audio/speech', ['model' => $model, 'voice' => $voice, 'input' => $text, 'response_format' => 'mp3']);
        if (! $r->successful() || str_contains($r->header('Content-Type') ?? '', 'json')) {
            throw new RuntimeException('Narration failed. Check that the model supports this voice and Burmese.');
        }

        return $r->body();
    }
}
