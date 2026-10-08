<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\GenerationException;
use App\Models\Project;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class Media
{
    public function acquire(Project $p): string
    {
        if ($p->media_path) {
            return Storage::disk('local')->path($p->media_path);
        }

        if (! in_array($p->source, ['youtube', 'bilibili', 'dailymotion'], true) || ! preg_match('/^[a-zA-Z0-9_-]{1,80}$/D', $p->source_id ?? '')) {
            throw new GenerationException('app.upload_a_video_or_transcript_to_continue');
        }

        $url = match ($p->source) {
            'youtube' => 'https://www.youtube.com/watch?v='.$p->source_id,
            'bilibili' => 'https://www.bilibili.com/video/'.$p->source_id,
            default => 'https://www.dailymotion.com/video/'.$p->source_id,
        };
        $relative = 'projects/'.$p->id.'/source.mp4';
        $path = Storage::disk('local')->path($relative);
        Storage::disk('local')->makeDirectory('projects/'.$p->id);
        $result = Process::timeout(600)->run([config('recap.yt_dlp'), '--no-playlist', '--no-warnings', '--max-filesize', '300M', '--socket-timeout', '30', '--merge-output-format', 'mp4', '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio/best', '-o', $path, '--', $url]);
        if (! $result->successful() || ! is_file($path)) {
            throw new GenerationException('app.this_platform_did_not_provide_usable_media_upload_the_video_or_paste_its_transcript');
        }

        $settings = $p->editor_settings ?? app(EditorSettings::class)->defaults($p);
        if (! $settings['slots'][0]['assetId']) {
            $settings['slots'][0]['assetId'] = 'source';
        }

        $p->update(['media_path' => $relative, 'editor_settings' => $settings]);

        return $path;
    }

    public function chunks(string $path, string $directory): array
    {
        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }

        $r = Process::timeout(600)->run([config('recap.ffmpeg'), '-y', '-i', $path, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'segment', '-segment_time', '240', $directory.'/part-%03d.mp3']);
        if (! $r->successful()) {
            throw new GenerationException('app.could_not_extract_audio_from_this_source');
        }

        $files = glob($directory.'/part-*.mp3');
        sort($files);
        if (! $files) {
            throw new GenerationException('app.the_source_has_no_audio');
        }

        return $files;
    }

    public function metadata(string $path): array
    {
        $result = Process::timeout(30)->run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height:stream_disposition=attached_pic:stream_side_data=rotation,side_data_type', '-of', 'json', Storage::disk('local')->path($path)]);
        $data = json_decode($result->output(), true);
        $duration = (float) ($data['format']['duration'] ?? 0);
        $video = collect($data['streams'] ?? [])->first(fn (array $stream): bool => ($stream['codec_type'] ?? null) === 'video' && ! ($stream['disposition']['attached_pic'] ?? false));
        if (! $result->successful() || $duration <= 0) {
            throw ValidationException::withMessages(['file' => __('app.cannot_read_audio_duration')]);
        }

        $rotation = collect($video['side_data_list'] ?? [])->firstWhere('side_data_type', 'Display Matrix')['rotation'] ?? 0;
        $rotated = abs((int) $rotation) % 180 === 90;

        return ['kind' => $video ? 'video' : 'audio', 'width' => (int) ($video[$rotated ? 'height' : 'width'] ?? 0), 'height' => (int) ($video[$rotated ? 'width' : 'height'] ?? 0), 'duration' => $duration, 'hasAudio' => collect($data['streams'] ?? [])->contains('codec_type', 'audio')];
    }

    public function duration(string $path): float
    {
        $r = Process::timeout(30)->run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', $path]);
        $duration = (float) trim($r->output());
        if (! $r->successful() || $duration <= 0) {
            throw new GenerationException('app.cannot_read_audio_duration');
        }

        return $duration;
    }
}
