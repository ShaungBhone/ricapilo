<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'assistant_id', 'title', 'source', 'source_id', 'source_url', 'transcript', 'script', 'status', 'stage', 'error', 'audio_path', 'video_path', 'media_path', 'captions', 'format', 'target_seconds', 'usage', 'caption_style'])]
#[Hidden(['media_path', 'audio_path', 'video_path'])]
class Project extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return ['captions' => 'array', 'usage' => 'array', 'target_seconds' => 'integer'];
    }
}
