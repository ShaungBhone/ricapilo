<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'user_id',
    'name',
    'instructions',
    'first_message',
    'llm_model',
    'stt_model',
    'tts_model',
    'voice',
    'silence_ms',
    'enabled',
])]
class Assistant extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return ['enabled' => 'boolean', 'silence_ms' => 'integer'];
    }
}
