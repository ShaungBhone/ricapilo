<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\UploadAssetRequest;
use App\Jobs\ProcessProject;
use App\Models\Project;
use App\Services\EditorSettings;
use App\Services\Media;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

class EditorController extends Controller
{
    private function project(Request $request, int $id): Project
    {
        return Project::where('user_id', $request->user()->id)->findOrFail($id);
    }

    private function mutable(Project $project): void
    {
        abort_if(in_array($project->status, ['queued', 'processing', 'rendering']), 409, __('app.wait_for_the_current_generation_to_finish'));
    }

    public function prepare(Request $request, int $id): JsonResponse
    {
        $project = $this->project($request, $id);
        DB::transaction(function () use ($project): void {
            $locked = Project::lockForUpdate()->findOrFail($project->id);
            $this->mutable($locked);
            if ($locked->media_path || $locked->source === 'upload') {
                return;
            }

            $locked->update(['status' => 'queued', 'stage' => 'prepare', 'error' => null]);
            ProcessProject::dispatch($project->id, 'prepare')->afterCommit();
        });

        return response()->json($project->fresh(), 202);
    }

    public function assets(Request $request, int $id, Media $media): JsonResponse
    {
        $project = $this->project($request, $id);
        $assets = $project->editor_assets ?? [];
        if ($project->media_path) {
            $assets[] = ['id' => 'source', 'name' => $project->title, ...$media->metadata($project->media_path), 'path' => $project->media_path];
        }

        return response()->json(array_map(function (array $asset): array {
            unset($asset['path']);

            return $asset;
        }, $assets));
    }

    public function upload(UploadAssetRequest $request, int $id, Media $media): JsonResponse
    {
        $project = $request->project();
        $file = $request->file('file');
        $path = $file->store('projects/'.$id.'/assets', 'local');
        try {
            $asset = ['id' => (string) Str::uuid(), 'name' => $file->getClientOriginalName(), 'path' => $path, ...$media->metadata($path)];
            DB::transaction(function () use ($project, $asset): void {
                $locked = Project::lockForUpdate()->findOrFail($project->id);
                $this->mutable($locked);
                $assets = $locked->editor_assets ?? [];
                abort_if(count($assets) >= 20, 422);
                $locked->update(['editor_assets' => [...$assets, $asset]]);
            });
        } catch (Throwable $throwable) {
            Storage::disk('local')->delete($path);
            throw $throwable;
        }

        unset($asset['path']);

        return response()->json($asset, 201);
    }

    public function stream(Request $request, int $id, string $assetId): BinaryFileResponse
    {
        $project = $this->project($request, $id);
        $asset = collect($project->editor_assets ?? [])->firstWhere('id', $assetId);
        $path = $assetId === 'source' ? $project->media_path : ($asset['path'] ?? null);
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return response()->file(Storage::disk('local')->path($path));
    }

    public function delete(Request $request, int $id, string $assetId, EditorSettings $editor): Response
    {
        $project = $this->project($request, $id);
        abort_if($assetId === 'source', 422);
        $path = DB::transaction(function () use ($project, $assetId, $editor): string {
            $locked = Project::lockForUpdate()->findOrFail($project->id);
            $this->mutable($locked);
            $assets = $locked->editor_assets ?? [];
            $asset = collect($assets)->firstWhere('id', $assetId);
            abort_unless($asset, 404);
            $settings = $locked->editor_settings ?? $editor->defaults($locked);
            foreach ($settings['slots'] as &$slot) {
                if ($slot['assetId'] === $assetId) {
                    $slot['assetId'] = null;
                }
            }

            if ($settings['audio']['musicAssetId'] === $assetId) {
                $settings['audio']['musicAssetId'] = null;
            }

            $locked->update(['editor_settings' => $settings, 'editor_assets' => array_values(array_filter($assets, fn (array $existing): bool => $existing['id'] !== $assetId)), 'video_path' => null, 'status' => $locked->audio_path ? 'audio_ready' : $locked->status]);

            return $asset['path'];
        });
        Storage::disk('local')->delete($path);

        return response()->noContent();
    }
}
