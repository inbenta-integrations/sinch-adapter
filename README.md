# SINCH CHATBOT ADAPTER
 
## TABLE OF CONTENTS
* [Description](#description)
* [Functionalities](#functionalities)
* [Installation](#installation)
* [Configuration](#configuration)
    * [Middleware](#middleware)
    * [Sinch Adapter](#sinch-adapter)
    * [Inbenta Backstage Instance](#inbenta-backstage-instance)
* [Example](#example)
* [Dependencies](#dependencies)
 
## DESCRIPTION
This adapter overwrites the way the Inbenta bot starts a chat. Specifically, instead of starting a chat on the standard Hyperchat (Inbenta chat product), it does so with Sinch.

You can find a configurated and functional **example of this adapter** in `./example/index.html`.

## FUNCTIONALITIES
Currently, the features provided by this application are:
* Escalate to Sinch chat.
* Manage open/close from both chatbot and Sinch chat.
* Send the next chatbot variables: EMAIL, FIRST_NAME, LAST_NAME, INQUIRY. 
* Go back to Inbenta chatbot once user finishes to talk with an agent.
* Sinch ticket creation on no agents available

## INSTALLATION
In order to add this adapter to your SDK, you need to import the files `/src/sinch_adapter.js` into your HTML/JS file where you're building the SDK. Then, append it to the SDK adapters array providing the adapter configuration as shown in the [example](#integration-example) section.

More information on how to integrate Inbenta adapters [here](https://developers.inbenta.io/chatbot/javascript-sdk/sdk-adapters).

Also, you will need to install the middleware (a PHP App contained in folder `middleware`) in a public server . This will execute the requests that contain sensitive information to Sinch.

## CONFIGURATION
This section contains the configuration of 3 components:
* Middleware
* Sinch Adapter
* Inbenta Backstage Instance

### Middleware

To validate agents availability and also the ticket creation (on no agents available) you'll need a middleware Application. This project is included in **middleware** folder, with a PHP application with all the needed logic.

You'll have to add the information in the configuration file **.env** (**.envExample** file should be renamed to **.env**):

* `SINCH_USER`: A valid Sinch user with the capabilities to create tickets.
* `SINCH_PWD`: Password of the given user.
* `SINCH_BASE_URL`: Sinch base url.
* `SINCH_AUTH_URI`: Uri for the creation of the authorization.
* `SINCH_QUEUE_URL`: Uri to get the queue information
* `SINCH_QUEUE_ADDRESS_URL`: Uri to get the addresses information by queue
* `SINCH_TICKET_URL`: Uri to create ticket
* `SINCH_AUTH`: Auth value
* `TOKEN`: Customer defined value, should be the same value added in `/src/sinch_adapter.js` file (`ticketToken` variable).
* `DOMAINS`: List of domains (separeted by coma) in which the adapter is installed.

This PHP uses these composer dependencies:

* `guzzlehttp/guzzle`
* `vlucas/phpdotenv`
* `klein/klein`
 
### Sinch Adapter

Below is the necessary configuration for the adapter and the definition of the different properties:

```javascript
let middlewareConf = {
    url: "", // Url of the middleware
    token: "", // Customer defined, same as env in middleware
    agentsAvailabilityUri: '/agentsAvailability', // Do not change
    createTicketUri: '/createTicket', // Do not change
};
```

* `url`(string): Middleware URL used to vañidate agents availability and create a new ticket.
* `token`(string): Customer defined value (same as env in middleware) to add an extra security layer.
* `agentsAvailabilityUri`(string): Uri for validate the agents availability (should not be changed)
* `createTicketUri`(string): Uri for the ticket creation (should not be changed)

```javascript
// Sinch Adapter conf
let sinchConf: {
    baseUrl: "", // Provided by Sinch
    authUri: "", // Provided by Sinch (ex: "/visitor/ecfs/authentication")
    webSocketUrl: "", // Provided by Sinch (ex: "wss://example.com/visitor/ecfs/ws_endpoint/")
    ticketQueue: "", //Default queue for tickets
    queueDefault: "", // Name of the default queue
    transferToDifferentQueue: false, // Search in a different queue if the selected is not available
    destination: '',
    destinationDefault: "", //Default destination address (depending on the queue)
    protocolVersion: 13, // 13 at the moment of creation of this document
    // labels: {}
}
```

* `baseUrl`(string): Base url for Sinch requests
* `authUri`(string): Authorization URL, used start the session for a new agent conversation.
* `webSocketUrl`(string): Web socket URL, which creates the channel of the comunication between user-agent.
* `ticketQueue`(string): Value to indicate the default queue where the ticket will be created.
* `queueDefault`(string): Queue to search in when availability validation is executed. Empty for non specific queue.
* `transferToDifferentQueue`(bool): If true, will search in a different queue when no agents in the default queue (if `queueDefault` is active).
* `destination`(string): Email provided by Sinch
* `destinationDefault`(string): Email provided by Sinch
+ `protocolVersion` (int): Version of the protocol, provided by Sinch
* `labels`(object):
    * `waitingForAnAgent`(string): This param is used to show a placeholder while Inbenta is doing the transition between the chatbot and the Sinch.
    * `agentConnected`(string): Message displayed when an agent is connected (it show the name of the Sinch agent).
    * `agentCoversationClosed`(string): Message displayed when the conversation with the agent is closed.
    * `queueClosed`(string): Message to display when queue is closed.
    * `noAgentsAvailable`(string): Message to display when there are no agents available.
    * `transferToDifferentQueue`(string): Message to indicate that the conversation is being transferred to a different queue.
    * `ticketCreationSuccess`(string): Message when a ticket is created
    * `ticketCreationError`(string): Error message when a ticket is not created

### Backstage Configuration

If there are no agents available, the process of the creation of a Sinch ticket will be triggered. In Inbenta Backstage validate you have a "No Agents Available" intent in the "Offer escalation" dialog. This intent should have a "Direct Call": **escalationNoAgentsAvailable**.

The "No Agents Available" intent should have a dialog to an intent to start a ticket form ("Create Ticket Form"). By default the used variables are 4: _FIRST_NAME_, _LAST_NAME_, _EMAIL_ADDRESS_, _INQUIRY_.

The "Create Ticket Form" intent should execute a _Callback_ called **createTicket**. Go to "**Knowledge Base → Actions**" to validate if this callback exists. If not, create it with the _function name_ **createTicket** and adding it in **Parameters** the same variables used in the form of "Create Ticket Form" intent.

## EXAMPLE
As commented before, there is an example in `./example/index.html`. To make it work, you will need add the ```inbentaKey``` and ```domainKey``` of your Chatbot instance.

Additionally, the values in `/src/sinch_adapter.js` are mandatory in order to start the escalation process. See the needed values in addapter [here](#sinch-adapter)


## DEPENDENCIES
This adapter has been developed using Chatbot SDK version **1.69.2**.
