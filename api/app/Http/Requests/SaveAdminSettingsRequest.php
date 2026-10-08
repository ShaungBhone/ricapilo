<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;

class SaveAdminSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('admin');
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'youtube_key' => 'prohibited',
            'disabled_models' => 'required|array',
            'disabled_models.*' => 'string|max:200',
        ];
    }
}
