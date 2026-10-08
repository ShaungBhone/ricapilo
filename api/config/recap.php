<?php

declare(strict_types=1);

return [
    'email_verification_required' => env('EMAIL_VERIFICATION_REQUIRED', false),
    'frontend_url' => env('FRONTEND_URL', 'http://localhost:3000'),
    'youtube_key' => env('YOUTUBE_API_KEY'),
    'renderer_url' => env('RENDERER_URL', 'http://renderer:4000'),
    'renderer_token' => env('RENDERER_TOKEN'),
    'ffmpeg' => env('FFMPEG_BINARY', 'ffmpeg'),
    'ffprobe' => env('FFPROBE_BINARY', 'ffprobe'),
    'media_python' => env('MEDIA_PYTHON', 'python3'),
    'bilibili_script' => env('BILIBILI_SCRIPT', base_path('../scripts/bilibili.py')),
    'yt_dlp' => env('YT_DLP_BINARY', 'yt-dlp'),
];
