<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreProjectRequest extends FormRequest
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
            'title' => 'required|string|max:255',
            'assistant_id' => ['required', Rule::exists('assistants', 'id')->where('user_id', $this->user()->id)],
            'source' => 'required|in:upload,youtube,bilibili',
            'source_id' => 'nullable|string|max:80|regex:/^[a-zA-Z0-9_-]+$/',
            'transcript' => 'nullable|string|max:100000',
            'format' => 'required|in:vertical,landscape',
            'target_seconds' => 'required|integer|between:15,600',
            'generate_script' => 'sometimes|boolean',
        ];
    }
}
