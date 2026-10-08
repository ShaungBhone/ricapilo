<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;

class SaveAssistantRequest extends FormRequest
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
            'name' => 'required|string|max:100',
            'instructions' => 'required|string|max:10000',
            'first_message' => 'nullable|string|max:1000',
            'llm_model' => 'required|string|max:200',
            'stt_model' => 'required|string|max:200',
            'tts_model' => 'required|string|max:200',
            'voice' => 'required|string|max:150',
            'silence_ms' => 'required|integer|between:500,3000',
            'enabled' => 'required|boolean',
        ];
    }
}
