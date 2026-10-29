<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\LocalizedMessage;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

#[Fillable([
    'user_id',
    'assistant_id',
    'title',
    'source',
    'source_id',
    'source_url',
    'transcript',
    'script',
    'status',
    'stage',
    'generation_progress',
    'error',
    'audio_path',
    'video_path',
    'media_path',
    'captions',
    'format',
    'target_seconds',
    'usage',
    'caption_style',
    'editor_settings',
    'editor_assets',
    'split_enabled',
    'split_minutes',
    'split_results',
])]
#[Hidden(['media_path', 'audio_path', 'video_path', 'editor_assets', 'split_results'])]
class Project extends Model
{
    use HasFactory;

    protected $appends = ['has_audio', 'has_video', 'has_media', 'source_unavailable', 'video_splits'];

    protected static function booted(): void
    {
        static::saved(function (Project $project): void {
            $previous = $project->getOriginal('split_results') ?? [];
            $current = $project->split_results ?? [];
            foreach ($previous as $kind => $result) {
                if ($result['status'] === 'ready' && ($current[$kind]['revision'] ?? null) !== $result['revision']) {
                    Storage::disk('local')->deleteDirectory(
                        'projects/'.$project->id.'/parts/'.$kind.'/'.$result['revision'],
                    );
                }
            }
        });
        static::saving(function (Project $project): void {
            $results = $project->split_results ?? [];
            if ($project->isDirty(['split_enabled', 'split_minutes'])) {
                $results = [];
            }

            if ($project->isDirty('media_path')) {
                unset($results['source']);
            }

            if ($project->isDirty('video_path') || ($project->isDirty('status') && $project->status === 'queued')) {
                unset($results['recap']);
            }

            $project->split_results = $results ?: null;
        });
    }

    protected function videoSplits(): Attribute
    {
        return Attribute::make(get: function (): array {
            $results = $this->split_results ?? [];
            foreach ($results as &$result) {
                unset($result['input']);
                foreach ($result['parts'] as &$part) {
                    unset($part['path']);
                }

                $result['error'] = $result['error'] ? __($result['error']) : null;
            }

            return $results;
        });
    }

    protected function sourceUnavailable(): Attribute
    {
        $sourceErrors = [
            'app.upload_a_video_or_transcript_to_continue',
            'app.this_platform_did_not_provide_usable_media_upload_the_video_or_paste_its_transcript',
            'app.could_not_extract_audio_from_this_source',
            'app.the_source_has_no_audio',
        ];

        return Attribute::make(get: fn (): bool => $this->status === 'failed'
            && in_array($this->getRawOriginal('error'), $sourceErrors, true));
    }

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
        return [
            'generation_progress' => 'array',
            'editor_settings' => 'array',
            'editor_assets' => 'array',
            'captions' => 'array',
            'usage' => 'array',
            'target_seconds' => 'integer',
            'split_enabled' => 'boolean',
            'split_minutes' => 'integer',
            'split_results' => 'array',
        ];
    }
}
