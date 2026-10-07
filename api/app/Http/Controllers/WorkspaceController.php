<?php

namespace App\Http\Controllers;

use App\Exceptions\GenerationException;
use App\Jobs\ProcessProject;
use App\Models\Assistant;
use App\Models\Conversation;
use App\Models\Credential;
use App\Models\Project;
use App\Services\Discovery;
use App\Services\OpenRouter;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class WorkspaceController extends Controller
{
    public function keys(Request $r): mixed
    {
        return Credential::where('user_id', $r->user()->id)->get()->map(fn ($k): array => ['provider' => $k->provider, 'configured' => true, 'updated_at' => $k->updated_at]);
    }

    public function saveKey(Request $r): mixed
    {
        $v = $r->validate(['secret' => 'required|string|min:15|max:500']);
        Credential::updateOrCreate(['user_id' => $r->user()->id, 'provider' => 'openrouter'], $v);

        return response()->json(['message' => __('app.key_saved_securely')]);
    }

    public function deleteKey(Request $r): mixed
    {
        Credential::where('user_id', $r->user()->id)->where('provider', 'openrouter')->delete();

        return response()->noContent();
    }

    public function models(OpenRouter $ai): mixed
    {
        $disabled = json_decode(DB::table('site_settings')->where('key', 'disabled_models')->value('value') ?? '[]', true);

        return array_values(array_filter($ai->models(), fn (array $m): bool => ! in_array($m['id'], $disabled, true)));
    }

    public function assistants(Request $r): mixed
    {
        return Assistant::where('user_id', $r->user()->id)->latest()->get();
    }

    public function saveAssistant(Request $r, OpenRouter $ai, ?int $id = null): mixed
    {
        $v = $r->validate(['name' => 'required|string|max:100', 'instructions' => 'required|string|max:10000', 'first_message' => 'nullable|string|max:1000', 'llm_model' => 'required|string|max:200', 'stt_model' => 'required|string|max:200', 'tts_model' => 'required|string|max:200', 'voice' => 'required|string|max:150', 'silence_ms' => 'required|integer|between:500,3000', 'enabled' => 'required|boolean']);
        foreach (['llm_model' => 'text', 'stt_model' => 'transcription', 'tts_model' => 'speech'] as $key => $kind) {
            $ai->checkModel($v[$key], $kind);
        }

        $a = $id ? Assistant::where('user_id', $r->user()->id)->findOrFail($id) : new Assistant(['user_id' => $r->user()->id]);
        $a->fill($v)->save();

        return response()->json($a, $id ? 200 : 201);
    }

    public function deleteAssistant(Request $r, int $id): mixed
    {
        Assistant::where('user_id', $r->user()->id)->findOrFail($id)->delete();

        return response()->noContent();
    }

    public function discover(Request $r, OpenRouter $ai, Discovery $search): mixed
    {
        $v = $r->validate(['prompt' => 'required|string|max:1000', 'platform' => 'sometimes|required|in:all,youtube,bilibili', 'assistant_id' => ['nullable', Rule::exists('assistants', 'id')->where('user_id', $r->user()->id)]]);
        $criteria = $search->intent($v['prompt']);
        $warnings = [];
        if (! empty($v['assistant_id'])) {
            $a = Assistant::where('user_id', $r->user()->id)->findOrFail($v['assistant_id']);
            try {
                $criteria = $search->intent($v['prompt'], $ai->discoveryIntent($r->user(), $a->llm_model, $v['prompt']));
            } catch (GenerationException|ValidationException|ConnectionException $exception) {
                Log::warning('Discovery intent unavailable; using prompt parser.', ['exception_type' => $exception::class]);
                $warnings[] = __('app.video_search_unavailable_please_try_again');
            }
        }

        $result = $search->search($criteria['query'], $v['platform'] ?? 'all', true, $criteria);

        return ['query' => $criteria['query'], ...$result, 'warnings' => $result['videos'] === [] && ($warnings !== [] || $result['warnings'] !== []) ? [__('app.video_search_unavailable_please_try_again')] : []];
    }

    public function projects(Request $r): mixed
    {
        return Project::where('user_id', $r->user()->id)->latest()->paginate(20);
    }

    private function project(Request $r, int $id): Project
    {
        return Project::where('user_id', $r->user()->id)->findOrFail($id);
    }

    public function showProject(Request $r, int $id): mixed
    {
        return $this->project($r, $id);
    }

    public function createProject(Request $r): mixed
    {
        $v = $r->validate(['title' => 'required|string|max:255', 'assistant_id' => ['required', Rule::exists('assistants', 'id')->where('user_id', $r->user()->id)], 'source' => 'required|in:upload,youtube,bilibili', 'source_id' => 'nullable|string|max:80|regex:/^[a-zA-Z0-9_-]+$/', 'transcript' => 'nullable|string|max:100000', 'format' => 'required|in:vertical,landscape', 'target_seconds' => 'required|integer|between:15,600']);
        if ($v['source'] !== 'upload' && empty($v['source_id'])) {
            throw ValidationException::withMessages(['source_id' => __('app.choose_a_video_first')]);
        }

        if ($v['source'] === 'bilibili' && ! preg_match('/^BV[a-zA-Z0-9]{10}$/', $v['source_id'])) {
            throw ValidationException::withMessages(['source_id' => __('app.choose_a_video_first')]);
        }

        return response()->json(Project::create(['user_id' => $r->user()->id, ...$v]), 201);
    }

    public function updateProject(Request $r, int $id): mixed
    {
        $p = $this->project($r, $id);
        $v = $r->validate(['script' => 'sometimes|required|string|max:20000', 'transcript' => 'sometimes|required|string|max:100000', 'format' => 'sometimes|in:vertical,landscape', 'caption_style' => 'sometimes|in:clean-bottom,boxed-minimal', 'assistant_id' => ['sometimes', Rule::exists('assistants', 'id')->where('user_id', $r->user()->id)]]);
        DB::transaction(function () use ($p, $v): void {
            $locked = Project::lockForUpdate()->findOrFail($p->id);
            abort_if(in_array($locked->status, ['queued', 'processing', 'rendering']), 409, __('app.wait_for_the_current_generation_to_finish'));
            $locked->fill($v);
            if (isset($v['script'])) {
                $locked->audio_path = null;
                $locked->video_path = null;
                $locked->captions = null;
                $locked->status = 'script_ready';
            }

            if (isset($v['transcript']) || isset($v['assistant_id'])) {
                $locked->script = null;
                $locked->audio_path = null;
                $locked->video_path = null;
                $locked->captions = null;
                $locked->status = 'draft';
            }

            if (isset($v['format']) || isset($v['caption_style'])) {
                $locked->video_path = null;
                if ($locked->audio_path) {
                    $locked->status = 'audio_ready';
                }
            }

            $locked->save();
        });

        return $p->fresh();
    }

    public function upload(Request $r, int $id): mixed
    {
        $p = $this->project($r, $id);
        abort_if(in_array($p->status, ['queued', 'processing', 'rendering']), 409);
        $r->validate(['file' => 'required|file|mimes:mp4,mov,webm,mp3,wav,m4a,ogg|max:307200']);
        $path = $r->file('file')->store('projects/'.$p->id, 'local');
        $p->update(['media_path' => $path, 'source' => 'upload', 'transcript' => null, 'script' => null, 'audio_path' => null, 'video_path' => null, 'status' => 'draft']);

        return $p;
    }

    public function generate(Request $r, int $id, OpenRouter $ai): mixed
    {
        $p = $this->project($r, $id);
        $v = $r->validate(['stage' => 'required|in:script,audio,video']);
        $ai->client($r->user());
        DB::transaction(function () use ($p, $v): void {
            $locked = Project::lockForUpdate()->findOrFail($p->id);
            abort_if(in_array($locked->status, ['queued', 'processing', 'rendering']), 409, __('app.generation_is_already_running'));
            if ($v['stage'] === 'audio') {
                abort_unless($locked->script, 422, __('app.generate_and_review_the_script_first'));
            }

            if ($v['stage'] === 'video') {
                abort_unless($locked->audio_path, 422, __('app.generate_narration_first'));
            }

            if ($v['stage'] === 'script') {
                $locked->script = null;
                $locked->audio_path = null;
                $locked->captions = null;
            }

            if ($v['stage'] !== 'video') {
                $locked->video_path = null;
            }

            $locked->update(['status' => 'queued', 'stage' => $v['stage'], 'error' => null]);
            ProcessProject::dispatch($p->id, $v['stage'])->afterCommit();
        });

        return response()->json($p->fresh(), 202);
    }

    public function download(Request $r, int $id, string $kind): mixed
    {
        $p = $this->project($r, $id);
        if ($kind === 'script') {
            abort_unless($p->script, 404);

            return response($p->script)->header('Content-Type', 'text/plain; charset=utf-8')->header('Content-Disposition', 'attachment; filename="recap.txt"');
        }

        $path = match ($kind) {
            'audio' => $p->audio_path,'video' => $p->video_path,default => null
        };
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return response()->file(Storage::disk('local')->path($path), ['Content-Disposition' => 'inline; filename="recap.'.($kind === 'audio' ? 'mp3' : 'mp4').'"']);
    }

    public function deleteProject(Request $r, int $id): mixed
    {
        $p = $this->project($r, $id);
        abort_if(in_array($p->status, ['queued', 'processing', 'rendering']), 409);
        Storage::disk('local')->deleteDirectory('projects/'.$p->id);
        $p->delete();

        return response()->noContent();
    }

    public function conversations(Request $r): mixed
    {
        return Conversation::where('user_id', $r->user()->id)->latest()->paginate(30);
    }

    public function conversation(Request $r, int $id): mixed
    {
        return Conversation::where('user_id', $r->user()->id)->findOrFail($id);
    }

    public function talk(Request $r, OpenRouter $ai): mixed
    {
        $v = $r->validate(['assistant_id' => ['required', Rule::exists('assistants', 'id')->where('user_id', $r->user()->id)], 'conversation_id' => ['nullable', Rule::exists('conversations', 'id')->where('user_id', $r->user()->id)], 'text' => 'nullable|string|max:5000', 'audio' => 'nullable|file|mimes:webm,wav,mp3,m4a,ogg|max:10240', 'speak' => 'nullable|boolean']);
        $a = Assistant::where('user_id', $r->user()->id)->where('enabled', true)->findOrFail($v['assistant_id']);
        $text = $v['text'] ?? '';
        if ($r->hasFile('audio')) {
            $file = $r->file('audio');
            $result = $ai->transcribe($r->user(), $a->stt_model, file_get_contents($file->path()), $file->extension(), 'my');
            $text = $result['text'];
        }

        if (! trim($text)) {
            throw ValidationException::withMessages(['text' => __('app.speak_or_type_a_message')]);
        }

        $c = empty($v['conversation_id']) ? new Conversation(['user_id' => $r->user()->id, 'assistant_id' => $a->id, 'title' => mb_substr($text, 0, 80), 'messages' => []]) : Conversation::where('user_id', $r->user()->id)->findOrFail($v['conversation_id']);
        $messages = $c->messages ?? [];
        $messages[] = ['role' => 'user', 'content' => $text];
        $answer = $ai->chat($r->user(), $a->llm_model, [['role' => 'system', 'content' => 'Respond only in Burmese. '.$a->instructions], ...array_slice($messages, -20)]);
        $messages[] = ['role' => 'assistant', 'content' => $answer['text']];
        $c->messages = $messages;
        $c->save();

        $audio = null;
        if ($r->boolean('speak')) {
            $audio = base64_encode($ai->speech($r->user(), $a->tts_model, $a->voice, $answer['text']));
        }

        return ['conversation' => $c, 'audio' => $audio, 'text' => $answer['text'], 'usage' => $answer['usage']];
    }

    public function previewVoice(Request $r, int $id, OpenRouter $ai): mixed
    {
        $a = Assistant::where('user_id', $r->user()->id)->where('enabled', true)->findOrFail($id);

        return ['audio' => base64_encode($ai->speech($r->user(), $a->tts_model, $a->voice, 'မင်္ဂလာပါ။ သင့်ဇာတ်လမ်းကို မြန်မာဘာသာဖြင့် ပြောပြပေးပါမယ်။'))];
    }

    public function transcribe(Request $r, OpenRouter $ai): mixed
    {
        $r->validate(['assistant_id' => ['required', Rule::exists('assistants', 'id')->where('user_id', $r->user()->id)], 'audio' => 'required|file|mimes:webm,wav,mp3,m4a,ogg|max:10240']);
        $a = Assistant::where('user_id', $r->user()->id)->findOrFail($r->input('assistant_id'));
        $f = $r->file('audio');

        return $ai->transcribe($r->user(), $a->stt_model, file_get_contents($f->path()), $f->extension(), 'my');
    }

    public function admin(Request $r): mixed
    {
        abort_unless($r->user()->is_admin, 403);

        return ['youtube_configured' => (bool) (DB::table('site_settings')->where('key', 'youtube_key')->value('value') ?? config('recap.youtube_key')), 'disabled_models' => json_decode(DB::table('site_settings')->where('key', 'disabled_models')->value('value') ?? '[]', true)];
    }

    public function saveAdmin(Request $r): mixed
    {
        abort_unless($r->user()->is_admin, 403);
        $v = $r->validate(['youtube_key' => 'nullable|string|max:500', 'disabled_models' => 'required|array', 'disabled_models.*' => 'string|max:200']);
        if (! empty($v['youtube_key'])) {
            DB::table('site_settings')->updateOrInsert(['key' => 'youtube_key'], ['value' => Crypt::encryptString($v['youtube_key'])]);
        }

        DB::table('site_settings')->updateOrInsert(['key' => 'disabled_models'], ['value' => json_encode($v['disabled_models'])]);

        return $this->admin($r);
    }
}
