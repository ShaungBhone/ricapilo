<?php

namespace Tests\Feature;

use App\Jobs\ProcessProject;
use App\Models\Assistant;
use App\Models\Credential;
use App\Models\Project;
use App\Models\User;
use App\Services\Media;
use App\Services\OpenRouter;
use App\Services\OpenRouterAgent;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\URL;
use Laravel\Ai\Prompts\AgentPrompt;
use Tests\TestCase;

class WorkspaceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
    }

    private function catalog(): void
    {
        Http::fake(['*/models*' => Http::response(['data' => [['id' => 'test/chat', 'name' => 'Chat'], ['id' => 'test/stt', 'name' => 'Transcriber'], ['id' => 'test/tts', 'name' => 'Voice', 'supported_voices' => ['test-voice']]]])]);
    }

    public function test_public_signup_creates_an_unverified_non_admin_user_and_sends_verification(): void
    {
        config(['recap.email_verification_required' => true]);
        Notification::fake();
        $this->postJson('/api/v1/auth/register', ['name' => 'New user', 'email' => 'new@example.com', 'password' => 'GoodPassword123', 'password_confirmation' => 'GoodPassword123', 'is_admin' => true])->assertCreated()->assertJsonPath('email_verified_at', null)->assertJsonMissingPath('password');
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
        Http::fake(['api.dailymotion.com/*' => Http::response(['list' => []])]);
        $this->postJson('/api/v1/auth/register', ['name' => 'New user', 'email' => 'new@example.com', 'password' => 'GoodPassword123', 'password_confirmation' => 'GoodPassword123'])->assertCreated()->assertJsonPath('email_verified_at', null);
        Notification::assertNothingSent();
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('email_verification_required', false);
        $this->postJson('/api/v1/discover', ['prompt' => 'space', 'platform' => 'dailymotion'])->assertOk();
    }

    public function test_unverified_user_can_be_promoted_when_email_verification_is_optional(): void
    {
        config(['recap.email_verification_required' => false]);
        $u = User::factory()->unverified()->create();
        $this->artisan('recap:admin', ['email' => $u->email])->expectsOutput('Administrator access granted.')->assertSuccessful();
        $this->assertTrue((bool) $u->fresh()->is_admin);
        $this->assertNull($u->fresh()->email_verified_at);
    }

    public function test_unverified_user_cannot_be_promoted_when_email_verification_is_required(): void
    {
        config(['recap.email_verification_required' => true]);
        $u = User::factory()->unverified()->create();
        $this->artisan('recap:admin', ['email' => $u->email])->expectsOutput('Verify this account first.')->assertFailed();
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

    public function test_api_keys_are_encrypted_and_never_returned(): void
    {
        $u = User::factory()->create();
        $secret = 'sk-or-test-secret-value';
        $this->actingAs($u)->putJson('/api/v1/keys', ['secret' => $secret])->assertOk();
        $raw = DB::table('credentials')->value('secret');
        $this->assertNotSame($secret, $raw);
        $this->assertSame($secret, Credential::first()->secret);
        $this->getJson('/api/v1/keys')->assertOk()->assertJsonMissingPath('0.secret');
        $this->assertStringNotContainsString($secret, $this->getJson('/api/v1/keys')->getContent());
        $this->deleteJson('/api/v1/keys')->assertNoContent();
        $this->assertDatabaseCount('credentials', 0);
    }

    public function test_foreign_assistant_cannot_be_used_and_only_admins_change_integrations(): void
    {
        $u = User::factory()->create();
        $other = Assistant::factory()->create();
        $this->actingAs($u)->postJson('/api/v1/projects', ['title' => 'Test', 'assistant_id' => $other->id, 'source' => 'upload', 'format' => 'vertical', 'target_seconds' => 60])->assertUnprocessable();
        $this->getJson('/api/v1/admin')->assertForbidden();
        $this->putJson('/api/v1/admin', ['disabled_models' => []])->assertForbidden();
    }

    public function test_generation_dispatches_once_and_editing_during_generation_is_blocked(): void
    {
        Queue::fake();
        $u = User::factory()->create();
        $a = Assistant::factory()->create(['user_id' => $u->id]);
        $p = Project::factory()->create(['user_id' => $u->id, 'assistant_id' => $a->id]);
        Credential::create(['user_id' => $u->id, 'provider' => 'openrouter', 'secret' => 'test-secret-key']);
        $this->actingAs($u)->postJson('/api/v1/projects/'.$p->id.'/generate', ['stage' => 'script'])->assertAccepted();
        $this->postJson('/api/v1/projects/'.$p->id.'/generate', ['stage' => 'script'])->assertConflict();
        $this->patchJson('/api/v1/projects/'.$p->id, ['script' => 'new'])->assertConflict();
        Queue::assertPushed(ProcessProject::class, 1);
    }

    public function test_changing_script_invalidates_audio_video_and_captions(): void
    {
        $u = User::factory()->create();
        $p = Project::factory()->create(['user_id' => $u->id, 'script' => 'old', 'audio_path' => 'old.mp3', 'video_path' => 'old.mp4', 'captions' => [['text' => 'old']], 'status' => 'ready']);
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
        $p = Project::factory()->create(['user_id' => $u->id, 'script' => 'old', 'audio_path' => 'old.mp3', 'video_path' => 'old.mp4', 'captions' => [['text' => 'old']], 'status' => 'ready']);
        Credential::create(['user_id' => $u->id, 'provider' => 'openrouter', 'secret' => 'test-secret-key']);
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
        $p = Project::factory()->create(['user_id' => $u->id, 'audio_path' => 'old.mp3', 'video_path' => 'old.mp4', 'status' => 'ready']);
        $this->actingAs($u)->patchJson('/api/v1/projects/'.$p->id, ['caption_style' => 'boxed-minimal'])->assertOk();
        $this->assertSame('audio_ready', $p->fresh()->status);
        $this->assertNull($p->fresh()->video_path);
        $this->assertSame('old.mp3', $p->fresh()->audio_path);
    }

    public function test_script_job_uses_source_and_persists_burmese_result(): void
    {
        $this->catalog();
        OpenRouterAgent::fake(['မြန်မာ အနှစ်ချုပ်'])->preventStrayPrompts();
        $u = User::factory()->create();
        Credential::create(['user_id' => $u->id, 'provider' => 'openrouter', 'secret' => 'test-secret-key']);
        $a = Assistant::factory()->create(['user_id' => $u->id]);
        $p = Project::factory()->create(['user_id' => $u->id, 'assistant_id' => $a->id]);
        (new ProcessProject($p->id, 'script'))->handle(app(OpenRouter::class), app(Media::class));
        $this->assertSame('မြန်မာ အနှစ်ချုပ်', $p->fresh()->script);
        $this->assertSame('script_ready', $p->fresh()->status);
        OpenRouterAgent::assertPrompted(fn (AgentPrompt $prompt) => str_contains($prompt->prompt, $p->transcript));
    }

    public function test_discovery_normalizes_dailymotion_results_and_reports_missing_youtube_key(): void
    {
        Http::fake(['api.dailymotion.com/*' => Http::response(['list' => [['id' => 'x123', 'title' => 'Space', 'owner.screenname' => 'Creator', 'views_total' => 99, 'duration' => 30], ['id' => 'long', 'title' => 'Long', 'duration' => 500]]])]);
        $u = User::factory()->create();
        $this->actingAs($u)->postJson('/api/v1/discover', ['prompt' => 'space', 'platform' => 'all'])->assertOk()->assertJsonPath('videos.0.platform', 'dailymotion')->assertJsonPath('videos.0.views', 99)->assertJsonCount(1, 'warnings');
        Http::assertSent(fn ($request) => str_contains($request->url(), 'dailymotion.com') && ! isset($request['duration']));
    }

    public function test_text_talk_persists_history_without_exposing_credentials(): void
    {
        $this->catalog();
        OpenRouterAgent::fake(['မင်္ဂလာပါ'])->preventStrayPrompts();
        $u = User::factory()->create();
        Credential::create(['user_id' => $u->id, 'provider' => 'openrouter', 'secret' => 'test-secret-key']);
        $a = Assistant::factory()->create(['user_id' => $u->id]);
        $this->actingAs($u)->postJson('/api/v1/talk', ['assistant_id' => $a->id, 'text' => 'Hello', 'speak' => false])->assertOk()->assertJsonPath('conversation.messages.1.content', 'မင်္ဂလာပါ');
        $this->assertDatabaseCount('conversations', 1);
    }

    public function test_signed_relative_verification_link_works_through_the_frontend_proxy(): void
    {
        $u = User::factory()->unverified()->create();
        $url = URL::temporarySignedRoute('verification.verify', now()->addMinutes(30), ['id' => $u->id, 'hash' => sha1($u->email)], false);
        $this->actingAs($u)->get($url)->assertRedirect(config('recap.frontend_url'));
        $this->assertNotNull($u->fresh()->email_verified_at);
    }

    public function test_password_reset_changes_the_password_and_resists_email_enumeration(): void
    {
        Notification::fake();
        $u = User::factory()->create();
        $this->postJson('/api/v1/auth/forgot', ['email' => $u->email])->assertOk();
        $token = null;
        Notification::assertSentTo($u, ResetPassword::class, function ($n) use (&$token) {
            $token = $n->token;

            return true;
        });
        $this->postJson('/api/v1/auth/reset', ['email' => $u->email, 'token' => $token, 'password' => 'NewPassword123', 'password_confirmation' => 'NewPassword123'])->assertOk();
        $this->assertTrue(Hash::check('NewPassword123', $u->fresh()->password));
        $this->postJson('/api/v1/auth/forgot', ['email' => 'missing@example.com'])->assertOk();
    }
}
