<?php

declare(strict_types=1);

namespace App\Ai\Agents;

use Illuminate\Contracts\JsonSchema\JsonSchema;
use Laravel\Ai\Attributes\MaxTokens;
use Laravel\Ai\Contracts\Agent;
use Laravel\Ai\Contracts\HasStructuredOutput;
use Laravel\Ai\Promptable;

#[MaxTokens(600)]
class DiscoveryIntent implements Agent, HasStructuredOutput
{
    use Promptable;

    public function instructions(): string
    {
        return 'Interpret a video discovery request, including Burmese. Use mode popular for viral/trending/popular requests, topic otherwise. For broad requests with no topic, return empty queries so we use popularity feeds; never search for the literal phrase "viral video to recap". Translate a specific topic into concise English query and Chinese bilibili_query. Default region MM, days 30 for popular requests, days 0 for topic requests. Respect explicitly requested region and recency (days 1..365). Do not invent video recommendations or facts.';
    }

    public function schema(JsonSchema $schema): array
    {
        return [
            'mode' => $schema->string()->enum(['popular', 'topic'])->required(),
            'query' => $schema->string()->required(),
            'bilibili_query' => $schema->string()->required(),
            'region' => $schema->string()->required(),
            'days' => $schema->integer()->min(0)->max(365)->required(),
        ];
    }
}
