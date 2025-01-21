const WebSocket = require('ws');
const http = require('http');

// Create HTTP server
const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('pong');
        console.log('Ping? Pong!');
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    }
});

const wss = new WebSocket.Server({ server });

let timers = {}; // Stores timer durations
let timerStartTimes = {}; // Stores when each timer was started
let disabledButtons = {}; // Tracks disabled state for buttons
let timerInfo = {}; // Stores persistent info, like completion time

// Calculate remaining time for each timer
function getCurrentTimers() {
    const currentTimers = {};
    const now = Date.now();
    for (const monsterId in timers) {
        const elapsed = Math.floor((now - timerStartTimes[monsterId]) / 1000);
        currentTimers[monsterId] = Math.max(timers[monsterId] - elapsed, 0);
    }
    return currentTimers;
}

// Broadcast a message to all connected clients
function broadcast(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

// Handle timer expiration
function handleTimerCompletion(monsterId) {
    const endTime = new Date().toLocaleTimeString();
    timerInfo[monsterId] = `The timer ended on ${endTime}`;
    disabledButtons[monsterId] = false;

    // Broadcast the timer completion to all clients
    broadcast({
        type: 'updateInfo',
        monsterId: monsterId,
        info: timerInfo[monsterId],
    });
}

wss.on('connection', (ws) => {
    console.log('New WebSocket connection');

    // Sync timers to the new client
    const currentTimers = getCurrentTimers();
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(
            JSON.stringify({
                type: 'sync',
                timers: currentTimers,
                timerInfo,
                disabledButtons,
            })
        );
    }

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            console.log('Received message:', parsedMessage);

            switch (parsedMessage.type) {
                case 'start':
                    timers[parsedMessage.monsterId] = parsedMessage.duration;
                    timerStartTimes[parsedMessage.monsterId] = Date.now();
                    disabledButtons[parsedMessage.monsterId] = true;

                    broadcast({
                        type: 'start',
                        monsterId: parsedMessage.monsterId,
                        duration: parsedMessage.duration,
                    });

                    // Schedule timer expiration
                    setTimeout(() => {
                        if (timers[parsedMessage.monsterId]) {
                            handleTimerCompletion(parsedMessage.monsterId);
                            delete timers[parsedMessage.monsterId];
                            delete timerStartTimes[parsedMessage.monsterId];
                        }
                    }, parsedMessage.duration * 1000);
                    break;

                case 'reset':
                    delete timers[parsedMessage.monsterId];
                    delete timerStartTimes[parsedMessage.monsterId];
                    disabledButtons[parsedMessage.monsterId] = false;

                    broadcast({ type: 'reset', monsterId: parsedMessage.monsterId });
                    break;

                case 'clear':
                    delete timerInfo[parsedMessage.monsterId];
                    broadcast({ type: 'clear', monsterId: parsedMessage.monsterId });
                    break;

                default:
                    console.error('Unknown message type:', parsedMessage.type);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});