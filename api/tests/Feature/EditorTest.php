<?php

namespace Tests\Feature;

use App\Jobs\ProcessProject;
use App\Models\Project;
use App\Models\User;
use App\Services\EditorSettings;
use App\Services\Media;
use App\Services\OpenRouter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class EditorTest extends TestCase
{
    use RefreshDatabase;

    private function ownProject(array $attributes = []): Project
    {
        $user = User::factory()->create();
        $this->actingAs($user);

        return Project::factory()->create(['user_id' => $user->id, ...$attributes]);
    }

    public function test_visual_edits_persist_without_invalidating_narration_and_unchanged_saves_preserve_outputs(): void
    {
        $project = $this->ownProject(['script' => 'မင်္ဂလာပါ', 'audio_path' => 'audio.mp3', 'video_path' => 'video.mp4', 'status' => 'ready', 'captions' => [['text' => 'မင်္ဂလာပါ', 'startMs' => 0, 'endMs' => 2000]]]);
        $settings = app(EditorSettings::class)->defaults($project);
        $settings['aspectRatio'] = '1:1';
        $this->patchJson('/api/v1/projects/'.$project->id, ['editor_settings' => $settings, 'title' => 'Edited', 'script' => 'မင်္ဂလာပါ'])->assertOk()->assertJsonPath('has_audio', true)->assertJsonPath('has_video', false)->assertJsonPath('editor_settings.aspectRatio', '1:1');
        $project->refresh()->update(['video_path' => 'new.mp4', 'status' => 'ready']);
        $this->patchJson('/api/v1/projects/'.$project->id, ['editor_settings' => $settings, 'script' => 'မင်္ဂလာပါ'])->assertOk()->assertJsonPath('has_video', true);
        $this->patchJson('/api/v1/projects/'.$project->id, ['script' => 'New script'])->assertOk()->assertJsonPath('has_audio', false)->assertJsonPath('has_video', false)->assertJsonPath('captions', null);
    }

    public function test_caption_edits_only_invalidate_video_and_invalid_timings_are_rejected(): void
    {
        $project = $this->ownProject(['audio_path' => 'audio.mp3', 'video_path' => 'video.mp4', 'status' => 'ready']);
        $this->patchJson('/api/v1/projects/'.$project->id, ['captions' => [['text' => 'Edited', 'startMs' => 50, 'endMs' => 1500]]])->assertOk()->assertJsonPath('has_audio', true)->assertJsonPath('has_video', false);
        $this->patchJson('/api/v1/projects/'.$project->id, ['captions' => [['text' => 'Bad', 'startMs' => 100, 'endMs' => 50]]])->assertUnprocessable();
        $this->patchJson('/api/v1/projects/'.$project->id, ['captions' => [['text' => 'Bad', 'startMs' => 100, 'endMs' => 100]]])->assertUnprocessable();
    }

    public function test_settings_reject_unknown_assets_malformed_slots_and_invalid_transforms(): void
    {
        $project = $this->ownProject();
        $settings = app(EditorSettings::class)->defaults($project);
        $settings['slots'][0]['assetId'] = (string) Str::uuid();
        $this->patchJson('/api/v1/projects/'.$project->id, ['editor_settings' => $settings])->assertUnprocessable();
        $settings = app(EditorSettings::class)->defaults($project);
        $settings['layout'] = 'four';
        $this->patchJson('/api/v1/projects/'.$project->id, ['editor_settings' => $settings])->assertUnprocessable();
        $settings = app(EditorSettings::class)->defaults($project);
        $settings['slots'][0]['x'] = -1;
        $this->patchJson('/api/v1/projects/'.$project->id, ['editor_settings' => $settings])->assertUnprocessable();
    }

    public function test_assets_are_probed_saved_streamed_with_ranges_and_removed_from_settings(): void
    {
        Storage::fake('local');
        Process::fake(['*' => Process::result(output: json_encode(['format' => ['duration' => 3], 'streams' => [['codec_type' => 'video', 'width' => 640, 'height' => 360]]]))]);
        $project = $this->ownProject(['audio_path' => 'audio.mp3', 'video_path' => 'video.mp4', 'status' => 'ready']);
        $upload = $this->post('/api/v1/projects/'.$project->id.'/assets', ['file' => UploadedFile::fake()->create('clip.mp4', 2, 'video/mp4')], ['Accept' => 'application/json'])->assertCreated()->json();
        $this->getJson('/api/v1/projects/'.$project->id.'/assets')->assertOk()->assertJsonPath('0.id', $upload['id'])->assertJsonMissingPath('0.path');
        Storage::disk('local')->put($project->fresh()->editor_assets[0]['path'], str_repeat('x', 2048));
        $this->get('/api/v1/projects/'.$project->id.'/assets/'.$upload['id'].'/stream', ['Range' => 'bytes=0-9'])->assertStatus(206)->assertHeader('Content-Range', 'bytes 0-9/2048');
        $settings = app(EditorSettings::class)->defaults($project->fresh());
        $settings['slots'][0]['assetId'] = $upload['id'];
        $this->patchJson('/api/v1/projects/'.$project->id, ['editor_settings' => $settings])->assertOk();
        $path = $project->fresh()->editor_assets[0]['path'];
        $this->deleteJson('/api/v1/projects/'.$project->id.'/assets/'.$upload['id'])->assertNoContent();
        $this->assertNull($project->fresh()->editor_settings['slots'][0]['assetId']);
        Storage::disk('local')->assertMissing($path);
        $this->get('/api/v1/projects/'.$project->id.'/assets/'.$upload['id'].'/stream')->assertNotFound();
    }

    public function test_music_deletion_clears_references_and_invalid_uploads_do_not_leave_files(): void
    {
        Storage::fake('local');
        Process::fake(['*' => Process::result(output: json_encode(['format' => ['duration' => 3], 'streams' => [['codec_type' => 'audio']]]))]);
        $project = $this->ownProject();
        $upload = $this->post('/api/v1/projects/'.$project->id.'/assets', ['file' => UploadedFile::fake()->create('music.mp3', 2, 'audio/mpeg')], ['Accept' => 'application/json'])->assertCreated()->json();
        $settings = app(EditorSettings::class)->defaults($project->fresh());
        $settings['audio']['musicAssetId'] = $upload['id'];
        $this->patchJson('/api/v1/projects/'.$project->id, ['editor_settings' => $settings])->assertOk();
        $this->deleteJson('/api/v1/projects/'.$project->id.'/assets/'.$upload['id'])->assertNoContent();
        $this->assertNull($project->fresh()->editor_settings['audio']['musicAssetId']);
        Process::fake(['*' => Process::result(exitCode: 1)]);
        $this->post('/api/v1/projects/'.$project->id.'/assets', ['file' => UploadedFile::fake()->create('bad.mp4', 2, 'video/mp4')], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_editor_endpoints_are_tenant_scoped_and_mutations_are_blocked_while_processing(): void
    {
        $project = Project::factory()->create();
        $this->actingAs(User::factory()->create());
        $base = '/api/v1/projects/'.$project->id;
        $this->getJson($base.'/assets')->assertNotFound();
        $this->get($base.'/assets/source/stream')->assertNotFound();
        $this->postJson($base.'/prepare')->assertNotFound();
        $this->deleteJson($base.'/assets/'.Str::uuid())->assertNotFound();
        $this->postJson($base.'/assets')->assertNotFound();
        $project = $this->ownProject(['status' => 'processing']);
        $base = '/api/v1/projects/'.$project->id;
        $this->patchJson($base, ['title' => 'Changed'])->assertConflict();
        $this->postJson($base.'/prepare')->assertConflict();
        $this->postJson($base.'/assets')->assertConflict();
        $this->deleteJson($base.'/assets/'.Str::uuid())->assertConflict();
    }

    public function test_preparation_is_queued_without_ai_credentials_and_is_retryable(): void
    {
        Queue::fake();
        $project = $this->ownProject(['source' => 'youtube', 'source_id' => 'abcdef', 'media_path' => null, 'stage' => 'prepare', 'status' => 'failed']);
        $this->postJson('/api/v1/projects/'.$project->id.'/prepare')->assertAccepted()->assertJsonPath('stage', 'prepare')->assertJsonPath('status', 'queued');
        Queue::assertPushed(ProcessProject::class, fn (ProcessProject $job): bool => $job->stage === 'prepare');
        $this->postJson('/api/v1/projects/'.$project->id.'/prepare')->assertConflict();
    }

    public function test_preparation_preserves_existing_content_and_does_not_call_ai(): void
    {
        Http::preventStrayRequests();
        Storage::fake('local');
        $project = $this->ownProject(['script' => 'Reviewed', 'audio_path' => 'voice.mp3', 'stage' => 'prepare']);
        $media = $this->mock(Media::class);
        $media->shouldReceive('acquire')->once()->andReturnUsing(function (Project $p): string {
            $p->update(['media_path' => 'projects/'.$p->id.'/source.mp4']);

            return 'source.mp4';
        });
        (new ProcessProject($project->id, 'prepare'))->handle(app(OpenRouter::class), $media);
        $this->assertSame('Reviewed', $project->fresh()->script);
        $this->assertSame('audio_ready', $project->fresh()->status);
        $this->assertSame('source', $project->fresh()->editor_settings['slots'][0]['assetId']);
        Http::assertNothingSent();
    }

    public function test_source_replacement_clears_generated_outputs_and_preserves_overlays_and_music(): void
    {
        Storage::fake('local');
        Process::fake(['*' => Process::result(output: json_encode(['format' => ['duration' => 3], 'streams' => [['codec_type' => 'video', 'width' => 640, 'height' => 360]]]))]);
        $project = $this->ownProject(['media_path' => 'projects/1/old.mp4', 'script' => 'Reviewed', 'audio_path' => 'voice.mp3', 'captions' => [['text' => 'Caption', 'startMs' => 0, 'endMs' => 1000]], 'video_path' => 'recap.mp4', 'status' => 'ready']);
        Storage::disk('local')->put($project->media_path, 'old');
        $settings = app(EditorSettings::class)->defaults($project);
        $settings['aspectRatio'] = '4:5';
        $settings['textOverlays'] = [['id' => (string) Str::uuid(), 'text' => 'Keep this', 'x' => 0.5, 'y' => 0.2, 'fontSize' => 36, 'color' => '#ffffff', 'bold' => true, 'background' => true, 'align' => 'center', 'visible' => true]];
        $project->update(['editor_settings' => $settings]);
        $this->post('/api/v1/projects/'.$project->id.'/upload', ['file' => UploadedFile::fake()->create('new.mp4', 2, 'video/mp4')], ['Accept' => 'application/json'])->assertOk()->assertJsonPath('script', null)->assertJsonPath('captions', null)->assertJsonPath('has_audio', false)->assertJsonPath('editor_settings.aspectRatio', '4:5')->assertJsonPath('editor_settings.textOverlays.0.text', 'Keep this');
        Storage::disk('local')->assertMissing('projects/1/old.mp4');
        $this->assertNotNull($project->fresh()->media_path);
    }

    public function test_video_export_can_be_queued_without_ai_credentials(): void
    {
        Queue::fake();
        $project = $this->ownProject(['audio_path' => 'voice.mp3']);
        $this->postJson('/api/v1/projects/'.$project->id.'/generate', ['stage' => 'video'])->assertAccepted();
        Queue::assertPushed(ProcessProject::class, fn (ProcessProject $job): bool => $job->stage === 'video');
    }

    public function test_existing_project_editor_columns_are_preserved_by_compatibility_migration(): void
    {
        $project = $this->ownProject();
        $settings = app(EditorSettings::class)->defaults($project);
        $project->update(['editor_settings' => $settings]);
        $migration = require database_path('migrations/2026_10_07_103203_evolve_project_editor_schema.php');
        $migration->up();
        $this->assertSame($settings, $project->fresh()->editor_settings);
    }

    public function test_render_worker_sends_saved_editor_state_without_calling_ai(): void
    {
        Storage::fake('local');
        $project = $this->ownProject(['assistant_id' => null, 'audio_path' => 'projects/1/voice.mp3', 'captions' => [['text' => 'Caption', 'startMs' => 0, 'endMs' => 1000]]]);
        $settings = app(EditorSettings::class)->defaults($project);
        $settings['aspectRatio'] = '1:1';
        $project->update(['editor_settings' => $settings]);
        config(['recap.renderer_token' => 'test-token', 'recap.renderer_url' => 'http://renderer.test']);
        Http::preventStrayRequests();
        Http::fake(['http://renderer.test/render' => function ($request) use ($project, $settings) {
            $this->assertSame($settings, $request['editorSettings']);
            $this->assertSame($project->captions, $request['captions']);
            Storage::disk('local')->put('projects/'.$project->id.'/recap.mp4', 'rendered');

            return Http::response(['path' => 'projects/'.$project->id.'/recap.mp4']);
        }]);
        (new ProcessProject($project->id, 'video'))->handle(app(OpenRouter::class), app(Media::class));
        $this->assertSame('ready', $project->fresh()->status);
        Http::assertSentCount(1);
    }
    public function test_media_metadata_ignores_cover_art_and_uses_rotated_display_dimensions(): void
    {
        Process::fake(['*' => Process::result(output: json_encode(['format' => ['duration' => 3], 'streams' => [['codec_type' => 'video', 'width' => 100, 'height' => 100, 'disposition' => ['attached_pic' => 1]], ['codec_type' => 'video', 'width' => 640, 'height' => 360, 'side_data_list' => [['side_data_type' => 'Display Matrix', 'rotation' => 90]]], ['codec_type' => 'audio']]]))]);
        $metadata = app(Media::class)->metadata('test.mp4');
        $this->assertSame(360, $metadata['width']);
        $this->assertSame(640, $metadata['height']);
        $this->assertTrue($metadata['hasAudio']);
        Process::fake(['*' => Process::result(output: json_encode(['format' => ['duration' => 3], 'streams' => [['codec_type' => 'video', 'width' => 100, 'height' => 100, 'disposition' => ['attached_pic' => 1]], ['codec_type' => 'audio']]]))]);
        $this->assertSame('audio', app(Media::class)->metadata('music.mp3')['kind']);
    }

}
