<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

class MakeAdmin extends Command
{
    protected $signature = 'recap:admin {email}';

    protected $description = 'Promote an existing verified user to administrator';

    public function handle(): int
    {
        $u = User::where('email', $this->argument('email'))->first();
        if (! $u || ! $u->hasVerifiedEmail()) {
            $this->error('Create and verify this account first.');

            return self::FAILURE;
        }
        $u->forceFill(['is_admin' => true])->save();
        $this->info('Administrator access granted.');

        return self::SUCCESS;
    }
}
