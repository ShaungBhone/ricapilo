<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Assistant;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Assistant> */
class AssistantFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'name' => fake()->name(),
            'instructions' => 'Respond in Burmese.',
            'first_message' => 'မင်္ဂလာပါ',
            'llm_model' => 'test/chat',
            'stt_model' => 'test/stt',
            'tts_model' => 'test/tts',
            'voice' => 'test-voice',
            'silence_ms' => 1200,
            'enabled' => true,
        ];
    }
}
