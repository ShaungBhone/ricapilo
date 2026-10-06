<?php

namespace App\Support;

use Illuminate\Support\Facades\Lang;

class LocalizedMessage
{
    public static function translate(?string $message): ?string
    {
        if ($message === null) {
            return null;
        }

        if (str_starts_with($message, 'app.') && Lang::has($message, 'en', false)) {
            $translated = __($message);

            return is_string($translated) ? $translated : $message;
        }

        foreach (Lang::get('app', [], 'en') as $key => $english) {
            if ($english === $message) {
                return __('app.'.$key);
            }
        }

        $translated = __($message);

        return is_string($translated) ? $translated : $message;
    }
}
