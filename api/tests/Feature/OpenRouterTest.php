<?php

namespace Tests\Feature;

use App\Ai\Agents\AssistantChat;
use App\Ai\Agents\DiscoveryIntent;
use App\Ai\Agents\RecapWriter;
use App\Ai\OpenRouter;
use App\Exceptions\GenerationException;
use App\Jobs\ProcessProject;
use App\Models\Assistant;
use App\Models\Project;
use App\Models\User;
use App\Services\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Laravel\Ai\Ai;
use Laravel\Ai\Audio;
use Laravel\Ai\Exceptions\InsufficientCreditsException;
use Laravel\Ai\Messages\Message;
use Laravel\Ai\Prompts\AgentPrompt;
use Laravel\Ai\Prompts\AudioPrompt;
use Laravel\Ai\Prompts\TranscriptionPrompt;
use Laravel\Ai\Transcription;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class OpenRouterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        Http::preventStrayRequests();
        Http::fake(['*/models*' => Http::response(['data' => [
            ['id' => 'test/chat', 'name' => 'Chat'],
            ['id' => 'test/stt', 'name' => 'Transcriber'],
            ['id' => 'test/tts', 'name' => 'Voice'],
            ['id' => 'google/gemini-tts', 'name' => 'Gemini voice'],
        ]])]);
    }

    private function userWithKey(string $key = 'test-user-key'): User
    {
        $user = User::factory()->create();
        config(['ai.providers.openrouter.key' => $key]);
        Ai::forgetInstance('openrouter');

        return $user;
    }

    private function configuredService(string $key = 'test-user-key'): OpenRouter
    {
        $this->userWithKey($key);

        return app(OpenRouter::class);
    }

    private function uploadedAudio(): UploadedFile
    {
        $pcm = str_repeat("\0", 48);
        $wav = 'RIFF'.pack('V', 36 + strlen($pcm)).'WAVEfmt '.pack('VvvVVvv', 16, 1, 1, 24000, 48000, 2, 16).'data'.pack('V', strlen($pcm)).$pcm;

        return UploadedFile::fake()->createWithContent('voice.wav', $wav);
    }

    public function test_transport_preserves_message_order_models_headers_and_usage(): void
    {
        $messages = [
            ['role' => 'system', 'content' => 'Respond only in Burmese. Be concise.'],
            ['role' => 'user', 'content' => 'First'],
            ['role' => 'assistant', 'content' => 'Previous answer'],
            ['role' => 'user', 'content' => 'Next'],
        ];
        $usage = ['prompt_tokens' => 10, 'completion_tokens' => 5, 'total_tokens' => 15, 'cost' => 0.01];
        Http::fake(['*/chat/completions' => Http::response([
            'choices' => [['message' => ['content' => 'မင်္ဂလာပါ']]],
            'usage' => $usage,
        ])]);
        foreach (['first-key', 'second-key'] as $key) {
            $history = [new Message('user', 'First'), new Message('assistant', 'Previous answer')];
            $result = $this->configuredService($key)
                ->prompt(new AssistantChat('Be concise.', $history), 'test/chat', 'Next');
            $this->assertSame(['text' => 'မင်္ဂလာပါ', 'usage' => $usage], $result);
            Http::assertSent(fn (Request $request): bool => $request->hasHeader('Authorization', 'Bearer '.$key)
                && $request->hasHeader('HTTP-Referer', config('recap.frontend_url'))
                && $request->hasHeader('X-OpenRouter-Title', config('ai.providers.openrouter.x_title'))
                && $request['model'] === 'test/chat'
                && $request['messages'] === $messages
                && $request['max_tokens'] === 4000);
        }
    }

    public function test_transcription_returns_text_and_original_format_with_configured_key(): void
    {
        $data = [
            'text' => 'မင်္ဂလာပါ',
            'language' => 'my',
            'duration' => 1.2,
            'segments' => [['id' => 0, 'start' => 0, 'end' => 1.2, 'text' => 'မင်္ဂလာပါ']],
            'usage' => ['seconds' => 1.2, 'cost' => 0.002],
        ];
        Http::fake(['*/audio/transcriptions' => Http::response($data)]);
        foreach (['webm', 'm4a', 'mp3', 'wav', 'ogg'] as $format) {
            $key = 'key-'.$format;
            $mimeType = match ($format) {
                'mp3' => 'audio/mpeg', 'm4a' => 'audio/mp4', default => 'audio/'.$format
            };
            $audio = Transcription::fromBase64(base64_encode('source-audio'), $mimeType);
            $this->assertSame('မင်္ဂလာပါ', $this->configuredService($key)->transcribe('test/stt', $audio, 'my')['text']);
            Http::assertSent(fn (Request $request): bool => $request->hasHeader('Authorization', 'Bearer '.$key)
                && $request['model'] === 'test/stt'
                && $request['language'] === 'my'
                && $request['input_audio'] === ['data' => base64_encode('source-audio'), 'format' => $format]
                && $request->hasHeader('X-OpenRouter-Title', config('ai.providers.openrouter.x_title')));
        }
    }

    public function test_speech_keeps_exact_voice_mp3_bytes_and_configured_keys(): void
    {
        Http::fake(['*/audio/speech' => Http::response('ID3mp3-bytes', 200, ['Content-Type' => 'audio/mpeg'])]);
        foreach (['first', 'second'] as $key) {
            $this->assertSame('ID3mp3-bytes', $this->configuredService($key)->speech('test/tts', 'nova', 'မင်္ဂလာပါ'));
            Http::assertSent(fn (Request $request): bool => $request->hasHeader('Authorization', 'Bearer '.$key)
                && $request['model'] === 'test/tts'
                && $request['voice'] === 'nova'
                && $request['response_format'] === 'mp3'
                && $request->hasHeader('HTTP-Referer', config('recap.frontend_url')));
        }
    }

    public function test_sequential_script_jobs_resolve_current_credentials_without_leaking_usage(): void
    {
        Http::fake(['*/chat/completions' => Http::sequence()
            ->push(['choices' => [['message' => ['content' => 'First recap']]], 'usage' => ['cost' => 0.01]])
            ->push(['choices' => [['message' => ['content' => 'Second recap']]]])]);
        $service = app(OpenRouter::class);
        foreach (['one', 'two'] as $key) {
            $user = $this->userWithKey('old-'.$key);
            $assistant = Assistant::factory()->create(['user_id' => $user->id]);
            $project = Project::factory()->create(['user_id' => $user->id, 'assistant_id' => $assistant->id]);
            $job = unserialize(serialize(new ProcessProject($project->id, 'script')));
            config(['ai.providers.openrouter.key' => $key]);
            Ai::forgetInstance('openrouter');
            $job->handle($service, app(Media::class));
            $this->assertSame('script_ready', $project->fresh()->status);
            $this->assertSame($key === 'one' ? ['cost' => 0.01] : [], $project->fresh()->usage[0]['usage']);
            Http::assertSent(fn (Request $request) => $request->hasHeader('Authorization', 'Bearer '.$key));
        }
    }

    public function test_voice_talk_transcription_preview_and_continuation_use_sdk_fakes(): void
    {
        $user = $this->userWithKey();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        AssistantChat::fake(['First answer', 'Second answer'])->preventStrayPrompts();
        Transcription::fake(['Voice question', 'Uploaded transcript'])->preventStrayTranscriptions();
        Audio::fake([base64_encode('ID3spoken'), base64_encode('ID3preview')])->preventStrayAudio();
        $this->actingAs($user);
        $first = $this->post('/api/v1/talk', [
            'assistant_id' => $assistant->id,
            'audio' => $this->uploadedAudio(),
            'speak' => true,
        ]);
        $first->assertOk()->assertJsonPath('audio', base64_encode('ID3spoken'))->assertJsonPath('text', 'First answer');
        $id = $first->json('conversation.id');
        $this->postJson('/api/v1/talk', [
            'assistant_id' => $assistant->id,
            'conversation_id' => $id,
            'text' => 'Follow up',
        ])
            ->assertOk()
            ->assertJsonCount(4, 'conversation.messages');
        AssistantChat::assertPrompted(fn (AgentPrompt $prompt): bool => $prompt->prompt === 'Follow up'
            && count($prompt->agent->messages()) === 2);
        $this->post('/api/v1/transcribe', ['assistant_id' => $assistant->id, 'audio' => $this->uploadedAudio()])
            ->assertOk()
            ->assertJsonPath('text', 'Uploaded transcript');
        $this->postJson('/api/v1/assistants/'.$assistant->id.'/preview')
            ->assertOk()
            ->assertJsonPath('audio', base64_encode('ID3preview'));
        Transcription::assertGenerated(fn (TranscriptionPrompt $prompt): bool => $prompt->language === 'my'
            && $prompt->model === 'test/stt');
        Audio::assertGenerated(fn (AudioPrompt $prompt): bool => $prompt->voice === 'test-voice'
            && $prompt->model === 'test/tts');
    }

    public function test_gemini_pcm_is_converted_to_mp3_and_temporary_files_are_removed(): void
    {
        Http::fake(['*/audio/speech' => Http::response(str_repeat("\0", 48), 200, ['Content-Type' => 'audio/pcm'])]);
        $paths = [];
        Process::fake(function ($process) use (&$paths) {
            $command = $process->command;
            $this->assertSame(['-f', 's16le', '-ar', '24000', '-ac', '1'], array_slice($command, 2, 6));
            $paths = [$command[9], $command[count($command) - 1]];
            file_put_contents($paths[1], 'ID3converted');

            return Process::result();
        });
        $this->assertSame('ID3converted', $this->configuredService()->speech('google/gemini-tts', 'Kore', 'Hello'));
        Http::assertSent(fn (Request $request): bool => str_contains($request->url(), 'audio/speech')
            && $request['response_format'] === 'pcm'
            && $request['voice'] === 'Kore');
        foreach ($paths as $path) {
            $this->assertFileDoesNotExist($path);
        }
    }

    public function test_pcm_conversion_failure_is_localized_and_cleans_up_files(): void
    {
        Http::fake(['*/audio/speech' => Http::response(str_repeat("\0", 48), 200, ['Content-Type' => 'audio/pcm'])]);
        $paths = [];
        Process::fake(function ($process) use (&$paths) {
            $paths = [$process->command[9], $process->command[count($process->command) - 1]];

            return Process::result(exitCode: 1);
        });
        try {
            $this->configuredService()->speech('google/gemini-tts', 'Kore', 'Hello');
            $this->fail('Conversion must fail.');
        } catch (GenerationException $generationException) {
            $this->assertSame('app.narration_audio_conversion_failed', $generationException->getMessage());
        }

        foreach ($paths as $path) {
            $this->assertFileDoesNotExist($path);
        }
    }

    public function test_narration_job_uses_sdk_audio_and_preserves_output_and_captions(): void
    {
        Storage::fake('local');
        Audio::fake([base64_encode('ID3paragraph')])->preventStrayAudio();
        $user = $this->userWithKey();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $project = Project::factory()->create([
            'user_id' => $user->id,
            'assistant_id' => $assistant->id,
            'script' => 'မင်္ဂလာပါ။',
        ]);
        $media = $this->mock(Media::class);
        $media->shouldReceive('duration')->once()->andReturn(2.0);
        $media->shouldReceive('concat')
            ->once()
            ->andReturnUsing(fn (array $paths, string $output): int|false => file_put_contents($output, 'ID3narration'));
        (new ProcessProject($project->id, 'audio'))->handle(app(OpenRouter::class), $media);
        $project->refresh();
        $this->assertSame('audio_ready', $project->status);
        $this->assertSame('ID3narration', Storage::disk('local')->get($project->audio_path));
        $this->assertSame(2000, $project->captions[0]['endMs']);
        Audio::assertGenerated(fn (AudioPrompt $prompt): bool => $prompt->model === 'test/tts'
            && $prompt->voice === 'test-voice');
    }

    public function test_script_job_transcribes_source_chunks_before_generating_recap(): void
    {
        Storage::fake('local');
        $user = $this->userWithKey();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $project = Project::factory()->create([
            'user_id' => $user->id,
            'assistant_id' => $assistant->id,
            'transcript' => null,
        ]);
        Storage::disk('local')->put('chunk.mp3', 'source audio');
        $chunk = Storage::disk('local')->path('chunk.mp3');
        $media = $this->mock(Media::class);
        $media->shouldReceive('acquire')->once()->andReturn('source.mp4');
        $media->shouldReceive('chunks')
            ->once()
            ->with('source.mp4', Storage::disk('local')->path('projects/'.$project->id).'/chunks')
            ->andReturn([$chunk]);
        Transcription::fake(['A source transcript'])->preventStrayTranscriptions();
        RecapWriter::fake(['မြန်မာ အနှစ်ချုပ်'])->preventStrayPrompts();
        (new ProcessProject($project->id, 'script'))->handle(app(OpenRouter::class), $media);
        $this->assertSame('A source transcript', $project->fresh()->transcript);
        $this->assertSame('မြန်မာ အနှစ်ချုပ်', $project->fresh()->script);
        Transcription::assertGenerated(fn (TranscriptionPrompt $prompt): bool => $prompt->language === null
            && $prompt->model === 'test/stt');
        RecapWriter::assertPrompted(fn (AgentPrompt $prompt): bool => str_contains($prompt->prompt, 'A source transcript'));
    }

    public function test_script_progress_follows_completed_chunks_and_reaches_100_only_with_a_script(): void
    {
        Storage::fake('local');
        $user = $this->userWithKey();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $project = Project::factory()->create([
            'user_id' => $user->id,
            'assistant_id' => $assistant->id,
            'transcript' => null,
            'media_path' => null,
        ]);
        Storage::disk('local')->put('chunk.mp3', 'source audio');
        $chunk = Storage::disk('local')->path('chunk.mp3');
        $media = $this->mock(Media::class);
        $media->shouldReceive('acquire')->once()->andReturn('source.mp4');
        $media->shouldReceive('chunks')->once()->andReturn([$chunk, $chunk]);
        Transcription::fake(['First chunk', 'Second chunk'])->preventStrayTranscriptions();
        RecapWriter::fake(['Recap script'])->preventStrayPrompts();
        $milestones = [];
        Project::updated(function (Project $updated) use ($project, &$milestones): void {
            if ($updated->id === $project->id && $updated->wasChanged('generation_progress')) {
                $milestones[] = $updated->generation_progress;
            }
        });

        (new ProcessProject($project->id, 'script'))->handle(app(OpenRouter::class), $media);

        $this->assertSame([
            ['step' => 'downloading', 'percent' => 10],
            ['step' => 'extracting', 'percent' => 40],
            ['step' => 'transcribing', 'percent' => 50],
            ['step' => 'transcribing', 'percent' => 65],
            ['step' => 'transcribing', 'percent' => 80],
            ['step' => 'writing', 'percent' => 85],
            ['step' => 'complete', 'percent' => 100],
        ], $milestones);
        $this->assertSame('script_ready', $project->fresh()->status);
        $this->assertSame('Recap script', $project->fresh()->script);
        Transcription::assertGenerated(fn (TranscriptionPrompt $prompt): bool => $prompt->model === 'test/stt');
        RecapWriter::assertPrompted(fn (AgentPrompt $prompt): bool => str_contains($prompt->prompt, 'Second chunk'));
    }

    public function test_existing_transcript_skips_source_steps_and_failed_writing_preserves_progress(): void
    {
        Storage::fake('local');
        $user = $this->userWithKey();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $project = Project::factory()->create([
            'user_id' => $user->id,
            'assistant_id' => $assistant->id,
            'transcript' => 'Existing transcript',
            'script' => null,
        ]);
        $media = $this->mock(Media::class);
        $media->shouldNotReceive('acquire');
        $media->shouldNotReceive('chunks');
        Transcription::fake()->preventStrayTranscriptions();
        Http::fake(['*/chat/completions' => Http::response(['error' => ['message' => 'No credits']], 402)]);
        $job = new ProcessProject($project->id, 'script');

        try {
            $job->handle(app(OpenRouter::class), $media);
            $this->fail('Writing failure must stop generation.');
        } catch (GenerationException $generationException) {
            $job->failed($generationException);
        }

        $this->assertSame('failed', $project->fresh()->status);
        $this->assertSame('app.openrouter_insufficient_credits', $project->fresh()->getRawOriginal('error'));
        $this->assertSame(['step' => 'writing', 'percent' => 85], $project->fresh()->generation_progress);
        $this->assertNull($project->fresh()->script);
        Transcription::assertNothingGenerated();
    }

    public function test_existing_media_skips_downloading_and_failed_transcription_preserves_progress(): void
    {
        Storage::fake('local');
        $user = $this->userWithKey();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $project = Project::factory()->create([
            'user_id' => $user->id,
            'assistant_id' => $assistant->id,
            'transcript' => null,
            'media_path' => 'source.mp4',
        ]);
        $audio = $this->uploadedAudio();
        Storage::disk('local')->put('chunk.wav', file_get_contents($audio->getRealPath()));
        $media = $this->mock(Media::class);
        $media->shouldReceive('acquire')->once()->andReturn('source.mp4');
        $media->shouldReceive('chunks')->once()->andReturn([Storage::disk('local')->path('chunk.wav')]);
        Http::fake(['*/audio/transcriptions' => Http::response(['error' => ['message' => 'No credits']], 402)]);
        RecapWriter::fake()->preventStrayPrompts();
        $job = new ProcessProject($project->id, 'script');

        try {
            $job->handle(app(OpenRouter::class), $media);
            $this->fail('Transcription failure must stop generation.');
        } catch (GenerationException $generationException) {
            $job->failed($generationException);
        }

        $this->assertSame('failed', $project->fresh()->status);
        $this->assertSame('app.openrouter_insufficient_credits', $project->fresh()->getRawOriginal('error'));
        $this->assertSame(['step' => 'transcribing', 'percent' => 50], $project->fresh()->generation_progress);
        RecapWriter::assertNeverPrompted();
    }

    public function test_invalid_base64_audio_from_sdk_is_rejected(): void
    {
        Audio::fake(['invalid base64!'])->preventStrayAudio();
        $this->expectException(GenerationException::class);
        $this->expectExceptionMessage('app.narration_returned_invalid_audio');
        $this->configuredService()->speech('test/tts', 'test-voice', 'Hello');
    }

    public function test_provider_connection_failure_is_localized(): void
    {
        Http::fake(['*/chat/completions' => Http::failedConnection()]);
        $this->expectException(GenerationException::class);
        $this->expectExceptionMessage('app.openrouter_connection_failed');
        $this->configuredService()->prompt(new AssistantChat('Burmese'), 'test/chat', 'Hello');
    }

    public function test_discovery_uses_sdk_query_generation(): void
    {
        DiscoveryIntent::fake([[
            'mode' => 'topic',
            'query' => 'space documentaries',
            'bilibili_query' => '太空纪录片',
            'region' => 'MM',
            'days' => 0,
        ]])->preventStrayPrompts();
        Process::fake(['*' => Process::result(output: json_encode(['ok' => true, 'items' => []]))]);
        $user = $this->userWithKey();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $this->actingAs($user)
            ->postJson('/api/v1/discover', [
                'assistant_id' => $assistant->id,
                'prompt' => 'အာကာသ',
                'platform' => 'bilibili',
            ])
            ->assertOk()
            ->assertJsonPath('query', 'space documentaries');
        DiscoveryIntent::assertPrompted('အာကာသ');
        Process::assertRan(fn ($process): bool => $process->command[2] === 'search'
            && $process->command[3] === '太空纪录片');
    }

    public function test_missing_credentials_and_disabled_models_do_not_generate(): void
    {
        User::factory()->create();
        try {
            app(OpenRouter::class)->prompt(new AssistantChat('Burmese'), 'test/chat', 'Hello');
            $this->fail('Missing key must fail.');
        } catch (ValidationException $validationException) {
            $this->assertArrayHasKey('key', $validationException->errors());
        }

        DB::table('site_settings')->insert(['key' => 'disabled_models', 'value' => json_encode(['test/chat'])]);
        $this->expectException(ValidationException::class);
        app(OpenRouter::class)->prompt(new AssistantChat('Burmese'), 'test/chat', 'Hello');
    }

    public function test_original_provider_exception_is_retained_for_diagnosis(): void
    {
        Http::fake(['*/chat/completions' => Http::response(['error' => ['message' => 'private-provider-detail']], 402)]);
        try {
            $this->configuredService()->prompt(new RecapWriter(60, 'Concise'), 'test/chat', 'Hello');
            $this->fail('Credit failure must stop writing.');
        } catch (GenerationException $generationException) {
            $this->assertSame('app.openrouter_insufficient_credits', $generationException->getMessage());
            $this->assertInstanceOf(InsufficientCreditsException::class, $generationException->getPrevious());
        }
    }

    public function test_existing_application_exception_is_preserved(): void
    {
        Http::fake(['*/audio/speech' => Http::response('pcm', 200, ['Content-Type' => 'audio/pcm'])]);
        $original = new GenerationException('app.narration_audio_conversion_failed');
        $media = $this->mock(Media::class);
        $media->shouldReceive('pcmToMp3')->once()->andThrow($original);
        try {
            $this->configuredService()->speech('google/gemini-tts', 'Kore', 'Hello');
            $this->fail('Conversion must stop narration.');
        } catch (GenerationException $generationException) {
            $this->assertSame($original, $generationException);
        }
    }

    public function test_provider_api_errors_and_stored_job_errors_follow_requested_locale(): void
    {
        Http::fake(['*/audio/transcriptions' => Http::response(['error' => ['message' => 'private-provider-detail']], 402)]);
        $user = $this->userWithKey();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $project = Project::factory()->create(['user_id' => $user->id, 'error' => 'app.openrouter_insufficient_credits']);
        $this->actingAs($user);
        foreach (['en', 'my'] as $locale) {
            $message = trans('app.openrouter_insufficient_credits', [], $locale);
            $this->withHeader('Accept-Language', $locale)
                ->post('/api/v1/transcribe', ['assistant_id' => $assistant->id, 'audio' => $this->uploadedAudio()], ['Accept' => 'application/json'])
                ->assertInternalServerError()
                ->assertExactJson(['message' => $message]);
            $this->getJson('/api/v1/projects/'.$project->id)
                ->assertOk()
                ->assertJsonPath('error', $message);
        }
    }

    public function test_discovery_provider_failures_use_the_shared_mapping(): void
    {
        Http::fake(['*/chat/completions' => Http::response(['error' => ['message' => 'private-provider-detail']], 429)]);
        $this->expectException(GenerationException::class);
        $this->expectExceptionMessage('app.openrouter_rate_limited');
        $this->configuredService()->discoveryIntent('test/chat', 'Find documentaries');
    }

    #[DataProvider('failedResponses')]
    public function test_provider_and_malformed_responses_use_accurate_errors(string $operation, int $status, mixed $body, string $message): void
    {
        Http::fake([
            '*/chat/completions' => $status === 0 ? Http::failedConnection() : Http::response($body, $status),
            '*/audio/*' => $status === 0 ? Http::failedConnection() : Http::response($body, $status),
        ]);
        $this->userWithKey();
        $this->expectException(GenerationException::class);
        $this->expectExceptionMessage($message);
        $service = app(OpenRouter::class);
        match ($operation) {
            'chat' => $service->prompt(new AssistantChat('Burmese'), 'test/chat', 'Hello'),
            'transcribe' => $service->transcribe('test/stt', Transcription::fromBase64(base64_encode('audio'), 'audio/mpeg')),
            'speech' => $service->speech('test/tts', 'test-voice', 'Hello'),
        };
    }

    public static function failedResponses(): array
    {
        $cases = [];
        foreach (['chat', 'transcribe', 'speech'] as $operation) {
            foreach ([
                402 => 'openrouter_insufficient_credits',
                429 => 'openrouter_rate_limited',
                503 => 'openrouter_temporarily_unavailable',
                0 => 'openrouter_connection_failed',
                401 => 'openrouter_access_rejected',
                403 => 'openrouter_access_rejected',
                500 => match ($operation) {
                    'chat' => 'recap_writing_failed_unknown_cause',
                    'transcribe' => 'transcription_failed_unknown_cause',
                    'speech' => 'narration_failed_unknown_cause',
                },
            ] as $status => $message) {
                $cases[$operation.'-'.$status] = [$operation, $status, ['error' => ['message' => 'private-provider-detail']], 'app.'.$message];
            }
        }

        return array_merge($cases, [
            ['chat', 200, ['choices' => [['message' => ['content' => ' ']]]], 'app.the_model_returned_no_text'],
            ['transcribe', 200, ['text' => ''], 'app.transcription_returned_no_text'],
            ['speech', 200, ['error' => 'bad voice'], 'app.narration_returned_invalid_audio'],
            ['speech', 200, 'not audio', 'app.narration_returned_invalid_audio'],
            ['speech', 200, '', 'app.narration_returned_invalid_audio'],
        ]);
    }
}
