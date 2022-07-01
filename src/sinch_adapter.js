// Middleware configuration
let middlewareConf = {
    url: '', // Url of the middleware
    token: '', // Customer defined, same as env in middleware
    agentsAvailabilityUri: '/agentsAvailability', // Do not change
    createTicketUri: '/createTicket', // Do not change
};

// Sinch Adapter conf
let sinchConf = {
    baseUrl: '',
    authUri: '',
    webSocketUrl: '',
    ticketQueue: '',
    queueDefault: '', // No default queue on empty
    transferToDifferentQueue: false, // Search in a different queue if the selected is not available
    destination: '',
    destinationDefault: '', //Default destination address (depending on the queue)
    protocolVersion: 13,
    labels: {
        waitingForAnAgent: 'Waiting for an agent',
        agentConnected: 'Agent $agentName connected',
        agentCoversationClosed: 'Agent conversation closed',
        queueClosed: 'Queue closed',
        noAgentsAvailable: 'No agents available',
        transferToDifferentQueue: 'There are no agents available in the selected queue, you are being transferred to a different queue',
        ticketCreationSuccess: 'Your ticket was created, we will contact you as soon as possible',
        ticketCreationError: 'An error occurred, try again later'
    }
};

let queueList = [];
let availabilityProcessed = false;
let interval = null;

// Get availability from middleware (and this from Sinch)
let getAvailability = function(getAddresses) {
    let url = middlewareConf.url + middlewareConf.agentsAvailabilityUri;
    url += getAddresses ? '?getAddresses=1' : '';
    let data = {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'X-Inbenta-Token' : middlewareConf.token
        }
    }
    return fetch(url, data)
        .then(res => res.json())
        .catch(error => {
            console.error('Error:', error)
            return error;
        })
        .then(response => {
            return response;
        });
}

// Promise for agent availability
let checkAgents = function (selectedQueue, getAddresses) {
    availabilityProcessed = false;
    return new Promise(resolve => {
        getAvailability(getAddresses).then(function(data) {
            if (data.error === undefined) {
                queueList = data;
                iterateThroughQueue(selectedQueue).then((availability) => {
                    resolve({'agentsAvailable': availability});
                });
            }
            else {
                resolve({'agentsAvailable': 'false'});
            }
        }).catch(error => console.error('Error: ', error))
    });
}

//Search through queue list
function iterateThroughQueue(selectedQueue) {
    return new Promise(resolve => {
        if (queueList.length === 0) {
            resolve('false');
        }
        for (let i=0; i < queueList.length; i++) {
            if (selectedQueue !== undefined && selectedQueue !== null && selectedQueue !== '') {
                if (queueList[i].id === selectedQueue && validAgentStatus(queueList[i])) {
                    resolve('true');
                }
            } else if (validAgentStatus(queueList[i])) {
                resolve('true');
            }
        }
        resolve('false');
    });
}

function validAgentStatus(queueInfo) {
    return queueInfo.agentsFree > 0;
}

/*
 * Connects Inbenta's chatbot with Sinch Live Agents
 */
var inbentaSinchAdapter = function(chatbot) {
    const genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

    let socket = null;
    let session = '';
    let clientId = genRanHex(16);
    let conversationId = '';
    let agentName = '';
    let userName = '';
    let userEmail = '';
    let directCallOfferEscalation = '';

    let subscribeReq = {
        "client_req_id": clientId,
        "method": "SUBSCRIBE",
        "uri": "/users/me/properties"
    }

    let subscribeInteractionsReq = {
        "client_req_id": clientId,
        "method": "SUBSCRIBE",
        "uri": "/users/me/interactions"
    }

    function getDataFromStorage() {
        if (localStorage.sinch === undefined || localStorage.sinch === null || localStorage.sinch === '') {
            let sinchValues = {
                conversationId: '',
                agentName: '',
                userName: '',
                userEmail: ''
            };
            localStorage.sinch = JSON.stringify(sinchValues);
        } else {
            let sinchValues = JSON.parse(localStorage.sinch);
            conversationId = sinchValues.conversationId;
            agentName = sinchValues.agentName;
            userName = sinchValues.userName;
            userEmail = sinchValues.userEmail;
        }
    }

    function startSinchSession() {
        let url = sinchConf.baseUrl + sinchConf.authUri
        fetch(url, {
            method: 'POST',
            body: '',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization' : 'Anonymous',
                'Origin': sinchConf.baseUrl
            }
        }).then(res => {
            return res;
        })
        .catch(error => console.error('Error:', error))
        .then(response => {
            for (let header of response.headers.entries()) {
                if (header[0] === 'x-jsessionid') {
                    session = header[1];
                }
            }
            setTimeout(() => {
                openSocket();
            }, 500);
        });
    }

    function putProperty(clientReqId) {
        return {
            "client_req_id": clientReqId,
            "method": "PUT",
            "uri": "/users/me/properties",
            "body": {	
                chat_address: userEmail,
                alias: userName
            }
        }
    }

    function postInteraction(clientReqId) {
        return {
            "client_req_id": clientReqId,
            "method": "POST",
            "uri": "/users/me/interactions",
            "body": {
                channel_type: "chat",
                channel_sub_type: "text",
                destination: sinchConf.destination
                /*attached_data: {
                    "test1": 1,
                    "test2": "testing2"
                }*/
            }
        }
    }

    function openSocket() {
        chatbot.actions.hideChatbotActivity();
        chatbot.actions.enableInput();

        socket = new WebSocket(sinchConf.webSocketUrl + ';jsessionid=' + session);

        socket.onopen = function(e) {
            console.log("[open] Connection established");
            
            socket.send(JSON.stringify(putProperty(clientId))); //genRanHex(16);
            // Subscribe to resources
            socket.send(JSON.stringify(subscribeReq));
            
            // Various request examples
            socket.send(JSON.stringify(subscribeInteractionsReq));    		  
            socket.send(JSON.stringify(postInteraction(clientId))); //genRanHex(16);
        };

        socket.onclose = function(event) {
            if (event.wasClean) {
                console.log(`[close] Connection closed cleanly, code=${event.code} reason=${event.reason}`);
            } else {
                // e.g. server process killed or network down
                // event.code is usually 1006 in this case
                console.log('[close] Connection died');
            }
            closeConversation();
        };

        socket.onmessage = function(event) {
            if (JSON.parse(event.data).body && JSON.parse(event.data).body.hasOwnProperty('transactions')) {
                let interBody = JSON.parse(event.data).body;
                for (let key in interBody) {
                    for (let trans in interBody[key]) {
                        for (let res in interBody[key][trans]) {
                            if (interBody[key][trans].subscribed_resource !== null && interBody[key][trans].subscribed_resource.message !== undefined) {

                                let messageFromWs = null;
                                if (hasJsonStructure(interBody[key][trans].subscribed_resource.message)) {
                                    messageFromWs = JSON.parse(interBody[key][trans].subscribed_resource.message);
                                }
                                if (messageFromWs !== null && messageFromWs.state !== undefined && messageFromWs.state !== null) {
                                    if (messageFromWs.state === 'JOINED') {
                                        agentName = messageFromWs.originator.display_name; //Agent name
                                        let agentConnected = sinchConf.labels.agentConnected.replace('$agentName', agentName);
                                        showSystemMessage(agentConnected);
                                        setChatbotName();
                                        setValueToStorage('agentName', agentName);
                                    }
                                    if (messageFromWs.state === 'LEFT') {
                                        socket.close();
                                    }
                                } else if (interBody[key][trans].subscribed_resource.originator !== userEmail && !interBody[key][trans].subscribed_resource.system_message) {
                                    showAgentMessage(interBody[key][trans].subscribed_resource.message);
                                } else if (interBody[key][trans].subscribed_resource.system_message) {
                                    showSystemMessage(interBody[key][trans].subscribed_resource.message);
                                }
                            } else if (interBody[key][trans].subscribed_resource == 'accepted') {
                                conversationId = interBody[key][trans].uri.split("/")[4];
                                chatbot.api.track('CHAT_ATTENDED', { value: true });
                                setValueToStorage("conversationId", conversationId);
                                sendTranscript();
                            } else if (interBody[key][trans].subscribed_resource == 'typing') {
                                chatbot.actions.displayChatbotActivity();
                            } else if (interBody[key][trans].subscribed_resource == 'not_typing') {
                                chatbot.actions.hideChatbotActivity();
                            }
                            break;
                        }
                    }
                }
            }
        };

        socket.onerror = function(event) {
            console.error(event);
        };
    }

    function sendUserMessage(userMessage) {
        if (userMessage !== '' && conversationId !== '') {
            if (conversationId === 'NotAcceptedYet') {
                return;
            }
            let messageStructure = {
                "client_req_id": clientId,
                "method": "POST",
                "uri": "/users/me/interactions/" + conversationId + "/transcript/messages",
                "body": {	
                    "message": userMessage,
                    "originator": sinchConf.originator
                }
            };
            socket.send(JSON.stringify(messageStructure));
        }
    }

    function showAgentMessage(agentMessage) {
        if (agentMessage !== '' && conversationId !== '') {
            const chatBotmessageData = {
                type:'answer',
                message: agentMessage
            }
            chatbot.actions.displayChatbotMessage(chatBotmessageData);
        }
    }

    function closeConversation() {
        let messageOnClose = conversationId === 'NotAcceptedYet' ? sinchConf.labels.queueClosed : sinchConf.labels.agentCoversationClosed;
        showSystemMessage(messageOnClose);
        resetSinchVariables();
        setChatbotName();
    }

    function showSystemMessage(systemMessage, translate) {
        let systemMessageData = {
            message: systemMessage
        };
        if (translate) {
            systemMessageData.translate = true;
        }
        chatbot.actions.displaySystemMessage(systemMessageData);
    }

    function setChatbotName() {
        let nameData = {
            source: 'default'
        }
        if (agentName !== '') {
            nameData = {
                source: 'name',
                name: agentName
            }
        }
        chatbot.actions.setChatbotName(nameData);
    }

    function sendTranscript() {
        const conversation = chatbot.actions.getConversationTranscript();
        let fullConversation = '';
        for (let message of conversation) {
            if (message.message !== '') {
                fullConversation += '[<strong>';
                fullConversation += message.user === 'assistant' ? 'Bot' : 'User';
                fullConversation += '</strong>]: ' + message.message.trim();
                fullConversation += '<br>';
            }
        }
        if (fullConversation !== '') {
            fullConversation = '<strong>TRANSCRIPT</strong><br>' + fullConversation;
            sendUserMessage(fullConversation);
        }
        chatbot.api.track('CHAT_ATTENDED', { value: true });
    }

    function setValueToStorage(name, value) {
        if (localStorage.sinch !== undefined && localStorage.sinch !== null && localStorage.sinch !== '') {   
            let sinchValues = JSON.parse(localStorage.sinch);
            sinchValues[name] = value;
            localStorage.sinch = JSON.stringify(sinchValues);
        }
    }

    function resetSinchVariables() {
        localStorage.sinch = '';
        conversationId = '';
        agentName = '';
        userName = '';
        userEmail = '';
    }

    function hasJsonStructure(str) {
        if (typeof str !== 'string') return false;
        try {
            const result = JSON.parse(str);
            const type = Object.prototype.toString.call(result);
            return type === '[object Object]' 
                || type === '[object Array]';
        } catch (err) {
            return false;
        }
    }

    //Set the destination based on queues addresses
    function setDestination(selectedQueue, ignoreQueue) {
        sinchConf.destination = '';
        let destinationTmp = '';
        let countAddresses = 0;

        queueList.every(queue => {
            if (queue.addresses !== undefined && queue.addresses.length > 0) {
                countAddresses = queue.addresses.length - 1;
                destinationTmp = queue.addresses[countAddresses];
                
                if (selectedQueue !== undefined && selectedQueue !== null && selectedQueue !== '') {
                    if (queue.id === selectedQueue && destinationTmp !== '' && validAgentStatus(queue)) {
                        sinchConf.destination = destinationTmp;
                        return false;
                    }
                    return true;
                } else if (destinationTmp !== '' && ignoreQueue !== queue.id && validAgentStatus(queue)) {
                    sinchConf.destination = destinationTmp;
                    return false;
                }
            }
            return true;
        });
        if (sinchConf.destination === '') {
            sinchConf.destination = sinchConf.destinationDefault;
        }
    }

    function preStartSinchSession(data, selectedQueue, ignoreQueue) {
        setDestination(selectedQueue, ignoreQueue);
        userEmail = data.EMAIL_ADDRESS;
        userName = data.FIRST_NAME;
        if (data.LAST_NAME !== undefined && data.LAST_NAME !== null) {
            userName += ' ' + data.LAST_NAME;
        }
        setValueToStorage('userName', userName);
        setValueToStorage('userEmail', userEmail);

        conversationId = 'NotAcceptedYet'; // Set any value to prevent messages from user to chatbot
        setValueToStorage('conversationId', conversationId);

        startSinchSession();
    }

    /**
     * Validate if message from chatbot has a directCall with "escalationOffer"
     * @param {object} messageData 
     * @returns 
     */
     function validateEscalationOffer(messageData) {
        return "attributes" in messageData 
            && messageData.attributes !== null 
            && "DIRECT_CALL" in messageData.attributes 
            && messageData.attributes.DIRECT_CALL === "escalationOffer"
    }

    /**
     * Check if message from chatbot has "flags" and "actions" object in the response and "end-form" in flags
     * @param {object} messageData 
     * @returns 
     */
    function validateFlagsAndActions(messageData) {
        return "flags" in messageData 
            && "actions" in messageData 
            && messageData.flags.length > 0 
            && messageData.actions.length > 0
            && messageData.flags.indexOf("end-form") !== -1
    }

    /**
     * Check agents availability
     */
    function checkAgentsSinch(sendStart) {
        checkAgents(sinchConf.queueDefault).then(function(result) {
            if ('agentsAvailable' in result) {
                chatbot.api.addVariable('agents_available', result.agentsAvailable.toString()).then(function() {;
                    if (sendStart) {
                        chatbot.actions.sendMessage({directCall:'escalationStart'});
                    }
                    availabilityProcessed = true;
                });
            }
        });
    }

    /**
     * Create the ticket when no agents available
     */
    function createTicket(formData) {
        let transcript = getTranscriptForTicket();
        let payload = {
            method: 'POST',
            headers: {
                'X-Inbenta-Token': middlewareConf.token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                data: {
                    item: {
                        type: "EMAIL",
                        queue: sinchConf.ticketQueue,
                        status: "Open"
                    },
                    subject: "Ticket from: " + formData.FIRST_NAME + " " + formData.LAST_NAME,
                    body: 'INQUIRY: ' + formData.INQUIRY + transcript,
                    fromAddress: formData.EMAIL_ADDRESS
                }
            })
        }
        let url = middlewareConf.url + middlewareConf.createTicketUri
        fetch(url, payload)
        .then(res => res.json())
        .catch(error => console.error('Error:', error))
        .then(response => {
            let message = 'Ticket created: ' + response.message;
            if (response.error !== undefined) {
                message = 'An error occurred on ticket creation';
            }
            let chatBotmessageData = {
                type:'answer',
                message: message
            }
            chatbot.actions.displayChatbotMessage(chatBotmessageData);
        });
    }

    /**
     * Get the transcript for ticket creation
     */
    function getTranscriptForTicket() {
        let transcriptText = '';
        conversation = chatbot.actions.getConversationTranscript();
        conversation.forEach(function(element) {
            user = element.user == 'guest' ? 'User' : 'Bot';
            transcriptText += user + ': ' + element.message + '\r\n';
        });
        if (transcriptText !== '') {
            transcriptText = "\n\nTRANSCRIPT:\n\n" + transcriptText.replace(/(<([^>]+)>)/gi, "");;
        }
        return transcriptText;
    }
    
    /**
     * Make the process when no agents available
     */
    function noAgentsAvailableProcess() {
        chatbot.api.addVariable('agents_available', 'false');
        chatbot.api.track('CHAT_NO_AGENTS', { value: true });
        chatbot.actions.hideChatbotActivity();
        chatbot.actions.enableInput();
        showSystemMessage(sinchConf.labels.noAgentsAvailable);
        chatbot.actions.sendMessage({directCall:'escalationNoAgentsAvailable'});
    }

    /**
     * Look for escalationOffer directCall attribute, checkAgents and set variable
     * Remove end-form directCall on escalationStart contnet
     * @param  {[Object]}   messageData [MessageData of displayChatbotMessage action]
     * @param  {Function} next        [Callback]
     * @return {[next]}               [next]
     */
    chatbot.subscriptions.onDisplayChatbotMessage(function(messageData, next) {
        //Detect escalationOffer content
        if (validateEscalationOffer(messageData) && directCallOfferEscalation === '') {
            directCallOfferEscalation = messageData.attributes.DIRECT_CALL;
            checkAgentsSinch(false);
        //Remove end-form direct-answer on "escalationStart" or "createTicket", but don't interrupt the action, so js_callback is executed
        } else if (validateFlagsAndActions(messageData)) {
            for (let i = 0; i < messageData.actions.length; i++) {
                if (!("parameters" in messageData.actions[i])) continue;
                if (!("callback" in messageData.actions[i].parameters)) continue;

                if (messageData.actions[i].parameters.callback == "createTicket" && middlewareConf.url !== "") {
                    let formData = messageData.actions[i].parameters.data;
                    createTicket(formData);
                } else if (messageData.actions[i].parameters.callback == "escalationStart") {
                    messageData.message = "";
                    messageData.messageList = [];
                }
            }
        }
        return next(messageData);
    });

    //detect escalationStart action, checkAgents and perform escalationStart directCall
    chatbot.subscriptions.onEscalationStart(function(escalationData, next) {
        console.log("onEscalationStart")
        checkAgentsSinch(true);
    });

    chatbot.subscriptions.onEscalateToAgent(function(data, next) {
        selectedQueue = data.QUEUE !== undefined ? data.QUEUE : sinchConf.queueDefault; // Specific queue defined in Backstage as a list variable
        //selectedQueue = data.AGENT_GROUP !== undefined ? data.AGENT_GROUP : sinchConf.queueDefault; //AGENT_GROUP only for Superbot demo

        showSystemMessage('wait-for-agent', true); // Message can be customized in SDKconf -> labels
        chatbot.actions.displayChatbotActivity();
        chatbot.actions.disableInput();

        checkAgents(selectedQueue, true).then(function(result) {
            if ('agentsAvailable' in result) {
                availabilityProcessed = true;
                if (result.agentsAvailable.toString() === 'true') {
                    preStartSinchSession(data, selectedQueue, '');
                    return;
                }
                if (sinchConf.transferToDifferentQueue) {
                    iterateThroughQueue().then((availability) => {
                        if (availability === 'true') {
                            preStartSinchSession(data, '', selectedQueue);
                            return;
                        } else {
                            noAgentsAvailableProcess();
                        }
                    });
                    return;
                }
            }
            noAgentsAvailableProcess();
        });
    });

    chatbot.subscriptions.onResetSession(function(next) {
        if (conversationId !== '' && socket !== null && socket !== undefined) {
            socket.close();
        } else {
            return next();
        }
    });

    chatbot.subscriptions.onSendMessage( function(messageData, next) {
        if (directCallOfferEscalation === 'escalationOffer') {
            chatbot.actions.displayChatbotActivity();
            chatbot.actions.disableInput();
            directCallOfferEscalation = '';

            //Interval created to ensure the availability is checked before
            interval = setInterval(function() {
                if (availabilityProcessed) {
                    clearInterval(interval);
                    return next(messageData);
                }
            }, 800);
            return;
        }
        if (conversationId !== '') {
            sendUserMessage(messageData.message);
            return;
        } else {
            return next(messageData);
        }
    });

    chatbot.subscriptions.onDomReady(function(next) {
        getDataFromStorage();
        setChatbotName();
        if (conversationId !== '') {
            openSocket();
        }
    });
} // export default
