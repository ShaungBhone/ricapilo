<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['split_enabled', 'split_minutes', 'split_results'] as $column) {
            if (! Schema::hasColumn('projects', $column)) {
                Schema::table('projects', function (Blueprint $table) use ($column): void {
                    match ($column) {
                        'split_enabled' => $table->boolean($column)->default(false),
                        'split_minutes' => $table->unsignedInteger($column)->default(5),
                        default => $table->json($column)->nullable(),
                    };
                });
            }
        }
    }

    public function down(): void {}
};
