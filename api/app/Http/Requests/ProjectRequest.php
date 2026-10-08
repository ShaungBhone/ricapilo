<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\Project;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A request scoped to one of the current user's projects. The project is resolved
 * before validation so foreign projects return 404 regardless of the payload.
 */
abstract class ProjectRequest extends FormRequest
{
    private ?Project $project = null;

    public function authorize(): bool
    {
        $this->project();

        return true;
    }

    public function project(): Project
    {
        return $this->project ??= Project::where('user_id', $this->user()->id)->findOrFail($this->route('id'));
    }

    protected function abortIfProjectIsBusy(string $message = ''): void
    {
        abort_if(in_array($this->project()->status, ['queued', 'processing', 'rendering'], true), 409, $message);
    }
}
