<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TranscribeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'assistant_id' => ['required', Rule::exists('assistants', 'id')->where('user_id', $this->user()->id)],
            'audio' => 'required|file|mimes:webm,wav,mp3,m4a,ogg|max:10240',
        ];
    }
}
