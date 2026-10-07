<?php

namespace Tests\Feature;

use App\Exceptions\GenerationException;
use App\Models\Assistant;
use App\Models\Project;
use App\Models\User;
use App\Services\Discovery;
use App\Services\OpenRouter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;

class DiscoveryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->freezeTime();
        Http::preventStrayRequests();
        Process::preventStrayProcesses();
        config(['recap.youtube_key' => 'test-youtube-key']);
    }

    private function video(string $id = 'abcdefghijk', string $duration = 'PT1M', ?string $published = null): array
    {
        return ['id' => $id, 'snippet' => ['title' => 'Space &amp; science', 'channelTitle' => 'Creator', 'publishedAt' => $published ?? now()->subDay()->toIso8601String()], 'contentDetails' => ['duration' => $duration], 'statistics' => ['viewCount' => '100']];
    }

    public function test_broad_viral_prompt_uses_chart_and_filters_old_long_and_live_videos(): void
    {
        Http::fake(['*/youtube/v3/videos*' => Http::response(['items' => [$this->video(), $this->video('longabcdefg', 'PT5M'), $this->video('oldabcdefgh', 'PT1M', now()->subDays(60)->toIso8601String()), array_replace_recursive($this->video('liveabcdefg'), ['snippet' => ['liveBroadcastContent' => 'live']])]])]);
        $this->actingAs(User::factory()->create())->postJson('/api/v1/discover', ['prompt' => 'give me viral video to recap', 'platform' => 'youtube'])->assertOk()->assertJsonPath('query', '')->assertJsonPath('criteria.mode', 'popular')->assertJsonCount(1, 'videos')->assertJsonPath('videos.0.duration', 60)->assertJsonPath('videos.0.views', 100)->assertJsonPath('videos.0.title', 'Space & science');
        Http::assertSent(fn (Request $r): bool => $r['chart'] === 'mostPopular' && $r['regionCode'] === 'MM' && ! isset($r['q']));
        Http::assertSentCount(1);
    }

    public function test_topic_search_respects_requested_recency_and_retains_missing_views(): void
    {
        $video = $this->video();
        unset($video['statistics']);
        Http::fake(['*/youtube/v3/search*' => Http::response(['items' => [['id' => ['videoId' => 'abcdefghijk']]]]), '*/youtube/v3/videos*' => Http::response(['items' => [$video]])]);
        $result = app(Discovery::class)->search('space', 'youtube', true, ['mode' => 'popular', 'query' => 'space', 'days' => 7]);
        $this->assertNull($result['videos'][0]['views']);
        Http::assertSent(fn (Request $r): bool => ($r['q'] ?? null) === 'space' && $r['order'] === 'viewCount' && $r['publishedAfter'] === now()->subDays(7)->toIso8601String());
    }

    public function test_ai_intent_failure_preserves_video_search_quietly_and_logs_safe_diagnostics(): void
    {
        $user = User::factory()->create();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        Log::spy();
        $this->mock(OpenRouter::class)->shouldReceive('discoveryIntent')->once()->withArgs(fn ($viewer, $model, $prompt): bool => $viewer->id === $user->id && $model === $assistant->llm_model && $prompt === 'space')->andThrow(new GenerationException('app.ai_generation_failed_check_your_key_credits_and_model_settings'));
        Http::fake(['*/youtube/v3/search*' => Http::response(['items' => [['id' => ['videoId' => 'abcdefghijk']]]]), '*/youtube/v3/videos*' => Http::response(['items' => [$this->video()]])]);

        $this->actingAs($user)->withHeader('Accept-Language', 'en')->postJson('/api/v1/discover', ['prompt' => 'space', 'platform' => 'youtube', 'assistant_id' => $assistant->id])->assertOk()->assertJsonPath('query', 'space')->assertJsonPath('criteria.mode', 'topic')->assertJsonCount(1, 'videos')->assertJsonCount(0, 'warnings');
        Log::shouldHaveReceived('warning')->once()->with('Discovery intent unavailable; using prompt parser.', ['exception_type' => GenerationException::class]);
    }

    public function test_unsupported_regional_chart_falls_back_with_warning(): void
    {
        Http::fakeSequence()->push(['error' => ['errors' => [['reason' => 'videoChartNotFound']]]], 400)->push(['items' => [$this->video()]]);
        $result = app(Discovery::class)->search('', 'youtube');
        $this->assertCount(1, $result['videos']);
        $this->assertSame([__('app.regional_chart_unavailable_showing_global_results')], $result['warnings']);
        Http::assertSent(fn (Request $r): bool => $r['chart'] === 'mostPopular' && ! isset($r['regionCode']));
    }

    public function test_bilibili_normalizes_public_metadata_filters_and_deduplicates(): void
    {
        config(['recap.youtube_key' => null]);
        $item = ['bvid' => 'BV1xx411c7mD', 'title' => '<em>Space</em> &amp; science', 'author' => 'Creator', 'pic' => '//i0.hdslb.com/example.jpg', 'play' => 99, 'duration' => '1:30', 'pubdate' => now()->subDay()->timestamp];
        Process::fake(['*' => Process::result(output: json_encode(['ok' => true, 'items' => [$item, $item, [...$item, 'bvid' => 'BV2xx411c7mD', 'duration' => '5:00'], [...$item, 'bvid' => 'bad']]]))]);
        $this->actingAs(User::factory()->create())->postJson('/api/v1/discover', ['prompt' => 'space', 'platform' => 'all'])->assertOk()->assertJsonCount(1, 'videos')->assertJsonPath('videos.0.platform', 'bilibili')->assertJsonPath('videos.0.title', 'Space & science')->assertJsonPath('videos.0.views', 99)->assertJsonPath('videos.0.duration', 90)->assertJsonPath('videos.0.thumbnail', 'https://i0.hdslb.com/example.jpg')->assertJsonCount(0, 'warnings');
        Process::assertRan(fn ($p): bool => $p->command[2] === 'search' && $p->command[3] === 'space');
        Http::assertNothingSent();
    }

    public function test_bilibili_hot_feed_and_failure_warning(): void
    {
        Process::fake(['*' => Process::result(output: '{"ok":false}', exitCode: 1)]);
        $result = app(Discovery::class)->search('', 'bilibili');
        $this->assertSame([], $result['videos']);
        $this->assertSame([__('app.bilibili_is_temporarily_unavailable')], $result['warnings']);
        Process::assertRan(fn ($p): bool => $p->command[2] === 'hot');
    }

    public function test_youtube_failure_preserves_bilibili_results(): void
    {
        Http::fake(['*' => Http::response([], 503)]);
        Process::fake(['*' => Process::result(output: json_encode(['ok' => true, 'items' => [['bvid' => 'BV1xx411c7mD', 'title' => 'Space', 'duration' => 30]]]))]);
        $result = app(Discovery::class)->search('space', 'all');
        $this->assertCount(1, $result['videos']);
        $this->assertSame([__('app.youtube_is_temporarily_unavailable')], $result['warnings']);
    }

    public function test_omitting_platform_searches_both_sources_and_preserves_recap_identifiers(): void
    {
        $user = User::factory()->create();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        Http::fake(['*/youtube/v3/search*' => Http::response(['items' => [['id' => ['videoId' => 'abcdefghijk']]]]), '*/youtube/v3/videos*' => Http::response(['items' => [$this->video()]])]);
        Process::fake(['*' => Process::result(output: json_encode(['ok' => true, 'items' => [['bvid' => 'BV1xx411c7mD', 'title' => 'Space', 'duration' => 30]]]))]);

        $response = $this->actingAs($user)->postJson('/api/v1/discover', ['prompt' => 'space'])->assertOk()->assertJsonCount(2, 'videos')->assertJsonCount(0, 'warnings');
        foreach ($response->json('videos') as $video) {
            $this->postJson('/api/v1/projects', ['title' => $video['title'], 'assistant_id' => $assistant->id, 'source' => $video['platform'], 'source_id' => $video['id'], 'format' => 'vertical', 'target_seconds' => 60])->assertCreated()->assertJsonPath('source', $video['platform'])->assertJsonPath('source_id', $video['id']);
        }
        Http::assertSentCount(2);
        Process::assertRan(fn ($process): bool => $process->command[2] === 'search');
    }

    public function test_partial_source_failure_returns_results_without_notices(): void
    {
        Http::fake(['*' => Http::response([], 503)]);
        Process::fake(['*' => Process::result(output: json_encode(['ok' => true, 'items' => [['bvid' => 'BV1xx411c7mD', 'title' => 'Space', 'duration' => 30]]]))]);
        Log::spy();

        $this->actingAs(User::factory()->create())->postJson('/api/v1/discover', ['prompt' => 'space'])->assertOk()->assertJsonCount(1, 'videos')->assertJsonCount(0, 'warnings');
        Log::shouldHaveReceived('warning')->once()->with('Discovery source unavailable.', ['provider' => 'youtube', 'exception_type' => RequestException::class]);
    }

    public function test_source_failures_without_results_return_one_generic_localized_notice(): void
    {
        Http::fake(['*' => Http::response([], 503)]);
        Process::fake(['*' => Process::result(output: '{"ok":false}', exitCode: 1)]);
        $this->actingAs(User::factory()->create());

        foreach (['en', 'my'] as $locale) {
            $this->withHeader('Accept-Language', $locale)->postJson('/api/v1/discover', ['prompt' => 'space'])->assertOk()->assertJsonCount(0, 'videos')->assertJsonCount(1, 'warnings')->assertJsonPath('warnings.0', trans('app.video_search_unavailable_please_try_again', [], $locale));
        }
    }

    public function test_successful_search_with_no_matches_has_no_failure_notice(): void
    {
        Http::fake(['*' => Http::response(['items' => []])]);
        Process::fake(['*' => Process::result(output: '{"ok":true,"items":[]}')]);

        $this->actingAs(User::factory()->create())->postJson('/api/v1/discover', ['prompt' => 'space'])->assertOk()->assertJsonCount(0, 'videos')->assertJsonCount(0, 'warnings');
    }

    public function test_ai_failure_without_matches_returns_a_generic_notice(): void
    {
        $user = User::factory()->create();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $this->mock(OpenRouter::class)->shouldReceive('discoveryIntent')->once()->andThrow(new GenerationException('app.ai_generation_failed_check_your_key_credits_and_model_settings'));
        Http::fake(['*' => Http::response(['items' => []])]);
        Process::fake(['*' => Process::result(output: '{"ok":true,"items":[]}')]);

        $this->actingAs($user)->withHeader('Accept-Language', 'en')->postJson('/api/v1/discover', ['prompt' => 'space', 'assistant_id' => $assistant->id])->assertOk()->assertJsonCount(0, 'videos')->assertJsonPath('warnings.0', 'Video search is temporarily unavailable. Please try again.');
    }

    public function test_new_projects_accept_bilibili_and_reject_dailymotion_without_affecting_legacy_projects(): void
    {
        $user = User::factory()->create();
        $assistant = Assistant::factory()->create(['user_id' => $user->id]);
        $data = ['title' => 'Space', 'assistant_id' => $assistant->id, 'source' => 'bilibili', 'source_id' => 'BV1xx411c7mD', 'format' => 'vertical', 'target_seconds' => 60];
        $this->actingAs($user)->postJson('/api/v1/projects', $data)->assertCreated()->assertJsonPath('source', 'bilibili');
        $this->postJson('/api/v1/projects', [...$data, 'source_id' => 'invalid'])->assertUnprocessable();
        $this->postJson('/api/v1/projects', [...$data, 'source' => 'dailymotion', 'source_id' => 'x123'])->assertUnprocessable();
        $this->postJson('/api/v1/discover', ['prompt' => 'space', 'platform' => 'dailymotion'])->assertUnprocessable();
        $legacy = Project::factory()->create(['user_id' => $user->id, 'assistant_id' => $assistant->id, 'source' => 'dailymotion', 'source_id' => 'x123']);
        $this->getJson('/api/v1/projects/'.$legacy->id)->assertOk()->assertJsonPath('source', 'dailymotion');
    }
}
