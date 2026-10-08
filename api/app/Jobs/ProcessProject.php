<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Ai\Agents\RecapWriter;
use App\Exceptions\GenerationException;
use App\Models\Assistant;
use App\Models\Project;
use App\Models\User;
use App\Services\EditorSettings;
use App\Services\Media;
use App\Services\OpenRouter;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Laravel\Ai\Transcription;
use Throwable;

class ProcessProject implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 1800;

    public function __construct(public int $projectId, public string $stage) {}

    public function middleware(): array
    {
        return [(new WithoutOverlapping('project:'.$this->projectId))->expireAfter(1900)->dontRelease()];
    }

    public function handle(OpenRouter $ai, Media $media): void
    {
        $project = Project::find($this->projectId);
        if (! $project) {
            return;
        }

        if ($this->stage === 'prepare') {
            $project->update(['status' => 'processing', 'error' => null]);
            $media->acquire($project);
            $project->refresh();
            $settings = $project->editor_settings ?? app(EditorSettings::class)->defaults($project);
            if (! $settings['slots'][0]['assetId']) {
                $settings['slots'][0]['assetId'] = 'source';
            }

            $project->update(['editor_settings' => $settings, 'status' => $project->video_path ? 'ready' : ($project->audio_path ? 'audio_ready' : ($project->script ? 'script_ready' : 'draft'))]);

            return;
        }

        $user = User::findOrFail($project->user_id);
        $assistant = Assistant::where('user_id', $user->id)->where('enabled', true)->find($project->assistant_id);
        if (! $assistant && $this->stage !== 'video') {
            throw new GenerationException('app.choose_an_enabled_assistant');
        }

        $dir = Storage::disk('local')->path('projects/'.$project->id);
        Storage::disk('local')->makeDirectory('projects/'.$project->id);
        $project->update(['status' => 'processing', 'error' => null]);
        $usage = $project->usage ?? [];
        if ($this->stage === 'script') {
            $transcript = $project->transcript;
            if (! $transcript) {
                $parts = [];
                foreach ($media->chunks($media->acquire($project), $dir.'/chunks') as $chunk) {
                    $result = $ai->transcribe($assistant->stt_model, Transcription::fromPath($chunk));
                    $parts[] = $result['text'];
                    $usage[] = ['stage' => 'transcription', 'usage' => $result['usage'] ?? []];
                }

                $transcript = implode("\n\n", $parts);
                $project->update(['transcript' => $transcript]);
            }

            if (mb_strlen($transcript) > 100000) {
                throw new GenerationException('app.source_transcript_exceeds_100_000_characters_use_a_shorter_selection');
            }

            $result = $ai->prompt(new RecapWriter($project->target_seconds, $assistant->instructions), $assistant->llm_model, 'Source title: '.$project->title."\nSource transcript:\n".$transcript);
            $usage[] = ['stage' => 'script', 'usage' => $result['usage']];
            $project->update(['script' => $result['text'], 'status' => 'script_ready', 'usage' => $usage]);
        } elseif ($this->stage === 'audio') {
            if (! $project->script) {
                throw new GenerationException('app.review_a_script_before_generating_narration');
            }

            $paragraphs = preg_split('/\n+/u', $project->script, -1, PREG_SPLIT_NO_EMPTY);
            $segments = [];
            $captions = [];
            $offset = 0;
            foreach ($paragraphs as $index => $text) {
                if (mb_strlen($text) > 3500) {
                    throw new GenerationException('app.split_narration_paragraphs_into_fewer_than_3_500_characters');
                }

                $path = $dir.'/voice-'.$index.'.mp3';
                file_put_contents($path, $ai->speech($assistant->tts_model, $assistant->voice, $text));
                $seconds = $media->duration($path);
                $segments[] = $path;
                $phrases = preg_split('/(?<=[။!?])\s*|\n/u', $text, -1, PREG_SPLIT_NO_EMPTY);
                $total = max(1, mb_strlen($text));
                foreach ($phrases as $phrase) {
                    $length = $seconds * mb_strlen($phrase) / $total;
                    $captions[] = ['text' => $phrase, 'startMs' => (int) ($offset * 1000), 'endMs' => (int) (($offset + $length) * 1000)];
                    $offset += $length;
                }
            }

            if ($segments === []) {
                throw new GenerationException('app.the_narration_script_is_empty');
            }

            file_put_contents($dir.'/concat.txt', implode("\n", array_map(fn (string $path): string => "file '".$path."'", $segments)));
            $concat = Process::timeout(300)->run([config('recap.ffmpeg'), '-y', '-f', 'concat', '-safe', '0', '-i', $dir.'/concat.txt', '-c', 'copy', $dir.'/narration.mp3']);
            if (! $concat->successful()) {
                throw new GenerationException('app.audio_assembly_failed');
            }

            $project->update(['audio_path' => 'projects/'.$project->id.'/narration.mp3', 'captions' => $captions, 'status' => 'audio_ready']);
        } elseif ($this->stage === 'video') {
            if (! $project->audio_path) {
                throw new GenerationException('app.generate_narration_before_rendering_video');
            }

            $token = config('recap.renderer_token');
            if (! $token) {
                throw new GenerationException('app.the_video_renderer_is_not_configured');
            }

            $project->update(['status' => 'rendering']);
            $body = ['projectId' => (string) $project->id, 'title' => $project->title, 'audioPath' => $project->audio_path, 'mediaPath' => $project->media_path, 'format' => $project->format, 'captionStyle' => $project->caption_style, 'captions' => $project->captions ?? [], 'editorSettings' => $project->editor_settings ?? app(EditorSettings::class)->defaults($project), 'assets' => $project->editor_assets ?? []];
            $response = Http::timeout(1500)->withToken($token)->post(config('recap.renderer_url').'/render', $body);
            if (! $response->successful()) {
                throw new GenerationException('app.video_rendering_failed_check_the_renderer_service');
            }

            $relative = 'projects/'.$project->id.'/recap.mp4';
            if (! Storage::disk('local')->exists($relative)) {
                throw new GenerationException('app.rendered_output_was_not_found');
            }

            $project->update(['video_path' => $relative, 'status' => 'ready']);
        }
    }

    public function failed(?Throwable $error): void
    {
        $message = $error instanceof GenerationException ? $error->getMessage() : 'app.generation_failed_check_your_providers_and_retry';
        Project::whereKey($this->projectId)->update(['status' => 'failed', 'error' => mb_substr($message, 0, 500)]);
    }
}
