<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\Project;
use App\Services\VideoSplitting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class VideoPartsController extends Controller
{
    private function project(Request $request, int $id): Project
    {
        return Project::where('user_id', $request->user()->id)->findOrFail($id);
    }

    public function split(Request $request, int $id, VideoSplitting $splitting): JsonResponse
    {
        $project = $this->project($request, $id);
        abort_if(in_array($project->status, ['queued', 'processing', 'rendering'], true), 409);
        abort_unless($project->split_enabled, 422);
        foreach (['source', 'recap'] as $kind) {
            $splitting->queue($id, $kind);
        }

        return response()->json($project->fresh(), 202);
    }

    public function file(Request $request, int $id, string $kind, string $revision, int $number): BinaryFileResponse
    {
        $project = $this->project($request, $id);
        $result = ($project->split_results ?? [])[$kind] ?? null;
        abort_unless($result && $result['status'] === 'ready' && $result['revision'] === $revision, 404);
        $part = collect($result['parts'])->firstWhere('number', $number);
        abort_unless($part && Storage::disk('local')->exists($part['path']), 404);
        $path = Storage::disk('local')->path($part['path']);
        if ($request->boolean('download')) {
            return response()->download($path, $kind.'-part-'.$number.'.mp4');
        }

        return response()->file($path);
    }
}
