<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\WorkspaceController;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::prefix('api/v1')->group(function (): void {
    Route::get('/csrf', fn () => response()->json(['token' => csrf_token()]));
    Route::middleware('throttle:auth')->group(function (): void {
        Route::post('/auth/register', [AuthController::class, 'register']);
        Route::post('/auth/login', [AuthController::class, 'login'])->name('login');
        Route::post('/auth/forgot', [AuthController::class, 'forgot']);
        Route::post('/auth/reset', [AuthController::class, 'reset']);
    });
    Route::middleware('auth')->group(function (): void {
        Route::get('/auth/me', fn (Request $r) => response()->json([...$r->user()->toArray(), 'email_verification_required' => (bool) config('recap.email_verification_required')]));
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::get('/email/verify/{id}/{hash}', function (EmailVerificationRequest $r) {
            $r->fulfill();

            return redirect(config('recap.frontend_url'));
        })->middleware('signed:relative')->name('verification.verify');
        Route::post('/email/resend', function (Request $r) {
            if (! $r->user()->hasVerifiedEmail()) {
                $r->user()->sendEmailVerificationNotification();
            }

            return ['message' => __('app.verification_email_sent')];
        })->middleware('throttle:3,1');
        Route::get('/keys', [WorkspaceController::class, 'keys']);
        Route::put('/keys', [WorkspaceController::class, 'saveKey']);
        Route::delete('/keys', [WorkspaceController::class, 'deleteKey']);
        Route::get('/models', [WorkspaceController::class, 'models']);
        Route::get('/assistants', [WorkspaceController::class, 'assistants']);
        Route::post('/assistants', [WorkspaceController::class, 'saveAssistant']);
        Route::put('/assistants/{id}', [WorkspaceController::class, 'saveAssistant']);
        Route::delete('/assistants/{id}', [WorkspaceController::class, 'deleteAssistant']);
        Route::get('/projects', [WorkspaceController::class, 'projects']);
        Route::post('/projects', [WorkspaceController::class, 'createProject']);
        Route::get('/projects/{id}', [WorkspaceController::class, 'showProject']);
        Route::patch('/projects/{id}', [WorkspaceController::class, 'updateProject']);
        Route::post('/projects/{id}/upload', [WorkspaceController::class, 'upload']);
        Route::delete('/projects/{id}', [WorkspaceController::class, 'deleteProject']);
        Route::get('/projects/{id}/download/{kind}', [WorkspaceController::class, 'download']);
        Route::get('/conversations', [WorkspaceController::class, 'conversations']);
        Route::get('/conversations/{id}', [WorkspaceController::class, 'conversation']);
        Route::get('/admin', [WorkspaceController::class, 'admin']);
        Route::put('/admin', [WorkspaceController::class, 'saveAdmin']);
        Route::middleware('verified')->group(function (): void {
            Route::post('/discover', [WorkspaceController::class, 'discover'])->middleware('throttle:discovery');
            Route::post('/projects/{id}/generate', [WorkspaceController::class, 'generate'])->middleware('throttle:generation');
            Route::post('/assistants/{id}/preview', [WorkspaceController::class, 'previewVoice'])->middleware('throttle:generation');
            Route::post('/talk', [WorkspaceController::class, 'talk'])->middleware('throttle:generation');
            Route::post('/transcribe', [WorkspaceController::class, 'transcribe'])->middleware('throttle:generation');
        });
    });
});
