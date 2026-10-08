<?php

declare(strict_types=1);

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Auth\Notifications\VerifyEmail;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        Gate::define('admin', fn (User $user): bool => (bool) $user->is_admin);
        VerifyEmail::createUrlUsing(fn ($user): string => config('recap.frontend_url').'/api/backend'.URL::temporarySignedRoute('verification.verify', now()->addMinutes(60), ['id' => $user->id, 'hash' => sha1($user->email)], false));
        ResetPassword::createUrlUsing(fn ($user, $token): string => config('recap.frontend_url').'/reset-password?token='.$token.'&email='.urlencode($user->email));
        RateLimiter::for('auth', fn (Request $r) => Limit::perMinute(5)->by(strtolower((string) $r->input('email')).'|'.$r->ip()));
        RateLimiter::for('generation', fn (Request $r) => Limit::perMinute(10)->by((string) $r->user()?->id));
        RateLimiter::for('discovery', fn (Request $r) => Limit::perMinute(10)->by((string) $r->user()?->id));
    }
}
