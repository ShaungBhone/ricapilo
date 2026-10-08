<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;

class UploadAssetRequest extends ProjectRequest
{
    public function authorize(): bool
    {
        parent::authorize();
        $this->abortIfProjectIsBusy(__('app.wait_for_the_current_generation_to_finish'));

        return true;
    }

    /**
     * @return array<string, ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'file' => 'required|file|mimes:mp4,mov,webm,mp3,wav,m4a,ogg|max:307200',
        ];
    }
}
