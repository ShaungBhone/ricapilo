<?php

namespace App\Services;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class Discovery
{
    public function search(string $query, string $platform, bool $popular = true): array
    {
        $videos = [];
        $warnings = [];
        if ($platform !== 'dailymotion') {
            $secret = DB::table('site_settings')->where('key', 'youtube_key')->value('value');
            $key = $secret ? Crypt::decryptString($secret) : config('recap.youtube_key');
            if (! $key) {
                $warnings[] = 'YouTube ရှာဖွေရန် စီမံခန့်ခွဲသူက API key ထည့်ရန် လိုပါသည်။';
            } else {
                $r = Http::timeout(20)->get('https://www.googleapis.com/youtube/v3/search', ['key' => $key, 'part' => 'snippet', 'type' => 'video', 'q' => $query, 'maxResults' => 8, 'videoDuration' => 'short', 'order' => $popular ? 'viewCount' : 'relevance', 'safeSearch' => 'moderate']);
                if (! $r->successful()) {
                    $warnings[] = 'YouTube ကို လတ်တလော ချိတ်ဆက်၍မရပါ။';
                } else {
                    $ids = collect($r->json('items', []))->pluck('id.videoId')->implode(',');
                    $stats = Http::timeout(20)->get('https://www.googleapis.com/youtube/v3/videos', ['key' => $key, 'part' => 'statistics,contentDetails', 'id' => $ids]);
                    $indexed = collect($stats->json('items', []))->keyBy('id');
                    foreach ($r->json('items', []) as $v) {
                        $id = $v['id']['videoId'];
                        $s = $indexed->get($id, []);
                        $videos[] = ['platform' => 'youtube', 'id' => $id, 'title' => html_entity_decode($v['snippet']['title']), 'creator' => $v['snippet']['channelTitle'], 'thumbnail' => $v['snippet']['thumbnails']['medium']['url'], 'url' => 'https://www.youtube.com/watch?v='.$id, 'views' => (int) ($s['statistics']['viewCount'] ?? 0), 'duration' => $s['contentDetails']['duration'] ?? null, 'published_at' => $v['snippet']['publishedAt'], 'source_access' => 'attempt_on_selection'];
                    }
                }
            }
        }

        if ($platform !== 'youtube') {
            $r = Http::timeout(20)->get('https://api.dailymotion.com/videos', ['search' => $query, 'sort' => $popular ? 'visited-week' : 'relevance', 'limit' => 24, 'fields' => 'id,title,owner.screenname,thumbnail_360_url,url,views_total,duration,created_time']);
            if (! $r->successful()) {
                $warnings[] = 'Dailymotion ကို လတ်တလော ချိတ်ဆက်၍မရပါ။';
            } else {
                foreach (array_slice(array_values(array_filter($r->json('list', []), fn (array $v): bool => (int) ($v['duration'] ?? 0) > 0 && (int) $v['duration'] <= 240)), 0, 8) as $v) {
                    $videos[] = ['platform' => 'dailymotion', 'id' => $v['id'], 'title' => $v['title'], 'creator' => $v['owner.screenname'] ?? '', 'thumbnail' => $v['thumbnail_360_url'] ?? null, 'url' => 'https://www.dailymotion.com/video/'.$v['id'], 'views' => $v['views_total'] ?? null, 'duration' => $v['duration'] ?? null, 'published_at' => $v['created_time'] ?? null, 'source_access' => 'attempt_on_selection'];
                }
            }
        }

        return ['videos' => $videos, 'warnings' => $warnings];
    }
}
