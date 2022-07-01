<?php

namespace App;

use Exception;
use App\SinchApi;
use Klein\Response;

class SinchAction
{
    protected $request;
    protected $env;
    protected $headers;

    public function __construct($env, $headers)
    {
        $this->request = json_decode(file_get_contents('php://input'));
        $this->env = $env;
        $this->headers = $headers;

        if (!$this->validateOrigin()) {
            throw new Exception("Domain error");
        }
        if (!$this->validateToken()) {
            throw new Exception("Error with validation");
        }
        $this->api = new SinchApi($env);
    }

    /**
     * Validate if origin is correct
     * @return bool
     */
    protected function validateOrigin(): bool
    {
        if (!isset($this->headers['Origin'])) return true;
        if ($this->headers['Origin'] === '') return true;
        if (!isset($this->env['DOMAINS']) || $this->env['DOMAINS'] === '') return true;

        $origin = str_replace(['https://', 'http://', 'www.'], '', $this->headers['Origin']);
        $domains = explode(',', str_replace(' ', '', $this->env['DOMAINS']));
        if (!in_array($origin, $domains)) return false;

        return true;
    }

    /**
     * Check if the given token is the same than the env configuration
     * @return bool
     */
    protected function validateToken(): bool
    {
        if (!isset($this->headers['X-Inbenta-Token'])) return false;
        if (trim($this->headers['X-Inbenta-Token']) === "") return false;

        if (!isset($this->env["TOKEN"])) return false;
        return $this->env["TOKEN"] === $this->headers['X-Inbenta-Token'];
    }

    /**
     * Get the agents availability
     * @param array $params
     * @param Response $response
     * @return array
     */
    public function getAgentsAvailability(array $params, Response $response): array
    {
        $cookie = $this->api->makeAuth();
        if (isset($cookie['error'])) {
            $response->code(401);
            return ['error' => 'Error on authorization'];
        }

        $queues = $this->api->getAgentsAvailability($cookie);

        if (isset($params['getAddresses']) && $params['getAddresses'] == 1) {
            $addresses = $this->api->getAddresses($cookie);
            if (isset($addresses['error'])) return $queues;

            foreach ($queues as $index => $queue) {
                foreach ($addresses as $address) {
                    if ($queue['id'] == $address['id'] && isset($address['addresses']['address'])) {
                        $queues[$index]['addresses'] = $address['addresses']['address'];
                        break;
                    }
                }
            }
        }
        return $queues;
    }

    /**
     * Create a new ticket
     * @param string $bodyParams
     * @return array
     */
    public function createTicket(string $bodyParams): array
    {
        return $this->api->createTicket($bodyParams);
    }
}
