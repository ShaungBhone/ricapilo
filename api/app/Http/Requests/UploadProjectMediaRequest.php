<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\ValidationRule;

class UploadProjectMediaRequest extends ProjectRequest
{
    public function authorize(): bool
    {
        parent::authorize();
        $this->abortIfProjectIsBusy();

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
