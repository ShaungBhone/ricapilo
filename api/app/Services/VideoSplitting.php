<?php

declare(strict_types=1);

namespace App\Services;

use App\Jobs\SplitVideo;
use App\Models\Project;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class VideoSplitting
{
    public function queue(int $projectId, string $kind): void
    {
        DB::transaction(function () use ($projectId, $kind): void {
            $project = Project::lockForUpdate()->find($projectId);
            if (! $project || ! $project->split_enabled) {
                return;
            }

            $input = $kind === 'source' ? $project->media_path : $project->video_path;
            if (! $input) {
                return;
            }

            $results = $project->split_results ?? [];
            if (in_array($results[$kind]['status'] ?? null, ['queued', 'processing'], true)) {
                return;
            }

            $revision = (string) Str::uuid();
            $results[$kind] = [
                'revision' => $revision,
                'input' => $input,
                'status' => 'queued',
                'progress' => 0,
                'error' => null,
                'parts' => [],
            ];
            $project->update(['split_results' => $results]);
            SplitVideo::dispatch($projectId, $kind, $revision, $input, $project->split_minutes)->afterCommit();
        });
    }
}
