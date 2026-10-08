<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('credentials');
    }

    public function down(): void
    {
        Schema::create('credentials', function (Blueprint $t): void {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('provider');
            $t->text('secret');
            $t->unique(['user_id', 'provider']);
            $t->timestamps();
        });
    }
};
