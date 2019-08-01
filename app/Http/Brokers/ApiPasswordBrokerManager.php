<?php

namespace App\Http\Brokers;

use Illuminate\Support\Str;
use InvalidArgumentException;
use Illuminate\Auth\Passwords\DatabaseTokenRepository;
use Illuminate\Contracts\Auth\PasswordBrokerFactory as FactoryContract;

class ApiPasswordBrokerManager implements FactoryContract
{
    protected $app;

    protected $brokers = [];

    public function __construct($app)
    {
        $this->app = $app;
    }

    public function broker($name = null)
    {
        $name = $name ?: $this->getDefaultDriver();

        return isset($this->brokers[$name])
            ? $this->brokers[$name]
            : $this->brokers[$name] = $this->resolve($name);
    }

    protected function resolve($name)
    {
        $config = $this->getConfig($name);

        if (is_null($config))
        {
            throw new InvalidArgumentException("Passwored resetter [{$name}] is not defined.");
        }

        return new ApiPasswordBroker(
            $this->createTokenRepository($config),
            $this->app['auth']->createUserProvider($config['provider'] ?? null)
        );
    }

    /**
     * Create a token repository instance based on the given configuration.
     *
     * @param  array  $config
     * @return \Illuminate\Auth\Passwords\TokenRepositoryInterface
     */
    protected function createTokenRepository(array $config)
    {
        $key = $this->app['config']['app.key'];

        if (Str::startsWith($key, 'base64:')) {
            $key = base64_decode(substr($key, 7));
        }

        $connection = $config['connection'] ?? null;

        return new DatabaseTokenRepository(
            $this->app['db']->connection($connection),
            $this->app['hash'],
            $config['table'],
            $key,
            $config['expire']
        );
    }

    protected function getConfig($name)
    {
        return $this->app['config']["auth.passwords.{$name}"];
    }

    public function getDefaultDriver()
    {
        return $this->app['config']['auth.defaults.passwords'];
    }

    public function setDefaultDriver($name)
    {
        $this->app['config']['auth.defaults.passwords'] = $name;
    }

    public function __call($method, $parameters)
    {
        return $this->broker()->{$method}(...$parameters);
    }
}