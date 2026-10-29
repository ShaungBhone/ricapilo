<?php

namespace Tests\Feature;

use App\Jobs\SplitVideo;
use App\Models\Project;
use App\Models\User;
use App\Services\Media;
use App\Services\VideoSplitting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class VideoSplittingTest extends TestCase
{
    use RefreshDatabase;

    private function queuedProject(): Project
    {
        Queue::fake([SplitVideo::class]);
        Storage::fake('local');
        $project = Project::factory()->create(['split_enabled' => true, 'split_minutes' => 5, 'media_path' => 'source.mp4']);
        app(VideoSplitting::class)->queue($project->id, 'source');

        return $project->fresh();
    }

    public static function durations(): array
    {
        return [[1800, 6, 300], [1920, 7, 120], [12, 1, 12], [300, 1, 300]];
    }

    #[DataProvider('durations')]
    public function test_parts_cover_the_whole_video_without_exposing_storage_paths(int $duration, int $count, int $lastDuration): void
    {
        $project = $this->queuedProject();
        $this->mock(Media::class)->shouldReceive('metadata')->once()->with('source.mp4')->andReturn([
            'kind' => 'video', 'duration' => $duration, 'hasAudio' => false, 'width' => 320, 'height' => 240,
        ]);
        Process::fake(function ($process) {
            file_put_contents(end($process->command), 'mp4');

            return Process::result();
        });
        $job = Queue::pushed(SplitVideo::class)->first();
        $job->handle(app(Media::class));

        $project->refresh();
        $result = $project->video_splits['source'];
        $this->assertSame('ready', $result['status']);
        $this->assertCount($count, $result['parts']);
        $this->assertSame($lastDuration, (int) $result['parts'][$count - 1]['duration']);
        $this->assertSame($duration, (int) $result['parts'][$count - 1]['end']);
        $this->assertArrayNotHasKey('path', $result['parts'][0]);
        $this->assertArrayNotHasKey('input', $result);
        $this->assertArrayNotHasKey('split_results', $project->toArray());
        Process::assertRanTimes(fn ($process): bool => in_array('libx264', $process->command, true), $count);
    }

    public function test_duplicate_requests_do_not_queue_duplicate_jobs_and_foreign_users_get_404(): void
    {
        $project = $this->queuedProject();
        $this->actingAs(User::findOrFail($project->user_id))->postJson('/api/v1/projects/'.$project->id.'/split')->assertAccepted();
        Queue::assertPushed(SplitVideo::class, 1);
        $this->actingAs(User::factory()->create())->postJson('/api/v1/projects/'.$project->id.'/split')->assertNotFound();
        $this->getJson('/api/v1/projects/'.$project->id.'/parts/source/'.$project->video_splits['source']['revision'].'/1')->assertNotFound();
    }

    public function test_settings_validation_and_stale_job_after_source_replacement(): void
    {
        $project = $this->queuedProject();
        $this->actingAs(User::findOrFail($project->user_id));
        foreach ([0, 61, 1.5] as $minutes) {
            $this->patchJson('/api/v1/projects/'.$project->id, ['split_minutes' => $minutes])->assertUnprocessable()->assertJsonValidationErrors('split_minutes');
        }

        $this->patchJson('/api/v1/projects/'.$project->id, ['split_minutes' => 2])->assertOk();
        Process::preventStrayProcesses();
        Queue::pushed(SplitVideo::class)->first()->handle(app(Media::class));
        $this->assertSame([], $project->fresh()->video_splits);
        Process::assertNothingRan();
    }

    public function test_split_failure_keeps_generated_video_ready_and_retry_gets_new_revision(): void
    {
        $project = $this->queuedProject();
        $this->mock(Media::class)->shouldReceive('metadata')->andReturn(['kind' => 'video', 'duration' => 600]);
        Process::fake(function ($process) {
            file_put_contents(end($process->command), 'partial mp4');

            return Process::result(exitCode: 1);
        });
        $project->update(['status' => 'ready', 'video_path' => 'recap.mp4']);
        Queue::pushed(SplitVideo::class)->first()->handle(app(Media::class));
        $project->refresh();
        $this->assertSame('ready', $project->status);
        $this->assertSame('failed', $project->video_splits['source']['status']);
        $this->assertSame([], Storage::disk('local')->allFiles('projects/'.$project->id.'/parts'));
        $revision = $project->video_splits['source']['revision'];
        app(VideoSplitting::class)->queue($project->id, 'source');
        $this->assertNotSame($revision, $project->fresh()->video_splits['source']['revision']);
    }

    public function test_replacing_the_source_during_processing_discards_stale_outputs(): void
    {
        $project = $this->queuedProject();
        $this->mock(Media::class)->shouldReceive('metadata')->once()->andReturn(['kind' => 'video', 'duration' => 600]);
        Process::fake(function ($process) use ($project) {
            file_put_contents(end($process->command), 'old video');
            $project->fresh()->update(['media_path' => 'new-source.mp4']);

            return Process::result();
        });
        Queue::pushed(SplitVideo::class)->first()->handle(app(Media::class));
        $this->assertSame([], $project->fresh()->video_splits);
        $this->assertSame([], Storage::disk('local')->allFiles('projects/'.$project->id.'/parts'));
    }

    public function test_audio_only_is_skipped_and_disabled_projects_are_not_queued(): void
    {
        $project = $this->queuedProject();
        $this->mock(Media::class)->shouldReceive('metadata')->once()->andReturn(['kind' => 'audio', 'duration' => 90]);
        Process::preventStrayProcesses();
        Queue::pushed(SplitVideo::class)->first()->handle(app(Media::class));
        $this->assertSame('skipped', $project->fresh()->video_splits['source']['status']);
        $project->update(['split_enabled' => false]);
        app(VideoSplitting::class)->queue($project->id, 'source');
        Queue::assertPushed(SplitVideo::class, 1);
        Process::assertNothingRan();
    }

    public function test_parts_require_ownership_and_are_removed_when_source_is_replaced(): void
    {
        $project = $this->queuedProject();
        $revision = $project->video_splits['source']['revision'];
        $path = 'projects/'.$project->id.'/parts/source/'.$revision.'/part-1.mp4';
        Storage::disk('local')->put($path, 'video');
        $results = $project->split_results;
        $results['source']['status'] = 'ready';
        $results['source']['parts'] = [['number' => 1, 'path' => $path, 'start' => 0, 'end' => 5, 'duration' => 5]];
        $project->update(['split_results' => $results]);
        $url = '/api/v1/projects/'.$project->id.'/parts/source/'.$revision.'/1';
        $this->getJson($url)->assertUnauthorized();
        $this->actingAs(User::findOrFail($project->user_id))->get($url)->assertOk();
        $this->get($url.'?download=1')->assertDownload('source-part-1.mp4');
        $this->actingAs(User::factory()->create())->getJson($url)->assertNotFound();
        $project->update(['media_path' => 'replacement.mp4']);
        Storage::disk('local')->assertMissing($path);
        $this->assertSame([], $project->fresh()->video_splits);
    }

    public function test_upload_automatically_queues_source_splitting(): void
    {
        Queue::fake([SplitVideo::class]);
        Storage::fake('local');
        $project = Project::factory()->create(['split_enabled' => true]);
        $this->mock(Media::class)->shouldReceive('metadata')->once()->andReturn(['kind' => 'video', 'duration' => 20]);
        $this->actingAs(User::findOrFail($project->user_id))
            ->post('/api/v1/projects/'.$project->id.'/upload', [
                'file' => UploadedFile::fake()->create('source.mp4', 2, 'video/mp4'),
            ], ['Accept' => 'application/json'])->assertOk();
        Queue::assertPushed(SplitVideo::class, fn (SplitVideo $job): bool => $job->kind === 'source' && $job->input === $project->fresh()->media_path);
    }

    public function test_real_mp4_parts_decode_with_audio_and_correct_durations(): void
    {
        if (getenv('SPLIT_INTEGRATION') !== '1') {
            $this->markTestSkipped('Set SPLIT_INTEGRATION=1 with FFmpeg and FFprobe available.');
        }

        Queue::fake([SplitVideo::class]);
        Storage::fake('local');
        config(['recap.ffmpeg' => getenv('FFMPEG_BINARY') ?: 'ffmpeg', 'recap.ffprobe' => getenv('FFPROBE_BINARY') ?: 'ffprobe']);
        $disk = Storage::disk('local');
        $disk->makeDirectory('fixture');

        $chunk = fn (string $type, string $data): string => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));
        for ($frame = 0; $frame < 65; $frame++) {
            $rgb = $frame < 60 ? "\xff\x00\x00" : "\x00\x00\xff";
            $png = "\x89PNG\r\n\x1a\n".$chunk('IHDR', pack('NNCCCCC', 64, 64, 8, 2, 0, 0, 0))
                .$chunk('IDAT', gzcompress(str_repeat("\x00".str_repeat($rgb, 64), 64))).$chunk('IEND', '');
            $disk->put('fixture/frame-'.sprintf('%03d', $frame).'.png', $png);
        }

        $result = Process::timeout(120)->run([
            config('recap.ffmpeg'), '-y', '-v', 'error', '-framerate', '1', '-i', $disk->path('fixture/frame-%03d.png'),
            '-f', 'lavfi', '-i', 'sine=frequency=440:duration=65', '-r', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-t', '65', $disk->path('source.mp4'),
        ]);
        $this->assertTrue($result->successful(), $result->errorOutput());
        $project = Project::factory()->create(['split_enabled' => true, 'split_minutes' => 1, 'media_path' => 'source.mp4']);
        app(VideoSplitting::class)->queue($project->id, 'source');
        Queue::pushed(SplitVideo::class)->first()->handle(app(Media::class));
        $parts = $project->fresh()->split_results['source']['parts'];
        $this->assertCount(2, $parts);
        foreach ($parts as $index => $part) {
            $metadata = app(Media::class)->metadata($part['path']);
            $this->assertEqualsWithDelta($index === 0 ? 60 : 5, $metadata['duration'], 0.15);
            $this->assertTrue($metadata['hasAudio']);
            $this->assertSame(64, $metadata['width']);
            $decode = Process::timeout(120)->run([config('recap.ffmpeg'), '-v', 'error', '-i', $disk->path($part['path']), '-c:v', 'libx264', '-c:a', 'aac', '-f', 'null', '-']);
            $this->assertTrue($decode->successful(), $decode->errorOutput());
            $probe = Process::run([config('recap.ffprobe'), '-v', 'error', '-show_entries', 'stream=codec_type,start_time,duration', '-of', 'json', $disk->path($part['path'])]);
            $streams = json_decode($probe->output(), true)['streams'];
            $this->assertEqualsWithDelta((float) $streams[0]['duration'], (float) $streams[1]['duration'], 0.15);
            $this->assertEqualsWithDelta(0, (float) $streams[0]['start_time'], 0.1);
            $pixel = Process::run([
                config('recap.ffmpeg'), '-v', 'error', '-i', $disk->path($part['path']),
                '-frames:v', '1', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-c:v', 'rawvideo', '-f', 'image2pipe', '-',
            ]);
            $this->assertTrue($pixel->successful(), $pixel->errorOutput());
            $this->assertGreaterThan(200, ord($pixel->output()[$index === 0 ? 0 : 2]));
            $this->assertLessThan(30, ord($pixel->output()[$index === 0 ? 2 : 0]));
        }
    }
}
