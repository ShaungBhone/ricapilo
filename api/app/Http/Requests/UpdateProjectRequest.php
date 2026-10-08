<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Services\EditorSettings;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Validation\Rule;

class UpdateProjectRequest extends ProjectRequest
{
    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'title' => 'sometimes|required|string|max:255',
            'script' => 'sometimes|nullable|string|max:20000',
            'transcript' => 'sometimes|nullable|string|max:100000',
            'format' => 'sometimes|in:vertical,landscape',
            'caption_style' => ['sometimes', Rule::in(EditorSettings::STYLES)],
            'assistant_id' => ['sometimes', Rule::exists('assistants', 'id')->where('user_id', $this->user()->id)],
            'editor_settings' => 'sometimes|required|array',
            'captions' => 'sometimes|nullable|array|list|max:5000',
            'captions.*' => 'required|array:text,startMs,endMs',
            'captions.*.text' => 'required|string|max:3500',
            'captions.*.startMs' => 'required|integer|min:0|max:36000000',
            'captions.*.endMs' => 'required|integer|gt:captions.*.startMs|max:36000000',
        ];
    }
}
