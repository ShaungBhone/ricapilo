<?php

namespace Tests\Feature;

use App\Exceptions\GenerationException;
use App\Models\Project;
use App\Services\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MediaTest extends TestCase
{
    use RefreshDatabase;

    public static function sources(): array
    {
        return [['youtube', 'abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk'], ['bilibili', 'BV1xx411c7mD', 'https://www.bilibili.com/video/BV1xx411c7mD'], ['dailymotion', 'x123', 'https://www.dailymotion.com/video/x123']];
    }

    #[DataProvider('sources')]
    public function test_selected_sources_and_legacy_projects_use_canonical_urls(string $source, string $id, string $url): void
    {
        Storage::fake('local');
        $project = Project::factory()->create(['source' => $source, 'source_id' => $id]);
        Process::fake(function ($process) use ($project, $url) {
            $this->assertSame($url, end($process->command));
            Storage::disk('local')->put('projects/'.$project->id.'/source.mp4', 'media');

            return Process::result();
        });
        $path = app(Media::class)->acquire($project);
        $this->assertFileExists($path);
        $this->assertSame('projects/'.$project->id.'/source.mp4', $project->fresh()->media_path);
        app(Media::class)->acquire($project->fresh());
        Process::assertRanTimes(fn ($p): bool => in_array('--no-playlist', $p->command, true), 1);
    }

    public function test_download_failure_offers_upload_or_transcript_fallback(): void
    {
        Storage::fake('local');
        Process::fake(['*' => Process::result(exitCode: 1)]);
        $project = Project::factory()->create(['source' => 'bilibili', 'source_id' => 'BV1xx411c7mD']);
        $this->expectException(GenerationException::class);
        app(Media::class)->acquire($project);
    }

    public function test_untrusted_source_id_is_rejected_before_starting_download(): void
    {
        Process::preventStrayProcesses();
        $project = Project::factory()->create(['source' => 'bilibili', 'source_id' => 'id;whoami']);
        try {
            app(Media::class)->acquire($project);
            $this->fail('Invalid IDs must be rejected.');
        } catch (GenerationException) {
            Process::assertNothingRan();
        }
    }
}
