<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\Middleware\EnsureEmailIsVerified as LaravelEnsureEmailIsVerified;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureEmailIsVerified
{
    /**
     * Handle an incoming request.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (config('recap.email_verification_required')) {
            if ($request->user() && ! $request->user()->hasVerifiedEmail() && $request->expectsJson()) {
                abort(403, __('Your email address is not verified.'));
            }

            return (new LaravelEnsureEmailIsVerified)->handle($request, $next);
        }

        return $next($request);
    }
}
