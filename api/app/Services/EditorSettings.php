<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Project;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class EditorSettings
{
    public const array LAYOUTS = ['fit', 'fill', 'split', 'three', 'four', 'picture-in-picture', 'screen-share', 'gameplay'];

    public const array STYLES = ['clean-bottom', 'boxed-minimal', 'bold-center', 'karaoke-highlight'];

    public function defaults(Project $project): array
    {
        return [
            'version' => 1,
            'aspectRatio' => $project->format === 'landscape' ? '16:9' : '9:16',
            'layout' => 'fill',
            'slots' => [[
                'assetId' => $project->media_path ? 'source' : null,
                'mode' => 'fill',
                'x' => 0.5,
                'y' => 0.5,
                'scale' => 1,
                'visible' => true,
            ]],
            'textOverlays' => [],
            'videoVisible' => true,
            'captionsVisible' => true,
            'audio' => [
                'sourceMuted' => true,
                'sourceVolume' => 1,
                'narrationVolume' => 1,
                'musicAssetId' => null,
                'musicVolume' => 0.22,
            ],
        ];
    }

    /**
     * Get the project's editor settings with the first slot pointing at the source video when empty.
     */
    public function withSourceSlot(Project $project): array
    {
        $settings = $project->editor_settings ?? $this->defaults($project);
        if (! $settings['slots'][0]['assetId']) {
            $settings['slots'][0]['assetId'] = 'source';
        }

        return $settings;
    }

    public function validate(array $settings, Project $project): array
    {
        $assets = $project->editor_assets ?? [];
        $videos = array_column(array_filter($assets, fn (array $a): bool => $a['kind'] === 'video'), 'id');
        if ($project->media_path) {
            $videos[] = 'source';
        }

        $music = array_column(array_filter($assets, fn (array $a): bool => $a['kind'] === 'audio'), 'id');
        $validated = Validator::make(['settings' => $settings], [
            'settings' => 'required|array:version,aspectRatio,layout,slots,textOverlays,videoVisible,captionsVisible,audio',
            'settings.version' => 'required|integer|in:1',
            'settings.aspectRatio' => 'required|in:9:16,16:9,1:1,4:5',
            'settings.layout' => ['required', Rule::in(self::LAYOUTS)],
            'settings.videoVisible' => 'required|boolean',
            'settings.captionsVisible' => 'required|boolean',
            'settings.slots' => 'required|array|list|min:1|max:4',
            'settings.slots.*' => 'required|array:assetId,mode,x,y,scale,visible',
            'settings.slots.*.assetId' => ['present', 'nullable', Rule::in($videos)],
            'settings.slots.*.mode' => 'required|in:fit,fill',
            'settings.slots.*.x' => 'required|numeric|between:0,1',
            'settings.slots.*.y' => 'required|numeric|between:0,1',
            'settings.slots.*.scale' => 'required|numeric|between:0.1,8',
            'settings.slots.*.visible' => 'required|boolean',
            'settings.textOverlays' => 'present|array|list|max:30',
            'settings.textOverlays.*' => 'array:id,text,x,y,fontSize,color,bold,background,align,visible',
            'settings.textOverlays.*.id' => 'required|uuid|distinct',
            'settings.textOverlays.*.text' => 'present|nullable|string|max:1000',
            'settings.textOverlays.*.x' => 'required|numeric|between:0,1',
            'settings.textOverlays.*.y' => 'required|numeric|between:0,1',
            'settings.textOverlays.*.fontSize' => 'required|integer|between:22,120',
            'settings.textOverlays.*.color' => ['required', 'regex:/^#[a-fA-F0-9]{6}$/'],
            'settings.textOverlays.*.bold' => 'required|boolean',
            'settings.textOverlays.*.background' => 'required|boolean',
            'settings.textOverlays.*.align' => 'required|in:left,center,right',
            'settings.textOverlays.*.visible' => 'required|boolean',
            'settings.audio' => 'required|array:sourceMuted,sourceVolume,narrationVolume,musicAssetId,musicVolume',
            'settings.audio.sourceMuted' => 'required|boolean',
            'settings.audio.sourceVolume' => 'required|numeric|between:0,1',
            'settings.audio.narrationVolume' => 'required|numeric|between:0,1',
            'settings.audio.musicVolume' => 'required|numeric|between:0,1',
            'settings.audio.musicAssetId' => ['present', 'nullable', Rule::in($music)],
        ])->validate()['settings'];
        $count = match ($validated['layout']) {
            'three' => 3, 'four' => 4, 'fit', 'fill' => 1, default => 2
        };
        Validator::make($validated, ['slots' => 'size:'.$count])->validate();
        $validated['version'] = 1;
        foreach (['videoVisible', 'captionsVisible'] as $key) {
            $validated[$key] = (bool) $validated[$key];
        }

        foreach ($validated['slots'] as &$slot) {
            foreach (['x', 'y', 'scale'] as $key) {
                $slot[$key] = (float) $slot[$key];
            }

            $slot['visible'] = (bool) $slot['visible'];
        }

        foreach ($validated['textOverlays'] as &$overlay) {
            $overlay['text'] ??= '';
            foreach (['x', 'y'] as $key) {
                $overlay[$key] = (float) $overlay[$key];
            }

            foreach (['visible', 'bold', 'background'] as $key) {
                $overlay[$key] = (bool) $overlay[$key];
            }

            $overlay['fontSize'] = (int) $overlay['fontSize'];
        }

        foreach (['sourceVolume', 'narrationVolume', 'musicVolume'] as $key) {
            $validated['audio'][$key] = (float) $validated['audio'][$key];
        }

        $validated['audio']['sourceMuted'] = (bool) $validated['audio']['sourceMuted'];

        return $validated;
    }
}
