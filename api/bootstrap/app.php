<?php

declare(strict_types=1);

use App\Exceptions\GenerationException;
use App\Http\Middleware\EnsureEmailIsVerified;
use App\Http\Middleware\SetLocale;
use App\Support\LocalizedMessage;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(SetLocale::class);
        $middleware->alias(['verified' => EnsureEmailIsVerified::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->render(function (GenerationException $error, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => LocalizedMessage::translate($error->getMessage())], 500);
            }
        });
        $exceptions->respond(function ($response) {
            if ($response instanceof JsonResponse) {
                $data = $response->getData(true);
                if (isset($data['message']) && is_string($data['message'])) {
                    $data['message'] = LocalizedMessage::translate($data['message']);
                    $response->setData($data);
                }
            }

            return $response;
        });
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request): bool => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
