<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assistants', function (Blueprint $t): void {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('name');
            $t->text('instructions');
            $t->text('first_message')->nullable();
            $t->string('llm_model');
            $t->string('stt_model');
            $t->string('tts_model');
            $t->string('voice');
            $t->unsignedInteger('silence_ms')->default(1200);
            $t->boolean('enabled')->default(true);
            $t->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assistants');
    }
};
