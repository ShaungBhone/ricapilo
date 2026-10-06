<?php

namespace App\Services;

use App\Models\Project;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class Media
{
    public function acquire(Project $p): string
    {
        if ($p->media_path) {
            return Storage::disk('local')->path($p->media_path);
        }
        if (! in_array($p->source, ['youtube', 'dailymotion'], true) || ! preg_match('/^[a-zA-Z0-9_-]{1,80}
$/', $p->source_id ?? '')) {
            throw new RuntimeException('Upload a video or transcript to continue.');
        }
        $url = $p->source === 'youtube' ? 'https://www.youtube.com/watch?v='.$p->source_id : 'https://www.dailymotion.com/video/'.$p->source_id;
        $relative = 'projects/'.$p->id.'/source.mp4';
        $path = Storage::disk('local')->path($relative);
        Storage::disk('local')->makeDirectory('projects/'.$p->id);
        $result = Process::timeout(600)->run([config('recap.yt_dlp'), '--no-playlist', '--no-warnings', '--max-filesize', '300M', '--socket-timeout', '30', '--merge-output-format', 'mp4', '-f', 'best[ext=mp4]/best', '-o', $path, '--', $url]);
        if (! $result->successful() || ! is_file($path)) {
            throw new RuntimeException('This platform did not provide usable media. Upload the video or paste its transcript.');
        }
        $p->update(['media_path' => $relative]);

        return $path;
    }

    public function chunks(string $path, string $directory): array
    {
        if (! is_dir($directory)) {
            mkdir($directory, 0755, true);
        }
        $r = Process::timeout(600)->run([config('recap.ffmpeg'), '-y', '-i', $path, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '64k', '-f', 'segment', '-segment_time', '240', $directory.'/part-%03d.mp3']);
        if (! $r->successful()) {
            throw new RuntimeException('Could not extract audio from this source.');
        }
        $files = glob($directory.'/part-*.mp3');
        sort($files);
        if (! $files) {
            throw new RuntimeException('The source has no audio.');
        }

        return $files;
    }

    public function duration(string $path): float
    {
        $r = Process::timeout(30)->run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', $path]);
        $duration = (float) trim($r->output());
        if (! $r->successful() || $duration <= 0) {
            throw new RuntimeException('Cannot read audio duration.');
        }

        return $duration;
    }
}
