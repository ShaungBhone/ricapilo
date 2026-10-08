<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class DiscoverRequest extends FormRequest
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
            'prompt' => 'required|string|max:1000',
            'platform' => 'sometimes|required|in:all,youtube,bilibili',
            'assistant_id' => ['nullable', Rule::exists('assistants', 'id')->where('user_id', $this->user()->id)],
        ];
    }
}
