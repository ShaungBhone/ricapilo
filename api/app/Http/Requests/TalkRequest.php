<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TalkRequest extends FormRequest
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
            'conversation_id' => [
                'nullable',
                Rule::exists('conversations', 'id')
                    ->where('user_id', $this->user()->id)
                    ->where('assistant_id', $this->integer('assistant_id')),
            ],
            'text' => 'nullable|string|max:5000',
            'audio' => 'nullable|file|mimes:webm,wav,mp3,m4a,ogg|max:10240',
            'speak' => 'nullable|boolean',
        ];
    }
}
