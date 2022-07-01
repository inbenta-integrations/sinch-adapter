<?php

namespace App;

use Exception;
use GuzzleHttp\Client as Guzzle;
use GuzzleHttp\Exception\ClientException;

class SinchApi
{
    protected $authToken;
    protected $env;
    const TYPE_QUEUE = 'Chat';

    public function __construct($env)
    {
        $this->env = $env;
        $this->createAuthToken();
    }

    /**
     * Create auth token
     */
    protected function createAuthToken(): void
    {
        $this->authToken = base64_encode($this->env["SINCH_USER"] . ":" . $this->env["SINCH_PWD"]);
    }

    /**
     * Execute the remote request
     * @param string $method
     * @param string $url
     * @param array $headers
     * @param object $params = null
     * @param object $getCookies = false
     * @return array
     */
    protected function remoteRequest(string $method, string $url, array $headers, object $params = null, $getCookies = false): array
    {
        $response = [
            'error' => 'Error on request'
        ];
        try {
            $cookies = $getCookies ? ['cookies'  => true] : [];
            $client = new Guzzle($cookies);
            $clientParams = ['headers' => $headers];
            if (!is_null($params)) {
                $clientParams['body'] = json_encode($params);
            }

            $serverOutput = $client->$method($url, $clientParams);
            if (method_exists($serverOutput, 'getBody')) {
                $responseBody = $serverOutput->getBody();
                if (method_exists($responseBody, 'getContents')) {
                    $responseString = $responseBody->getContents();
                    $response = json_decode($responseString, true);
                    if (is_null($response)) {
                        return ['message' => $responseString];
                    }
                    if ($getCookies) {
                        $response['cookie'] = $serverOutput->getHeaderLine('Set-Cookie');
                    }
                    return $response;
                }
            }
        } catch (ClientException $e) {
            if (method_exists($e, "getResponse")) {
                $response['error'] = $e->getResponse()->getBody()->getContents();
            }
        }
        return $response;
    }

    /**
     * Make the authorization and returns the Cookie to use in next requests
     * @return array
     */
    public function makeAuth(): array
    {
        $uriAuth = $this->env['SINCH_BASE_URL'] . $this->env['SINCH_AUTH_URI'] . '?Authorization=Basic%20' . $this->authToken;
        $headers = [
            'Content-Type' => 'application/x-www-form-urlencoded',
            'Authorization' => $this->env['SINCH_AUTH']
        ];
        return $this->remoteRequest('post', $uriAuth, $headers, null, true);
    }

    /**
     * Get the agents availability
     * @param array $cookie
     * @return array
     */
    public function getAgentsAvailability(array $cookie): array
    {
        $uri = $this->env['SINCH_BASE_URL'] . $this->env['SINCH_QUEUE_URL'] . '?type=' . self::TYPE_QUEUE;
        $headers = [
            'Content-Type' => 'application/json',
            'Cookie' => $cookie['cookie']
        ];
        $response = $this->remoteRequest('get', $uri, $headers);

        return $response;
    }

    /**
     * Get the addresses
     * @param array $cookie
     * @return array
     */
    public function getAddresses(array $cookie): array
    {
        $uri = $this->env['SINCH_BASE_URL'] . $this->env['SINCH_QUEUE_ADDRESS_URL'] . '?type=' . self::TYPE_QUEUE;
        $headers = [
            'Content-Type' => 'application/json',
            'Cookie' => $cookie['cookie']
        ];
        return $this->remoteRequest('get', $uri, $headers);
    }

    /**
     * Create a new ticket
     * @param string $bodyParams
     * @return array
     */
    public function createTicket(string $bodyParams): array
    {
        $payload = json_decode($bodyParams);
        $uri = $this->env['SINCH_BASE_URL'] . $this->env['SINCH_TICKET_URL'];
        $headers = [
            "Authorization" => "Basic " . $this->authToken,
            "Content-Type" => "application/json"
        ];
        return $this->remoteRequest('post', $uri, $headers, $payload);
    }
}
