<?php

namespace Tests\Feature;

use App\Exceptions\GenerationException;
use App\Jobs\ProcessProject;
use App\Models\Project;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class LocalizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_validation_uses_requested_language_and_defaults_to_burmese(): void
    {
        $this->withHeader('Accept-Language', '')->postJson('/api/v1/auth/login', [])->assertUnprocessable()->assertJsonPath('errors.email.0', 'အီးမေးလ် ကို ထည့်ရန် လိုအပ်ပါသည်။');
        $this->withHeader('Accept-Language', 'en')->postJson('/api/v1/auth/login', [])->assertUnprocessable()->assertJsonPath('errors.email.0', 'The email field is required.');
        $this->withHeader('Accept-Language', 'fr')->postJson('/api/v1/auth/login', [])->assertUnprocessable()->assertJsonPath('errors.email.0', 'အီးမေးလ် ကို ထည့်ရန် လိုအပ်ပါသည်။');
    }

    public function test_login_errors_and_discovery_warnings_are_localized(): void
    {
        $this->withHeader('Accept-Language', 'en')->postJson('/api/v1/auth/login', ['email' => 'none@example.com', 'password' => 'wrong'])->assertUnprocessable()->assertJsonPath('errors.email.0', 'Email or password is incorrect.');
        $this->withHeader('Accept-Language', 'my')->postJson('/api/v1/auth/login', ['email' => 'none@example.com', 'password' => 'wrong'])->assertUnprocessable()->assertJsonPath('errors.email.0', 'အီးမေးလ် သို့မဟုတ် စကားဝှက် မမှန်ပါ။');
        Http::fake(['api.dailymotion.com/*' => Http::response(['list' => []])]);
        $this->actingAs(User::factory()->create())->withHeader('Accept-Language', 'en')->postJson('/api/v1/discover', ['prompt' => 'space', 'platform' => 'all'])->assertOk()->assertJsonPath('warnings.0', 'An administrator must add a YouTube API key to search YouTube.');
        $this->withHeader('Accept-Language', 'my')->postJson('/api/v1/discover', ['prompt' => 'space', 'platform' => 'all'])->assertOk()->assertJsonPath('warnings.0', 'YouTube ရှာဖွေရန် စီမံခန့်ခွဲသူက API key ထည့်ရန် လိုပါသည်။');
    }

    public function test_stored_generation_keys_and_legacy_errors_follow_viewer_locale(): void
    {
        $user = User::factory()->create();
        $project = Project::factory()->create(['user_id' => $user->id, 'error' => 'The source has no audio.']);
        $this->actingAs($user)->withHeader('Accept-Language', 'my')->getJson('/api/v1/projects/'.$project->id)->assertOk()->assertJsonPath('error', 'ရင်းမြစ်တွင် အသံမရှိပါ။');
        (new ProcessProject($project->id, 'script'))->failed(new GenerationException('app.the_source_has_no_audio'));
        $this->assertSame('app.the_source_has_no_audio', $project->fresh()->getRawOriginal('error'));
        $this->withHeader('Accept-Language', 'en')->getJson('/api/v1/projects/'.$project->id)->assertJsonPath('error', 'The source has no audio.');
        $this->withHeader('Accept-Language', 'my')->getJson('/api/v1/projects/'.$project->id)->assertJsonPath('error', 'ရင်းမြစ်တွင် အသံမရှိပါ။');
        $project->update(['error' => 'Provider returned error XYZ']);
        $this->getJson('/api/v1/projects/'.$project->id)->assertJsonPath('error', 'Provider returned error XYZ');
    }

    public function test_authentication_emails_use_the_triggering_request_locale(): void
    {
        config(['recap.email_verification_required' => true]);
        foreach (['my', 'en'] as $locale) {
            Notification::fake();
            $email = $locale.'@example.com';
            $this->withHeader('Accept-Language', $locale)->postJson('/api/v1/auth/register', ['name' => 'New user', 'email' => $email, 'password' => 'GoodPassword123', 'password_confirmation' => 'GoodPassword123'])->assertCreated();
            $user = User::where('email', $email)->firstOrFail();
            Notification::assertSentTo($user, VerifyEmail::class, function ($notification) use ($user, $locale): bool {
                $mail = $notification->toMail($user);
                $this->assertSame($locale === 'my' ? 'သင့်အီးမေးလ်ကို အတည်ပြုပါ' : 'Verify your email address', $mail->subject);
                $this->assertStringContainsString('signature=', $mail->actionUrl);
                $this->assertStringContainsString('/email/verify/'.$user->id.'/', $mail->actionUrl);

                return true;
            });
            $this->withHeader('Accept-Language', $locale)->postJson('/api/v1/auth/forgot', ['email' => $user->email])->assertOk();
            Notification::assertSentTo($user, ResetPassword::class, function ($notification) use ($user, $locale): bool {
                $mail = $notification->toMail($user);
                $this->assertSame($locale === 'my' ? 'သင့်စကားဝှက်ကို ပြန်သတ်မှတ်ပါ' : 'Reset your password', $mail->subject);
                $this->assertStringContainsString('token=', $mail->actionUrl);
                $this->assertStringContainsString(urlencode($user->email), $mail->actionUrl);

                return true;
            });
        }
    }

    public function test_application_catalogs_match_frontend_messages_and_placeholders(): void
    {
        $english = require lang_path('en/app.php');
        $burmese = require lang_path('my/app.php');
        $this->assertSame(array_keys($english), array_keys($burmese));
        foreach (['my' => $burmese, 'en' => $english] as $locale => $messages) {
            $frontend = json_decode(file_get_contents(base_path('../frontend/messages/'.$locale.'.json')), true, flags: JSON_THROW_ON_ERROR);
            foreach ($messages as $key => $message) {
                $frontendKey = 'api'.str_replace(' ', '', ucwords(str_replace('_', ' ', $key)));
                $this->assertSame($message, $frontend['shared'][$frontendKey]);
                preg_match_all('/:([a-zA-Z_]+)/', $english[$key], $englishPlaceholders);
                preg_match_all('/:([a-zA-Z_]+)/', $burmese[$key], $burmesePlaceholders);
                $this->assertSame($englishPlaceholders[1], $burmesePlaceholders[1]);
            }
        }
    }
}
