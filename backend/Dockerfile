# Dockerfile for PHP backend with MySQL support
FROM php:8.2-apache

# Install PDO MySQL extension
RUN docker-php-ext-install pdo pdo_mysql && \
    a2enmod rewrite

# Copy backend files into Apache document root
COPY . /var/www/html/

RUN chown -R www-data:www-data /var/www/html

EXPOSE 80

CMD ["apache2-foreground"]
