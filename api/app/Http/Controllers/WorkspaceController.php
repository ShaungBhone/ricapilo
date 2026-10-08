<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Ai\Agents\AssistantChat;
use App\Ai\OpenRouter;
use App\Exceptions\GenerationException;
use App\Http\Requests\DiscoverRequest;
use App\Http\Requests\GenerateProjectRequest;
use App\Http\Requests\SaveAdminSettingsRequest;
use App\Http\Requests\SaveAssistantRequest;
use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\TalkRequest;
use App\Http\Requests\TranscribeRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Http\Requests\UploadProjectMediaRequest;
use App\Jobs\ProcessProject;
use App\Models\Assistant;
use App\Models\Conversation;
use App\Models\Project;
use App\Services\Discovery;
use App\Services\EditorSettings;
use App\Services\Media;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;
use Laravel\Ai\Messages\Message;
use Laravel\Ai\Transcription;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;

class WorkspaceController extends Controller
{
    public function models(OpenRouter $ai): JsonResponse
    {
        $disabledModels = $this->disabledModels();

        $models = array_filter(
            $ai->models(),
            fn (array $model): bool => ! in_array($model['id'], $disabledModels, true),
        );

        return response()->json(array_values($models));
    }

    /** @return Collection<int, Assistant> */
    public function assistants(Request $request): Collection
    {
        return Assistant::where('user_id', $request->user()->id)->latest()->get();
    }

    public function saveAssistant(SaveAssistantRequest $request, OpenRouter $ai, ?int $id = null): JsonResponse
    {
        $validated = $request->validated();
        foreach (['llm_model' => 'text', 'stt_model' => 'transcription', 'tts_model' => 'speech'] as $key => $kind) {
            $ai->checkModel($validated[$key], $kind);
        }

        $assistant = $id
            ? Assistant::where('user_id', $request->user()->id)->findOrFail($id)
            : new Assistant(['user_id' => $request->user()->id]);
        $assistant->fill($validated)->save();

        return response()->json($assistant, $id ? 200 : 201);
    }

    public function deleteAssistant(Request $request, int $id): Response
    {
        Assistant::where('user_id', $request->user()->id)->findOrFail($id)->delete();

        return response()->noContent();
    }

    public function discover(DiscoverRequest $request, OpenRouter $ai, Discovery $discovery): JsonResponse
    {
        $validated = $request->validated();
        $criteria = $discovery->intent($validated['prompt']);
        $warnings = [];
        $intentReady = false;
        if (! empty($validated['assistant_id'])) {
            $assistant = Assistant::where('user_id', $request->user()->id)->findOrFail($validated['assistant_id']);
            try {
                $intent = $ai->discoveryIntent($assistant->llm_model, $validated['prompt']);
                $criteria = $discovery->intent($validated['prompt'], $intent);
                $intentReady = true;
            } catch (GenerationException|ValidationException|ConnectionException $exception) {
                Log::warning('Discovery intent unavailable; using prompt parser.', [
                    'exception_type' => $exception::class,
                ]);
                $warnings[] = __('app.video_search_unavailable_please_try_again');
            }
        }

        $result = $discovery->search($criteria['query'], $validated['platform'] ?? 'all', true, $criteria);
        $shouldRerank = $intentReady
            && $criteria['mode'] === 'topic'
            && $criteria['query'] !== ''
            && count($result['videos']) > 1;
        if ($shouldRerank) {
            $result['videos'] = $ai->rerankVideos($validated['prompt'], $result['videos']);
        }

        $searchUnavailable = $result['videos'] === [] && ($warnings !== [] || $result['warnings'] !== []);

        $responseWarnings = $searchUnavailable ? [__('app.video_search_unavailable_please_try_again')] : [];

        return response()->json([
            'query' => $criteria['query'],
            ...$result,
            'warnings' => $responseWarnings,
        ]);
    }

    public function projects(Request $request): LengthAwarePaginator
    {
        return Project::where('user_id', $request->user()->id)->latest()->paginate(20);
    }

    private function project(Request $request, int $id): Project
    {
        return Project::where('user_id', $request->user()->id)->findOrFail($id);
    }

    public function showProject(Request $request, int $id): Project
    {
        return $this->project($request, $id);
    }

    public function createProject(StoreProjectRequest $request, OpenRouter $ai): JsonResponse
    {
        $validated = $request->validated();
        if ($validated['source'] !== 'upload' && empty($validated['source_id'])) {
            throw ValidationException::withMessages(['source_id' => __('app.choose_a_video_first')]);
        }

        if ($validated['source'] === 'bilibili' && ! preg_match('/^BV[a-zA-Z0-9]{10}$/', $validated['source_id'])) {
            throw ValidationException::withMessages(['source_id' => __('app.choose_a_video_first')]);
        }

        $generateScript = (bool) ($validated['generate_script'] ?? false);
        unset($validated['generate_script']);
        if ($generateScript) {
            $unverified = config('recap.email_verification_required') && ! $request->user()->hasVerifiedEmail();
            abort_if($unverified, 403, __('Your email address is not verified.'));
            $hasEnabledAssistant = Assistant::where('user_id', $request->user()->id)
                ->where('enabled', true)
                ->whereKey($validated['assistant_id'])
                ->exists();
            if (! $hasEnabledAssistant) {
                throw ValidationException::withMessages(['assistant_id' => __('app.choose_an_enabled_assistant')]);
            }

            $ai->ensureConfigured();
        }

        $project = DB::transaction(function () use ($request, $validated, $generateScript): Project {
            $project = Project::create([
                'user_id' => $request->user()->id,
                ...$validated,
                'status' => $generateScript ? 'queued' : 'draft',
                'stage' => $generateScript ? 'script' : null,
            ]);
            if ($generateScript) {
                ProcessProject::dispatch($project->id, 'script')->afterCommit();
            }

            return $project;
        });

        return response()->json($project->fresh(), 201);
    }

    public function updateProject(UpdateProjectRequest $request, EditorSettings $editor): Project
    {
        $project = $request->project();
        $validated = $request->validated();
        DB::transaction(function () use ($project, $validated, $editor): void {
            $locked = Project::lockForUpdate()->findOrFail($project->id);
            $busy = in_array($locked->status, ['queued', 'processing', 'rendering']);
            abort_if($busy, 409, __('app.wait_for_the_current_generation_to_finish'));
            if (isset($validated['editor_settings'])) {
                $validated['editor_settings'] = $editor->validate($validated['editor_settings'], $locked);
            }

            if (isset($validated['captions'])) {
                foreach ($validated['captions'] as &$caption) {
                    $caption['startMs'] = (int) $caption['startMs'];
                    $caption['endMs'] = (int) $caption['endMs'];
                }
            }

            $changes = array_filter(
                $validated,
                fn (mixed $value, string $key): bool => $value != $locked->$key,
                ARRAY_FILTER_USE_BOTH,
            );
            $locked->fill($changes);
            if (array_key_exists('script', $changes)) {
                $locked->audio_path = null;
                $locked->video_path = null;
                $locked->captions = null;
                $locked->status = $locked->script ? 'script_ready' : 'draft';
            }

            if (array_key_exists('transcript', $changes) || isset($changes['assistant_id'])) {
                $locked->script = null;
                $locked->audio_path = null;
                $locked->video_path = null;
                $locked->captions = null;
                $locked->status = 'draft';
            }

            $videoFields = ['title', 'format', 'caption_style', 'captions', 'editor_settings'];
            if (array_intersect(array_keys($changes), $videoFields)) {
                $locked->video_path = null;
                if ($locked->audio_path) {
                    $locked->status = 'audio_ready';
                }
            }

            $locked->save();
        });

        return $project->fresh();
    }

    public function upload(UploadProjectMediaRequest $request, Media $media, EditorSettings $editor): Project
    {
        $project = $request->project();
        $path = $request->file('file')->store('projects/'.$project->id, 'local');
        try {
            $media->metadata($path);
            $oldPath = DB::transaction(function () use ($project, $path, $editor): ?string {
                $locked = Project::lockForUpdate()->findOrFail($project->id);
                abort_if(in_array($locked->status, ['queued', 'processing', 'rendering']), 409);
                $oldPath = $locked->media_path;
                $settings = $locked->editor_settings ?? $editor->defaults($locked);
                $settings['slots'][0] = [
                    'assetId' => 'source',
                    'mode' => $settings['slots'][0]['mode'],
                    'x' => 0.5,
                    'y' => 0.5,
                    'scale' => 1,
                    'visible' => true,
                ];
                $locked->update([
                    'media_path' => $path,
                    'source' => 'upload',
                    'transcript' => null,
                    'script' => null,
                    'audio_path' => null,
                    'video_path' => null,
                    'captions' => null,
                    'editor_settings' => $settings,
                    'status' => 'draft',
                    'stage' => null,
                    'error' => null,
                ]);

                return $oldPath;
            });
        } catch (Throwable $throwable) {
            Storage::disk('local')->delete($path);
            throw $throwable;
        }

        if ($oldPath && $oldPath !== $path) {
            Storage::disk('local')->delete($oldPath);
        }

        return $project->fresh();
    }

    public function generate(GenerateProjectRequest $request, OpenRouter $ai): JsonResponse
    {
        $project = $request->project();
        $stage = $request->validated('stage');
        if ($stage !== 'video') {
            $ai->ensureConfigured();
        }

        DB::transaction(function () use ($project, $stage): void {
            $locked = Project::lockForUpdate()->findOrFail($project->id);
            $busy = in_array($locked->status, ['queued', 'processing', 'rendering']);
            abort_if($busy, 409, __('app.generation_is_already_running'));
            if ($stage === 'audio') {
                abort_unless($locked->script, 422, __('app.generate_and_review_the_script_first'));
            }

            if ($stage === 'video') {
                abort_unless($locked->audio_path, 422, __('app.generate_narration_first'));
            }

            if ($stage === 'script') {
                $locked->script = null;
                $locked->audio_path = null;
                $locked->captions = null;
            }

            if ($stage !== 'video') {
                $locked->video_path = null;
            }

            $locked->update(['status' => 'queued', 'stage' => $stage, 'error' => null]);
            ProcessProject::dispatch($project->id, $stage)->afterCommit();
        });

        return response()->json($project->fresh(), 202);
    }

    public function download(Request $request, int $id, string $kind): Response|BinaryFileResponse
    {
        $project = $this->project($request, $id);
        if ($kind === 'script') {
            abort_unless($project->script, 404);

            return response($project->script)
                ->header('Content-Type', 'text/plain; charset=utf-8')
                ->header('Content-Disposition', 'attachment; filename="recap.txt"');
        }

        $path = match ($kind) {
            'audio' => $project->audio_path,
            'video' => $project->video_path,
            default => null,
        };
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        $extension = $kind === 'audio' ? 'mp3' : 'mp4';

        return response()->file(Storage::disk('local')->path($path), [
            'Content-Disposition' => 'inline; filename="recap.'.$extension.'"',
        ]);
    }

    public function deleteProject(Request $request, int $id): Response
    {
        $project = $this->project($request, $id);
        abort_if(in_array($project->status, ['queued', 'processing', 'rendering']), 409);
        Storage::disk('local')->deleteDirectory('projects/'.$project->id);
        $project->delete();

        return response()->noContent();
    }

    public function conversations(Request $request): LengthAwarePaginator
    {
        return Conversation::where('user_id', $request->user()->id)->latest()->paginate(30);
    }

    public function conversation(Request $request, int $id): Conversation
    {
        return Conversation::where('user_id', $request->user()->id)->findOrFail($id);
    }

    public function talk(TalkRequest $request, OpenRouter $ai): JsonResponse
    {
        $validated = $request->validated();
        $assistant = Assistant::where('user_id', $request->user()->id)
            ->where('enabled', true)
            ->findOrFail($validated['assistant_id']);
        $text = $validated['text'] ?? '';
        if ($request->hasFile('audio')) {
            $upload = Transcription::fromUpload($request->file('audio'));
            $text = $ai->transcribe($assistant->stt_model, $upload, 'my')['text'];
        }

        if (! trim($text)) {
            throw ValidationException::withMessages(['text' => __('app.speak_or_type_a_message')]);
        }

        $conversation = empty($validated['conversation_id'])
            ? new Conversation([
                'user_id' => $request->user()->id,
                'assistant_id' => $assistant->id,
                'title' => mb_substr($text, 0, 80),
                'messages' => [],
            ])
            : Conversation::where('user_id', $request->user()->id)
                ->where('assistant_id', $assistant->id)
                ->findOrFail($validated['conversation_id']);
        $messages = $conversation->messages ?? [];
        $history = array_map(
            fn (array $message): Message => new Message($message['role'], $message['content']),
            array_slice($messages, -19),
        );
        $answer = $ai->prompt(new AssistantChat($assistant->instructions, $history), $assistant->llm_model, $text);
        $messages[] = ['role' => 'user', 'content' => $text];
        $messages[] = ['role' => 'assistant', 'content' => $answer['text']];
        $conversation->messages = $messages;
        $conversation->save();

        $audio = null;
        if ($request->boolean('speak')) {
            $audio = base64_encode($ai->speech($assistant->tts_model, $assistant->voice, $answer['text']));
        }

        return response()->json([
            'conversation' => $conversation,
            'audio' => $audio,
            'text' => $answer['text'],
            'usage' => $answer['usage'],
        ]);
    }

    public function previewVoice(Request $request, int $id, OpenRouter $ai): JsonResponse
    {
        $assistant = Assistant::where('user_id', $request->user()->id)
            ->where('enabled', true)
            ->findOrFail($id);
        $sample = 'မင်္ဂလာပါ။ သင့်ဇာတ်လမ်းကို မြန်မာဘာသာဖြင့် ပြောပြပေးပါမယ်။';

        return response()->json([
            'audio' => base64_encode($ai->speech($assistant->tts_model, $assistant->voice, $sample)),
        ]);
    }

    public function transcribe(TranscribeRequest $request, OpenRouter $ai): JsonResponse
    {
        $assistant = Assistant::where('user_id', $request->user()->id)
            ->where('enabled', true)
            ->findOrFail($request->validated('assistant_id'));

        $upload = Transcription::fromUpload($request->file('audio'));

        return response()->json($ai->transcribe($assistant->stt_model, $upload, 'my'));
    }

    public function admin(): JsonResponse
    {
        Gate::authorize('admin');

        return $this->adminSettings();
    }

    public function saveAdmin(SaveAdminSettingsRequest $request): JsonResponse
    {
        DB::table('site_settings')->updateOrInsert(
            ['key' => 'disabled_models'],
            ['value' => json_encode($request->validated('disabled_models'))],
        );

        return $this->adminSettings();
    }

    private function adminSettings(): JsonResponse
    {
        return response()->json([
            'youtube_configured' => (bool) config('recap.youtube_key'),
            'disabled_models' => $this->disabledModels(),
        ]);
    }

    /** @return list<string> */
    private function disabledModels(): array
    {
        return json_decode(DB::table('site_settings')->where('key', 'disabled_models')->value('value') ?? '[]', true);
    }
}
