<?php

declare(strict_types=1);

namespace App\Ai\Agents;

use Laravel\Ai\Attributes\MaxTokens;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\Conversational;
use Laravel\Ai\Messages\Message;
use Laravel\Ai\Promptable;

#[MaxTokens(4000)]
class AssistantChat implements Agent, Conversational
{
    use Promptable;

    /** @param list<Message> $history */
    public function __construct(private string $assistantInstructions, private array $history = []) {}

    public function instructions(): string
    {
        return 'Respond only in Burmese. '.$this->assistantInstructions;
    }

    public function messages(): iterable
    {
        return $this->history;
    }
}
