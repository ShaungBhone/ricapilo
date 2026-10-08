<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\GenerationException;
use App\Models\Project;
use Illuminate\Contracts\Process\ProcessResult;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class Media
{
    private const array SOURCES = ['youtube', 'bilibili', 'dailymotion'];

    private const string SOURCE_ID_PATTERN = '/^[a-zA-Z0-9_-]{1,80}$/D';

    public function __construct(private readonly EditorSettings $editorSettings) {}

    public function acquire(Project $project): string
    {
        if ($project->media_path) {
            return Storage::disk('local')->path($project->media_path);
        }

        $hasValidSource = in_array($project->source, self::SOURCES, true)
            && preg_match(self::SOURCE_ID_PATTERN, $project->source_id ?? '');
        if (! $hasValidSource) {
            throw new GenerationException('app.upload_a_video_or_transcript_to_continue');
        }

        $relative = 'projects/'.$project->id.'/source.mp4';
        $path = Storage::disk('local')->path($relative);
        Storage::disk('local')->makeDirectory('projects/'.$project->id);
        $result = Process::timeout(600)->run([
            config('recap.yt_dlp'),
            '--no-playlist',
            '--no-warnings',
            '--max-filesize', '300M',
            '--socket-timeout', '30',
            '--merge-output-format', 'mp4',
            '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio/best',
            '-o', $path,
            '--', $this->sourceUrl($project),
        ]);
        if (! $result->successful() || ! is_file($path)) {
            throw new GenerationException('app.this_platform_did_not_provide_usable_media_upload_the_video_or_paste_its_transcript');
        }

        $project->update([
            'media_path' => $relative,
            'editor_settings' => $this->editorSettings->withSourceSlot($project),
        ]);

        return $path;
    }

    /** @return list<string> */
    public function chunks(string $path, string $directory): array
    {
        File::ensureDirectoryExists($directory);

        $result = Process::timeout(600)->run([
            config('recap.ffmpeg'),
            '-y',
            '-i', $path,
            '-vn',
            '-ac', '1',
            '-ar', '16000',
            '-c:a', 'libmp3lame',
            '-b:a', '64k',
            '-f', 'segment',
            '-segment_time', '240',
            $directory.'/part-%03d.mp3',
        ]);
        if (! $result->successful()) {
            throw new GenerationException('app.could_not_extract_audio_from_this_source');
        }

        $files = glob($directory.'/part-*.mp3');
        sort($files);
        if (! $files) {
            throw new GenerationException('app.the_source_has_no_audio');
        }

        return $files;
    }

    /** @param list<string> $paths */
    public function concat(array $paths, string $output): void
    {
        $playlistPath = dirname($output).'/concat.txt';
        $playlist = array_map(fn (string $path): string => "file '".$path."'", $paths);
        file_put_contents($playlistPath, implode("\n", $playlist));

        $result = Process::timeout(300)->run([
            config('recap.ffmpeg'),
            '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', $playlistPath,
            '-c', 'copy',
            $output,
        ]);
        if (! $result->successful()) {
            throw new GenerationException('app.audio_assembly_failed');
        }
    }

    public function pcmToMp3(string $bytes): string
    {
        $input = tempnam(sys_get_temp_dir(), 'recap-pcm-');
        $output = tempnam(sys_get_temp_dir(), 'recap-mp3-');
        try {
            if ($input === false || $output === false || file_put_contents($input, $bytes) === false) {
                throw new GenerationException('app.narration_failed_check_that_the_model_supports_this_voice_and_burmese');
            }

            $result = Process::timeout(90)->run([
                config('recap.ffmpeg'),
                '-y',
                '-f', 's16le',
                '-ar', '24000',
                '-ac', '1',
                '-i', $input,
                '-c:a', 'libmp3lame',
                '-f', 'mp3',
                $output,
            ]);
            if (! $result->successful()) {
                throw new GenerationException('app.narration_failed_check_that_the_model_supports_this_voice_and_burmese');
            }

            return file_get_contents($output);
        } finally {
            if ($input !== false) {
                unlink($input);
            }

            if ($output !== false) {
                unlink($output);
            }
        }
    }

    /** @return array{kind: string, width: int, height: int, duration: float, hasAudio: bool} */
    public function metadata(string $path): array
    {
        $result = $this->probe(Storage::disk('local')->path($path), [
            '-show_entries', 'format=duration:stream=codec_type,width,height:stream_disposition=attached_pic:stream_side_data=rotation,side_data_type',
            '-of', 'json',
        ]);
        $data = json_decode($result->output(), true);
        $duration = (float) ($data['format']['duration'] ?? 0);
        $video = collect($data['streams'] ?? [])->first(
            fn (array $stream): bool => ($stream['codec_type'] ?? null) === 'video'
                && ! ($stream['disposition']['attached_pic'] ?? false)
        );
        if (! $result->successful() || $duration <= 0) {
            throw ValidationException::withMessages(['file' => __('app.cannot_read_audio_duration')]);
        }

        $displayMatrix = collect($video['side_data_list'] ?? [])->firstWhere('side_data_type', 'Display Matrix');
        $rotation = $displayMatrix['rotation'] ?? 0;
        $rotated = abs((int) $rotation) % 180 === 90;

        return [
            'kind' => $video ? 'video' : 'audio',
            'width' => (int) ($video[$rotated ? 'height' : 'width'] ?? 0),
            'height' => (int) ($video[$rotated ? 'width' : 'height'] ?? 0),
            'duration' => $duration,
            'hasAudio' => collect($data['streams'] ?? [])->contains('codec_type', 'audio'),
        ];
    }

    public function duration(string $path): float
    {
        $result = $this->probe($path, [
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
        ]);
        $duration = (float) trim($result->output());
        if (! $result->successful() || $duration <= 0) {
            throw new GenerationException('app.cannot_read_audio_duration');
        }

        return $duration;
    }

    private function sourceUrl(Project $project): string
    {
        return match ($project->source) {
            'youtube' => 'https://www.youtube.com/watch?v='.$project->source_id,
            'bilibili' => 'https://www.bilibili.com/video/'.$project->source_id,
            default => 'https://www.dailymotion.com/video/'.$project->source_id,
        };
    }

    /** @param list<string> $arguments */
    private function probe(string $absolutePath, array $arguments): ProcessResult
    {
        return Process::timeout(30)->run([
            config('recap.ffprobe'),
            '-v', 'error',
            ...$arguments,
            $absolutePath,
        ]);
    }
}
