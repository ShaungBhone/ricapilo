FROM php:8.4-apache-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev libzip-dev unzip ffmpeg python3-venv curl && docker-php-ext-install pdo_pgsql bcmath zip && pecl install redis && docker-php-ext-enable redis && python3 -m venv /opt/media && /opt/media/bin/pip install --no-cache-dir yt-dlp bilibili-cli==0.6.2 && a2enmod rewrite headers && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/media/bin:$PATH" APACHE_DOCUMENT_ROOT=/var/www/html/public BILIBILI_SCRIPT=/opt/media/bilibili.py MEDIA_PYTHON=/opt/media/bin/python
RUN sed -ri 's!/var/www/html!/var/www/html/public!g' /etc/apache2/sites-available/000-default.conf && printf '<Directory /var/www/html/public>\nAllowOverride All\nRequire all granted\n</Directory>\n' > /etc/apache2/conf-available/recap.conf && a2enconf recap
RUN printf "upload_max_filesize=300M\npost_max_size=310M\nmemory_limit=512M\n" > /usr/local/etc/php/conf.d/recap.ini
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/html
COPY api/composer.json api/composer.lock ./
RUN composer install --no-interaction --prefer-dist --no-scripts
COPY scripts/bilibili.py /opt/media/bilibili.py
COPY api/ .
RUN composer dump-autoload --optimize && mkdir -p storage/app/private storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs && chown -R www-data:www-data storage bootstrap/cache
COPY docker/api-entrypoint.sh /usr/local/bin/recap-entrypoint
RUN chmod +x /usr/local/bin/recap-entrypoint
ENTRYPOINT ["recap-entrypoint"]
CMD ["apache2-foreground"]
