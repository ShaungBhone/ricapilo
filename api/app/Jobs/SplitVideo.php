<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Models\Project;
use App\Services\Media;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

class SplitVideo implements ShouldQueue
{
    use Queueable;

    public int $timeout = 1800;

    public int $tries = 200;

    public int $maxExceptions = 1;

    public function __construct(
        public int $projectId,
        public string $kind,
        public string $revision,
        public string $input,
        public int $minutes,
    ) {}

    public function middleware(): array
    {
        return [(new WithoutOverlapping('project:'.$this->projectId))->shared()->expireAfter(1900)->releaseAfter(10)];
    }

    private function directory(): string
    {
        return 'projects/'.$this->projectId.'/parts/'.$this->kind.'/'.$this->revision;
    }

    private function publish(array $changes): bool
    {
        return DB::transaction(function () use ($changes): bool {
            $project = Project::lockForUpdate()->find($this->projectId);
            $results = $project?->split_results ?? [];
            if (($results[$this->kind]['revision'] ?? null) !== $this->revision) {
                return false;
            }

            $results[$this->kind] = [...$results[$this->kind], ...$changes];
            $project->update(['split_results' => $results]);

            return true;
        });
    }

    public function handle(Media $media): void
    {
        $disk = Storage::disk('local');
        if (! $this->publish(['status' => 'processing'])) {
            return;
        }

        try {
            $metadata = $media->metadata($this->input);
            if ($metadata['kind'] !== 'video') {
                $this->publish(['status' => 'skipped', 'progress' => 100]);

                return;
            }

            $disk->makeDirectory($this->directory());
            $seconds = $this->minutes * 60;
            $count = (int) ceil(round($metadata['duration'], 6) / $seconds);
            $parts = [];
            for ($index = 0; $index < $count; $index++) {
                $start = $index * $seconds;
                $length = min($seconds, $metadata['duration'] - $start);
                $path = $this->directory().'/part-'.($index + 1).'.mp4';
                $result = Process::timeout(1500)->run([
                    config('recap.ffmpeg'), '-y', '-v', 'error',
                    '-ss', (string) $start, '-i', $disk->path($this->input),
                    '-t', (string) $length, '-map', '0:v:0', '-map', '0:a:0?',
                    '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
                    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart',
                    $disk->path($path),
                ]);
                if (! $result->successful() || ! $disk->exists($path)) {
                    throw new RuntimeException('Video splitting failed.');
                }

                $parts[] = ['number' => $index + 1, 'start' => $start, 'end' => $start + $length, 'duration' => $length, 'path' => $path];
                if (! $this->publish(['progress' => (int) floor(100 * ($index + 1) / $count)])) {
                    $disk->deleteDirectory($this->directory());

                    return;
                }
            }

            if (! $this->publish(['status' => 'ready', 'progress' => 100, 'parts' => $parts])) {
                $disk->deleteDirectory($this->directory());
            }
        } catch (Throwable $throwable) {
            report($throwable);
            $this->failed($throwable);
        }
    }

    public function failed(?Throwable $error): void
    {
        Storage::disk('local')->deleteDirectory($this->directory());
        $this->publish(['status' => 'failed', 'error' => 'app.video_splitting_failed', 'parts' => []]);
    }
}
