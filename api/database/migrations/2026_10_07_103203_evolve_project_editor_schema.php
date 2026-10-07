<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['editor_settings', 'editor_assets'] as $column) {
            if (! Schema::hasColumn('projects', $column)) {
                Schema::table('projects', function (Blueprint $table) use ($column): void {
                    $table->json($column)->nullable();
                });
            }
        }
    }

    public function down(): void
    {
        // These columns also belong to the initial schema. Keep editor data on rollback.
    }
};
