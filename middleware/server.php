<?php

require 'vendor/autoload.php';

use App\SinchAction;
use Klein\Klein as Router;
use Klein\Request;
use Klein\Response;

$envPath = __DIR__ . '/.env';
if (is_file($envPath)) {
    Dotenv\Dotenv::createImmutable(__DIR__)->safeLoad();
}

$headers = getallheaders();
$router = new Router();

try {
    $app = new SinchAction($_ENV, $headers);

    $router->respond('GET', '/agentsAvailability', function (Request $request, Response $response) use ($app) {
        $result = $app->getAgentsAvailability($request->params(), $response);
        return $response->json($result);
    });

    $router->respond('POST', '/createTicket', function (Request $request, Response $response) use ($app) {
        $result = $app->createTicket($request->body());
        return $response->json($result);
    });
} catch (Exception $e) {
    $router->respond(function (Request $request, Response $response) use ($e) {
        $response->code(403);
        header_remove("Access-Control-Allow-Origin");
        $error = ["error" => $e->getMessage()];
        return $response->json($error);
    });
}

$router->dispatch();
