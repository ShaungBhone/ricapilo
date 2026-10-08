<?php

namespace Tests\Feature;

use App\Ai\Agents\AssistantChat;
use App\Ai\Agents\RecapWriter;
use App\Ai\OpenRouter;
use App\Exceptions\GenerationException;
use App\Jobs\ProcessProject;
use App\Models\Assistant;
use App\Models\Conversation;
use App\Models\Project;
use App\Models\User;
use App\Services\Media;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Laravel\Ai\Prompts\AgentPrompt;
use Laravel\Ai\Transcription;
use Tests\TestCase;

class WorkspaceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config(['ai.providers.openrouter.key' => 'test-env-key']);
    }

    private function catalog(): void
    {
        Http::fake(['*/models*' => Http::response(['data' => [
            ['id' => 'test/chat', 'name' => 'Chat'],
            ['id' => 'test/stt', 'name' => 'Transcriber'],
            ['id' => 'test/tts', 'name' => 'Voice', 'supported_voices' => ['test-voice']],
        ]])]);
    }

    public function test_public_signup_creates_an_unverified_non_admin_user_and_sends_verification(): void
    {
        config(['recap.email_verification_required' => true]);
        Notification::fake();
        $this->postJson('/api/v1/auth/register', [
            'name' => 'New user',
            'email' => 'new@example.com',
            'password' => 'GoodPassword123',
            'password_confirmation' => 'GoodPassword123',
            'is_admin' => true,
        ])
            ->assertCreated()
            ->assertJsonPath('email_verified_at', null)
            ->assertJsonMissingPath('password');
        $u = User::first();
        $this->assertFalse((bool) $u->is_admin);
        Notification::assertSentTo($u, VerifyEmail::class);
        $this->getJson('/api/v1/auth/me')->assertOk();
        $this->postJson('/api/v1/discover', ['prompt' => 'space', 'platform' => 'all'])->assertForbidden();
    }

    public function test_signup_and_discovery_work_without_email_verification_when_optional(): void
    {
        config(['recap.email_verification_required' => false]);
        Notification::fake();
        Process::fake(['*' => Process::result(output: json_encode(['ok' => true, 'items' => []]))]);
        $this->postJson('/api/v1/auth/register', [
            'name' => 'New user',
            'email' => 'new@example.com',
            'password' => 'GoodPassword123',
            'password_confirmation' => 'GoodPassword123',
        ])
            ->assertCreated()
            ->assertJsonPath('email_verified_at', null);
        Notification::assertNothingSent();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('email_verification_required', false);
        $this->postJson('/api/v1/discover', ['prompt' => 'space', 'platform' => 'bilibili'])->assertOk();
    }

    public function test_unverified_user_can_be_promoted_when_email_verification_is_optional(): void
    {
        config(['recap.email_verification_required' => false]);
        $u = User::factory()->unverified()->create();
        $this->artisan('recap:admin', ['email' => $u->email])
            ->expectsOutput('Administrator access granted.')
            ->assertSuccessful();
        $this->assertTrue((bool) $u->fresh()->is_admin);
        $this->assertNull($u->fresh()->email_verified_at);
    }

    public function test_unverified_user_cannot_be_promoted_when_email_verification_is_required(): void
    {
        config(['recap.email_verification_required' => true]);
        $u = User::factory()->unverified()->create();
        $this->artisan('recap:admin', ['email' => $u->email])
            ->expectsOutput('Verify this account first.')
            ->assertFailed();
        $this->assertFalse((bool) $u->fresh()->is_admin);
        $this->actingAs($u)->getJson('/api/v1/auth/me')->assertJsonPath('email_verification_required', true);
    }

    public function test_login_logout_and_invalid_password(): void
    {
        $u = User::factory()->create(['password' => 'GoodPassword123']);
        $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'wrong'])->assertUnprocessable();
        $this->postJson('/api/v1/auth/login', ['email' => $u->email, 'password' => 'GoodPassword123'])->assertOk();
        $this->postJson('/api/v1/auth/logout')->assertOk();
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_users_cannot_read_modify_download_or_delete_another_users_project(): void
    {
        $u = User::factory()->create();
        $p = Project::factory()->create();
        $this->actingAs($u);
        $this->getJson('/api/v1/projects/'.$p->id)->assertNotFound();
        $this->patchJson('/api/v1/projects/'.$p->id, ['script' => 'stolen'])->assertNotFound();
        $this->getJson('/api/v1/projects/'.$p->id.'/download/script')->assertNotFound();
        $this->deleteJson('/api/v1/projects/'.$p->id)->assertNotFound();
        $this->getJson('/api/v1/projects')->assertJsonPath('total', 0);
    }

    public function test_api_key_management_endpoints_are_removed(): void
    {
        $this->actingAs(User::factory()->create());
        $this->getJson('/api/v1/keys')->assertNotFound();
        $this->putJson('/api/v1/keys', ['secret' => 'replacement-key'])->assertNotFound();
        $this->deleteJson('/api/v1/keys')->assertNotFound();
    }

    public function test_foreign_assistant_cannot_be_used_and_only_admins_change_integrations(): void
    {
        $u = User::factory()->create();
        $other = Assistant::factory()->create();
        $this->actingAs($u)
            ->postJson('/api/v1/projects', [
                'title' => 'Test',
                'assistant_id' => $other->id,
                'source' => 'upload',
                'format' => 'vertical',
                'target_seconds' => 60,
            ])
            ->assertUnprocessable();
        $this->getJson('/api/v1/admin')->assertForbidden();
        $this->putJson('/api/v1/admin', ['disabled_models' => []])->assertForbidden();
    }

    public function test_generation_dispatches_once_and_editing_during_generation_is_blocked(): void
    {
        Queue::fake();
        $u = User::factory()->create();
        $a = Assistant::factory()->create(['user_id' => $u->id]);
        $p = Project::factory()->create(['user_id' => $u->id, 'assistant_id' => $a->id]);
        $this->actingAs($u)->postJson('/api/v1/projects/'.$p->id.'/generate', ['stage' => 'script'])->assertAccepted();
        $this->postJson('/api/v1/projects/'.$p->id.'/generate', ['stage' => 'script'])->assertConflict();
        $this->patchJson('/api/v1/projects/'.$p->id, ['script' => 'new'])->assertConflict();
        Queue::assertPushed(ProcessProject::class, 1);
    }

    public function test_selected_video_creation_queues_one_script_job_and_refresh_does_not_queue_preparation(): void
    {
        Queue::fake();
        $user = User::factory()->create();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $response = $this->actingAs($user)->postJson('/api/v1/projects', [
            'title' => 'Selected video',
            'assistant_id' => $assistant->id,
            'source' => 'youtube',
            'source_id' => 'abcdefghijk',
            'format' => 'vertical',
            'target_seconds' => 60,
            'generate_script' => true,
            'generation_progress' => ['step' => 'complete', 'percent' => 100],
        ]);
        $response->assertCreated()
            ->assertJsonPath('status', 'queued')
            ->assertJsonPath('stage', 'script')
            ->assertJsonPath('generation_progress', ['step' => 'queued', 'percent' => 0])
            ->assertJsonPath('has_media', false)
            ->assertJsonMissingPath('generate_script');
        $id = $response->json('id');
        $this->getJson('/api/v1/projects/'.$id)->assertOk()
            ->assertJsonPath('status', 'queued')
            ->assertJsonPath('generation_progress', ['step' => 'queued', 'percent' => 0]);
        $this->getJson('/api/v1/projects/'.$id)->assertOk();
        $this->postJson('/api/v1/projects/'.$id.'/prepare')->assertConflict();
        $this->postJson('/api/v1/projects/'.$id.'/generate', ['stage' => 'script'])->assertConflict();
        Queue::assertPushed(ProcessProject::class, 1);
        Queue::assertPushed(ProcessProject::class, fn (ProcessProject $job): bool => $job->projectId === $id
            && $job->stage === 'script'
            && $job->afterCommit);
    }

    public function test_script_creation_validates_credentials_and_enabled_owned_assistant_before_saving(): void
    {
        config(['ai.providers.openrouter.key' => null]);
        Queue::fake();
        $user = User::factory()->create();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $data = [
            'title' => 'Selected video',
            'assistant_id' => $assistant->id,
            'source' => 'bilibili',
            'source_id' => 'BV1xx411c7mD',
            'format' => 'vertical',
            'target_seconds' => 60,
            'generate_script' => true,
        ];
        $this->actingAs($user)
            ->postJson('/api/v1/projects', $data)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('key');
        config(['ai.providers.openrouter.key' => 'test-env-key']);
        $assistant->update(['enabled' => false]);
        $this->postJson('/api/v1/projects', $data)->assertUnprocessable()->assertJsonValidationErrors('assistant_id');
        $other = Assistant::factory()->create();
        $this->postJson('/api/v1/projects', [...$data, 'assistant_id' => $other->id])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('assistant_id');
        $this->assertDatabaseCount('projects', 0);
        Queue::assertNothingPushed();
    }

    public function test_script_creation_preserves_email_verification_and_manual_creation_behavior(): void
    {
        Queue::fake();
        config(['recap.email_verification_required' => true]);
        $user = User::factory()->unverified()->create();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $data = [
            'title' => 'Manual project',
            'assistant_id' => $assistant->id,
            'source' => 'upload',
            'transcript' => 'Source text',
            'format' => 'vertical',
            'target_seconds' => 60,
        ];
        $this->actingAs($user)->postJson('/api/v1/projects', [...$data, 'generate_script' => true])->assertForbidden();
        $this->assertDatabaseCount('projects', 0);
        $this->postJson('/api/v1/projects', $data)
            ->assertCreated()
            ->assertJsonPath('status', 'draft')
            ->assertJsonPath('stage', null);
        $this->postJson('/api/v1/projects', [...$data, 'generate_script' => false])
            ->assertCreated()
            ->assertJsonPath('status', 'draft');
        Queue::assertNothingPushed();
    }

    public function test_selected_video_is_downloaded_transcribed_and_script_generated_without_narration(): void
    {
        Queue::fake();
        Storage::fake('local');
        $this->catalog();
        Transcription::fake(['A faithful source transcript.']);
        RecapWriter::fake(['မြန်မာ အနှစ်ချုပ်'])->preventStrayPrompts();
        $user = User::factory()->create();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $response = $this->actingAs($user)
            ->postJson('/api/v1/projects', [
                'title' => 'Selected video',
                'assistant_id' => $assistant->id,
                'source' => 'youtube',
                'source_id' => 'abcdefghijk',
                'format' => 'vertical',
                'target_seconds' => 60,
                'generate_script' => true,
            ])
            ->assertCreated();
        $id = $response->json('id');
        Process::fake(function ($process) use ($id) {
            if (in_array('--no-playlist', $process->command, true)) {
                $this->assertSame('https://www.youtube.com/watch?v=abcdefghijk', end($process->command));
                Storage::disk('local')->put('projects/'.$id.'/source.mp4', 'source media');
            } else {
                Storage::disk('local')->put('projects/'.$id.'/chunks/part-000.mp3', 'source audio');
            }

            return Process::result();
        });
        (new ProcessProject($id, 'script'))->handle(app(OpenRouter::class), app(Media::class));
        $this->getJson('/api/v1/projects/'.$id)
            ->assertOk()
            ->assertJsonPath('status', 'script_ready')
            ->assertJsonPath('generation_progress', ['step' => 'complete', 'percent' => 100])
            ->assertJsonPath('transcript', 'A faithful source transcript.')
            ->assertJsonPath('script', 'မြန်မာ အနှစ်ချုပ်')
            ->assertJsonPath('has_media', true)
            ->assertJsonPath('editor_settings.slots.0.assetId', 'source')
            ->assertJsonPath('has_audio', false)
            ->assertJsonPath('has_video', false);
        RecapWriter::assertPrompted(fn (AgentPrompt $prompt): bool => str_contains($prompt->prompt, 'A faithful source transcript.'));
        Http::assertNotSent(fn ($request): bool => str_contains($request->url(), '/audio/speech'));
        Queue::assertPushed(ProcessProject::class, 1);
    }

    public function test_source_failures_are_distinguished_from_provider_failures_and_can_be_retried(): void
    {
        Queue::fake();
        Storage::fake('local');
        Process::fake(['*' => Process::result(exitCode: 1)]);
        $user = User::factory()->create();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $project = Project::factory()->create([
            'user_id' => $user->id,
            'assistant_id' => $assistant->id,
            'source' => 'youtube',
            'source_id' => 'abcdefghijk',
            'transcript' => null,
            'stage' => 'script',
            'status' => 'queued',
        ]);
        $job = new ProcessProject($project->id, 'script');
        try {
            $job->handle(app(OpenRouter::class), app(Media::class));
            $this->fail('Download failure must stop script generation.');
        } catch (GenerationException $generationException) {
            $job->failed($generationException);
        }

        $this->actingAs($user)
            ->withHeader('Accept-Language', 'my')
            ->getJson('/api/v1/projects/'.$project->id)
            ->assertOk()
            ->assertJsonPath('status', 'failed')
            ->assertJsonPath('generation_progress', ['step' => 'downloading', 'percent' => 10])
            ->assertJsonPath('source_unavailable', true);
        $this->withHeader('Accept-Language', 'en')
            ->getJson('/api/v1/projects/'.$project->id)
            ->assertOk()
            ->assertJsonPath('source_unavailable', true);
        $this->postJson('/api/v1/projects/'.$project->id.'/generate', ['stage' => 'script'])
            ->assertAccepted()
            ->assertJsonPath('generation_progress', ['step' => 'queued', 'percent' => 0])
            ->assertJsonPath('source_unavailable', false);
        Queue::assertPushed(ProcessProject::class, 1);
        $job->failed(new GenerationException('Provider request failed'));
        $this->getJson('/api/v1/projects/'.$project->id)
            ->assertOk()
            ->assertJsonPath('source_unavailable', false)
            ->assertJsonPath('error', 'Provider request failed');
    }

    public function test_unexpected_job_failures_store_a_generic_error_instead_of_internal_details(): void
    {
        $project = Project::factory()->create(['status' => 'processing']);
        (new ProcessProject($project->id, 'script'))->failed(new \RuntimeException('SQLSTATE[HY000]: select * from secrets'));
        $this->assertSame('failed', $project->fresh()->status);
        $this->assertSame('app.generation_failed_check_your_providers_and_retry', $project->fresh()->getRawOriginal('error'));
    }

    public function test_changing_script_invalidates_audio_video_and_captions(): void
    {
        $u = User::factory()->create();
        $p = Project::factory()->create([
            'user_id' => $u->id,
            'script' => 'old',
            'audio_path' => 'old.mp3',
            'video_path' => 'old.mp4',
            'captions' => [['text' => 'old']],
            'status' => 'ready',
        ]);
        $this->actingAs($u)->patchJson('/api/v1/projects/'.$p->id, ['script' => 'အသစ်'])->assertOk();
        $p->refresh();
        $this->assertNull($p->audio_path);
        $this->assertNull($p->video_path);
        $this->assertNull($p->captions);
    }

    public function test_regenerating_script_invalidates_previous_outputs(): void
    {
        Queue::fake();
        $u = User::factory()->create();
        $p = Project::factory()->create([
            'user_id' => $u->id,
            'script' => 'old',
            'audio_path' => 'old.mp3',
            'video_path' => 'old.mp4',
            'captions' => [['text' => 'old']],
            'status' => 'ready',
        ]);
        $this->actingAs($u)->postJson('/api/v1/projects/'.$p->id.'/generate', ['stage' => 'script'])->assertAccepted();
        $p->refresh();
        $this->assertNull($p->script);
        $this->assertNull($p->audio_path);
        $this->assertNull($p->video_path);
        $this->assertNull($p->captions);
    }

    public function test_changing_caption_style_keeps_audio_and_invalidates_video(): void
    {
        $u = User::factory()->create();
        $p = Project::factory()->create([
            'user_id' => $u->id,
            'audio_path' => 'old.mp3',
            'video_path' => 'old.mp4',
            'status' => 'ready',
        ]);
        $this->actingAs($u)->patchJson('/api/v1/projects/'.$p->id, ['caption_style' => 'boxed-minimal'])->assertOk();
        $this->assertSame('audio_ready', $p->fresh()->status);
        $this->assertNull($p->fresh()->video_path);
        $this->assertSame('old.mp3', $p->fresh()->audio_path);
    }

    public function test_script_job_uses_source_and_persists_burmese_result(): void
    {
        $this->catalog();
        RecapWriter::fake(['မြန်မာ အနှစ်ချုပ်'])->preventStrayPrompts();
        $u = User::factory()->create();
        $a = Assistant::factory()->create(['user_id' => $u->id]);
        $p = Project::factory()->create(['user_id' => $u->id, 'assistant_id' => $a->id]);
        (new ProcessProject($p->id, 'script'))->handle(app(OpenRouter::class), app(Media::class));
        $this->assertSame('မြန်မာ အနှစ်ချုပ်', $p->fresh()->script);
        $this->assertSame('script_ready', $p->fresh()->status);
        RecapWriter::assertPrompted(fn (AgentPrompt $prompt): bool => str_contains($prompt->prompt, $p->transcript));
    }

    public function test_text_talk_persists_history_without_exposing_credentials(): void
    {
        $this->catalog();
        AssistantChat::fake(['မင်္ဂလာပါ'])->preventStrayPrompts();
        $u = User::factory()->create();
        $a = Assistant::factory()->create(['user_id' => $u->id]);
        $this->actingAs($u)
            ->postJson('/api/v1/talk', ['assistant_id' => $a->id, 'text' => 'Hello', 'speak' => false])
            ->assertOk()
            ->assertJsonPath('conversation.messages.1.content', 'မင်္ဂလာပါ');
        $this->assertDatabaseCount('conversations', 1);
    }

    public function test_talk_rejects_continuing_a_conversation_with_a_different_assistant(): void
    {
        $this->catalog();
        AssistantChat::fake()->preventStrayPrompts();
        $user = User::factory()->create();
        $original = Assistant::factory()->create(['user_id' => $user->id]);
        $other = Assistant::factory()->create(['user_id' => $user->id]);
        $conversation = Conversation::create([
            'user_id' => $user->id,
            'assistant_id' => $original->id,
            'title' => 'Hello',
            'messages' => [['role' => 'user', 'content' => 'Hello']],
        ]);
        $this->actingAs($user)
            ->postJson('/api/v1/talk', [
                'assistant_id' => $other->id,
                'conversation_id' => $conversation->id,
                'text' => 'Next',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('conversation_id');
        $this->assertCount(1, $conversation->fresh()->messages);
    }

    public function test_transcribe_returns_404_for_a_disabled_assistant(): void
    {
        Transcription::fake()->preventStrayTranscriptions();
        $user = User::factory()->create();
        $assistant = Assistant::factory()->create(['user_id' => $user->id, 'enabled' => false]);
        $this->actingAs($user)
            ->post('/api/v1/transcribe', [
                'assistant_id' => $assistant->id,
                'audio' => UploadedFile::fake()->create('voice.wav', 10, 'audio/wav'),
            ], ['Accept' => 'application/json'])
            ->assertNotFound();
    }

    public function test_admin_settings_are_readable_and_writable_by_admins(): void
    {
        $admin = User::factory()->create();
        $admin->forceFill(['is_admin' => true])->save();
        $this->actingAs($admin)->getJson('/api/v1/admin')->assertOk()->assertJsonPath('disabled_models', []);
        $this->putJson('/api/v1/admin', ['disabled_models' => ['test/chat']])
            ->assertOk()
            ->assertJsonPath('disabled_models', ['test/chat']);
    }

    public function test_signed_relative_verification_link_works_through_the_frontend_proxy(): void
    {
        $u = User::factory()->unverified()->create();
        $url = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes(30),
            ['id' => $u->id, 'hash' => sha1($u->email)],
            false,
        );
        $this->actingAs($u)->get($url)->assertRedirect(config('recap.frontend_url'));
        $this->assertNotNull($u->fresh()->email_verified_at);
    }

    public function test_password_reset_changes_the_password_and_resists_email_enumeration(): void
    {
        Notification::fake();
        $u = User::factory()->create();
        $this->postJson('/api/v1/auth/forgot', ['email' => $u->email])->assertOk();
        $token = null;
        Notification::assertSentTo($u, ResetPassword::class, function ($n) use (&$token): true {
            $token = $n->token;

            return true;
        });
        $this->postJson('/api/v1/auth/reset', [
            'email' => $u->email,
            'token' => $token,
            'password' => 'NewPassword123',
            'password_confirmation' => 'NewPassword123',
        ])->assertOk();
        $this->assertTrue(Hash::check('NewPassword123', $u->fresh()->password));
        $this->postJson('/api/v1/auth/forgot', ['email' => 'missing@example.com'])->assertOk();
    }
}
