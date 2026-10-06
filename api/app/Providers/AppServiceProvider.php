<?php

namespace App\Providers;

use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        VerifyEmail::createUrlUsing(fn ($user) => config('recap.frontend_url').'/api/backend'.URL::temporarySignedRoute('verification.verify', now()->addMinutes(60), ['id' => $user->id, 'hash' => sha1($user->email)], false));
        ResetPassword::createUrlUsing(fn ($user, $token) => config('recap.frontend_url').'/reset-password?token='.$token.'&email='.urlencode($user->email));
        RateLimiter::for('auth', fn (Request $r) => Limit::perMinute(5)->by(strtolower((string) $r->input('email')).'|'.$r->ip()));
        RateLimiter::for('generation', fn (Request $r) => Limit::perMinute(10)->by((string) $r->user()?->id));
        RateLimiter::for('discovery', fn (Request $r) => Limit::perMinute(10)->by((string) $r->user()?->id));
    }
}
