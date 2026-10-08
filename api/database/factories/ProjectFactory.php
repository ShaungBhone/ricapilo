<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Project;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Project> */
class ProjectFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'title' => fake()->sentence(),
            'source' => 'upload',
            'transcript' => 'A factual source transcript.',
            'target_seconds' => 60,
            'format' => 'vertical',
            'status' => 'draft',
        ];
    }
}
