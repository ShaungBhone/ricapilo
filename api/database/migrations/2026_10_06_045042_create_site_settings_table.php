<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->boolean('is_admin')->default(false));
        Schema::create('site_settings', function (Blueprint $t): void {
            $t->string('key')->primary();
            $t->text('value');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_settings');
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('is_admin'));
    }
};
