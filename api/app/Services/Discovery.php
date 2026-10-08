<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class Discovery
{
    public function __construct(private readonly Bilibili $bilibili) {}

    public function intent(string $prompt, array $generated = []): array
    {
        $popular = preg_match('/viral|trending|popular|လူကြိုက်များ|ရေပန်းစား/iu', $prompt) === 1;
        $broad = trim($prompt) === 'အနှစ်ချုပ်ရန် လူကြိုက်များ ဗီဒီယိုများ ရှာပေးပါ' || preg_match('/^(give me |find |show me |recommend |please )*(viral|trending|popular)( short)? videos?( to recap| for recap| this week| today)?[.!?]*$/iu', trim($prompt)) === 1;
        $mode = in_array($generated['mode'] ?? null, ['popular', 'topic'], true) ? $generated['mode'] : ($popular ? 'popular' : 'topic');
        $query = mb_substr(trim((string) ($generated['query'] ?? ($broad ? '' : $prompt))), 0, 200);

        return ['mode' => $mode, 'query' => $query, 'bilibili_query' => mb_substr(trim((string) ($generated['bilibili_query'] ?? $query)), 0, 200), 'region' => preg_match('/^[A-Z]{2}$/', $generated['region'] ?? '') ? $generated['region'] : 'MM', 'days' => max(0, min(365, (int) ($generated['days'] ?? (preg_match('/this week|past week|last week/iu', $prompt) ? 7 : (preg_match('/today/iu', $prompt) ? 1 : ($popular ? 30 : 0))))))];
    }

    public function search(string $query, string $platform, bool $popular = true, array $criteria = []): array
    {
        $criteria = $this->intent($query, $criteria);
        $videos = [];
        $warnings = [];
        if ($platform !== 'bilibili') {
            $key = config('recap.youtube_key');
            if (! $key) {
                Log::warning('Discovery source not configured.', ['provider' => 'youtube']);
                $warnings[] = __('app.an_administrator_must_add_a_youtube_api_key_to_search_youtube');
            } else {
                try {
                    $items = $this->youtube($key, $query, $popular, $criteria, $warnings);
                    foreach ($items as $item) {
                        $snippet = $item['snippet'] ?? [];
                        $duration = $item['contentDetails']['duration'] ?? '';
                        $interval = $duration ? new \DateInterval($duration) : null;
                        $seconds = $interval instanceof \DateInterval ? $interval->d * 86400 + $interval->h * 3600 + $interval->i * 60 + $interval->s : 0;
                        if (! preg_match('/^[a-zA-Z0-9_-]{11}$/', $item['id'] ?? '') || ! $this->eligible($seconds, $snippet['publishedAt'] ?? null, $criteria) || ($snippet['liveBroadcastContent'] ?? 'none') !== 'none') {
                            continue;
                        }

                        $videos[] = ['platform' => 'youtube', 'id' => $item['id'], 'title' => mb_substr(html_entity_decode($snippet['title'] ?? ''), 0, 255), 'creator' => $snippet['channelTitle'] ?? '', 'thumbnail' => $snippet['thumbnails']['medium']['url'] ?? null, 'url' => 'https://www.youtube.com/watch?v='.$item['id'], 'views' => isset($item['statistics']['viewCount']) ? (int) $item['statistics']['viewCount'] : null, 'duration' => $seconds, 'published_at' => $snippet['publishedAt'] ?? null, 'source_access' => 'attempt_on_selection', 'reason' => __($query === '' ? 'app.from_the_platform_popularity_feed' : 'app.matches_your_topic')];
                    }
                } catch (Throwable $exception) {
                    Log::warning('Discovery source unavailable.', ['provider' => 'youtube', 'exception_type' => $exception::class]);
                    $warnings[] = __('app.youtube_is_temporarily_unavailable');
                }
            }
        }

        if ($platform !== 'youtube') {
            try {
                foreach ($this->bilibili->search($criteria['bilibili_query']) as $item) {
                    $duration = $item['duration'] ?? 0;
                    if (is_string($duration) && str_contains($duration, ':')) {
                        $duration = array_reduce(explode(':', $duration), fn (int $total, string $part): int => $total * 60 + (int) $part, 0);
                    }

                    $published = isset($item['pubdate']) ? CarbonImmutable::createFromTimestampUTC((int) $item['pubdate'])->toIso8601String() : null;
                    if (! preg_match('/^BV[a-zA-Z0-9]{10}$/', $item['bvid'] ?? '') || ! $this->eligible((int) $duration, $published, $criteria)) {
                        continue;
                    }

                    $thumbnail = $item['pic'] ?? null;
                    if (is_string($thumbnail) && str_starts_with($thumbnail, '//')) {
                        $thumbnail = 'https:'.$thumbnail;
                    }

                    if (is_string($thumbnail) && str_starts_with($thumbnail, 'http://')) {
                        $thumbnail = 'https://'.substr($thumbnail, 7);
                    }

                    $videos[] = ['platform' => 'bilibili', 'id' => $item['bvid'], 'title' => mb_substr(html_entity_decode(strip_tags($item['title'] ?? '')), 0, 255), 'creator' => $item['owner']['name'] ?? $item['author'] ?? '', 'thumbnail' => $thumbnail, 'url' => 'https://www.bilibili.com/video/'.$item['bvid'], 'views' => isset($item['stat']['view']) ? (int) $item['stat']['view'] : (is_numeric($item['play'] ?? null) ? (int) $item['play'] : null), 'duration' => (int) $duration, 'published_at' => $published, 'source_access' => 'attempt_on_selection', 'reason' => __($criteria['bilibili_query'] === '' ? 'app.from_the_platform_popularity_feed' : 'app.matches_your_topic')];
                }
            } catch (Throwable $exception) {
                Log::warning('Discovery source unavailable.', ['provider' => 'bilibili', 'exception_type' => $exception::class]);
                $warnings[] = __('app.bilibili_is_temporarily_unavailable');
            }
        }

        $videos = collect($videos)->unique(fn (array $v): string => $v['platform'].':'.$v['id'])->groupBy('platform')->flatMap(fn ($items) => $items->take(8))->values();
        if ($popular && $criteria['mode'] === 'popular') {
            $videos = $videos->sortByDesc('views')->values();
        }

        return ['videos' => $videos->take(16)->all(), 'warnings' => array_values(array_unique($warnings)), 'criteria' => $criteria];
    }

    private function eligible(int $duration, ?string $published, array $criteria): bool
    {
        return $duration > 0 && $duration <= 240 && ($criteria['days'] === 0 || ($published !== null && CarbonImmutable::parse($published)->betweenIncluded(now()->subDays($criteria['days']), now())));
    }

    private function youtube(string $key, string $query, bool $popular, array $criteria, array &$warnings): array
    {
        $base = ['key' => $key, 'part' => 'snippet,statistics,contentDetails'];
        if ($query === '') {
            $response = Http::timeout(20)->get('https://www.googleapis.com/youtube/v3/videos', [...$base, 'chart' => 'mostPopular', 'regionCode' => $criteria['region'], 'maxResults' => 50]);
            if ($response->json('error.errors.0.reason') === 'videoChartNotFound') {
                Log::warning('Discovery regional chart unavailable; using global chart.', ['provider' => 'youtube', 'region' => $criteria['region']]);
                $warnings[] = __('app.regional_chart_unavailable_showing_global_results');
                $response = Http::timeout(20)->get('https://www.googleapis.com/youtube/v3/videos', [...$base, 'chart' => 'mostPopular', 'maxResults' => 50]);
            }
        } else {
            $params = ['key' => $key, 'part' => 'snippet', 'type' => 'video', 'q' => $query, 'maxResults' => 25, 'videoDuration' => 'short', 'order' => $popular && $criteria['mode'] === 'popular' ? 'viewCount' : 'relevance', 'safeSearch' => 'moderate'];
            if ($criteria['days'] > 0) {
                $params['publishedAfter'] = now()->subDays($criteria['days'])->toIso8601String();
            }

            $search = Http::timeout(20)->get('https://www.googleapis.com/youtube/v3/search', $params);
            $search->throw();
            $ids = collect($search->json('items', []))->pluck('id.videoId')->filter()->implode(',');
            if ($ids === '') {
                return [];
            }

            $response = Http::timeout(20)->get('https://www.googleapis.com/youtube/v3/videos', [...$base, 'id' => $ids]);
        }

        $response->throw();

        return $response->json('items', []);
    }
}
