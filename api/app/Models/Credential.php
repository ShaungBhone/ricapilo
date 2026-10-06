<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable(['user_id', 'provider', 'secret'])]
#[Hidden(['secret'])]
class Credential extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return ['secret' => 'encrypted'];
    }
}
