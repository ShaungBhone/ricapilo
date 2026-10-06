<?php

namespace App\Services;

use App\Exceptions\GenerationException;
use Illuminate\Support\Facades\Process;

class Bilibili
{
    public function search(string $query): array
    {
        $result = Process::timeout(30)->run([config('recap.media_python'), config('recap.bilibili_script'), $query === '' ? 'hot' : 'search', $query]);
        $data = json_decode($result->output(), true);
        if (! $result->successful() || ! is_array($data) || ($data['ok'] ?? false) !== true || ! is_array($data['items'] ?? null)) {
            throw new GenerationException('app.bilibili_is_temporarily_unavailable');
        }

        return $data['items'];
    }
}
