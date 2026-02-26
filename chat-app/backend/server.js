require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const setupSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Adjust for production
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

const { subscribeUser, sendPushNotification } = require('./push');
const { getSocketId } = require('./users');

setupSocket(io);

// Push API routes
app.post('/subscribe', (req, res) => {
    const { userId, subscription } = req.body;
    console.log(`Subscribing user: ${userId}`);
    subscribeUser(userId, subscription);
    res.status(201).json({ message: 'Subscribed successfully' });
});

app.post('/reply', (req, res) => {
    const { to, from, text, id } = req.body;
    console.log(`[Server] Processing reply from ${from} to ${to}. ID: ${id || 'generated'}`);
    
    const message = { 
        id: id || `srv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        from, 
        to,
        text, 
        timestamp: new Date() 
    };

    // Emit to ALL sockets in the 'to' room (recipient)
    io.to(to).emit('receive-message', message);
    
    // Also emit to the sender's own tabs for full sync (if different from recipient)
    if (to !== from) {
        io.to(from).emit('sync-message', { ...message, to }); 
    }
    
    // Always attempt push (consistent with socket.js)
    sendPushNotification(to, {
        title: `New reply from ${from}`,
        body: text,
        icon: '/favicon.ico', 
        data: { ...message, to }
    });
    
    res.status(200).json({ message: 'Reply processed' });
});

app.post('/call-response', (req, res) => {
    const { to, from, accepted } = req.body;
    const targetSocketId = getSocketId(to);
    if (targetSocketId) {
        io.to(targetSocketId).emit('call-result', { from, accepted });
    }
    res.status(200).json({ message: 'Call response processed' });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
