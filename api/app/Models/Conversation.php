<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'assistant_id', 'title', 'messages'])]
class Conversation extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return ['messages' => 'array'];
    }
}
