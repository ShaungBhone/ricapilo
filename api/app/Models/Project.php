<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\LocalizedMessage;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'assistant_id', 'title', 'source', 'source_id', 'source_url', 'transcript', 'script', 'status', 'stage', 'error', 'audio_path', 'video_path', 'media_path', 'captions', 'format', 'target_seconds', 'usage', 'caption_style', 'editor_settings', 'editor_assets'])]
#[Hidden(['media_path', 'audio_path', 'video_path', 'editor_assets'])]
class Project extends Model
{
    use HasFactory;

    protected $appends = ['has_audio', 'has_video', 'has_media'];

    protected function hasAudio(): Attribute
    {
        return Attribute::make(get: fn (): bool => (bool) $this->audio_path);
    }

    protected function hasVideo(): Attribute
    {
        return Attribute::make(get: fn (): bool => (bool) $this->video_path);
    }

    protected function hasMedia(): Attribute
    {
        return Attribute::make(get: fn (): bool => (bool) $this->media_path);
    }

    protected function error(): Attribute
    {
        return Attribute::make(get: fn (?string $value): ?string => LocalizedMessage::translate($value));
    }

    protected function casts(): array
    {
        return ['editor_settings' => 'array', 'editor_assets' => 'array', 'captions' => 'array', 'usage' => 'array', 'target_seconds' => 'integer'];
    }
}
