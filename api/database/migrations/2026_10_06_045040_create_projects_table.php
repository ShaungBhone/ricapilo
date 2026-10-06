<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('projects', function (Blueprint $t): void {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('assistant_id')->nullable()->constrained()->nullOnDelete();
            $t->string('title');
            $t->string('source')->default('upload');
            $t->string('source_id')->nullable();
            $t->text('source_url')->nullable();
            $t->longText('transcript')->nullable();
            $t->longText('script')->nullable();
            $t->string('status')->default('draft')->index();
            $t->string('stage')->nullable();
            $t->text('error')->nullable();
            $t->string('audio_path')->nullable();
            $t->string('video_path')->nullable();
            $t->string('media_path')->nullable();
            $t->json('captions')->nullable();
            $t->json('usage')->nullable();
            $t->string('format')->default('vertical');
            $t->string('caption_style')->default('clean-bottom');
            $t->unsignedInteger('target_seconds')->default(60);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('projects');
    }
};
