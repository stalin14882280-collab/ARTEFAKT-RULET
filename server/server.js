const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Хранилище
const onlineUsers = new Map();
const waitingUsers = [];

// ============ SOCKET.IO ============
io.on('connection', (socket) => {
    console.log(`🟢 Новое подключение: ${socket.id}`);

    socket.on('register', (peerId) => {
        console.log(`📝 Регистрация: ${peerId}`);
        onlineUsers.set(peerId, socket.id);
        socket.data.peerId = peerId;
        
        io.emit('online-count', onlineUsers.size);
        socket.emit('registered', { 
            peerId, 
            online: onlineUsers.size 
        });
    });

    socket.on('find-partner', () => {
        const peerId = socket.data.peerId;
        console.log(`🔍 ${peerId} ищет собеседника`);
        
        if (waitingUsers.length > 0) {
            const partnerSocketId = waitingUsers.shift();
            const partnerPeerId = io.sockets.sockets.get(partnerSocketId)?.data?.peerId;
            
            if (partnerPeerId) {
                console.log(`✅ Соединяем ${peerId} с ${partnerPeerId}`);
                
                // Отправляем обоим ID друг друга
                io.to(socket.id).emit('partner-found', { partnerId: partnerPeerId });
                io.to(partnerSocketId).emit('partner-found', { partnerId: peerId });
                return;
            }
        }
        
        waitingUsers.push(socket.id);
        socket.emit('waiting', { message: 'Ожидание собеседника...' });
        console.log(`⏳ ${peerId} добавлен в очередь (${waitingUsers.length})`);
    });

    socket.on('cancel-search', () => {
        const index = waitingUsers.indexOf(socket.id);
        if (index !== -1) {
            waitingUsers.splice(index, 1);
            console.log(`❌ Поиск отменён: ${socket.data.peerId}`);
        }
    });

    // ============ WEBRTC СИГНАЛИНГ ============
    socket.on('webRTC-offer', (data) => {
        const from = socket.data.peerId;
        const targetSocketId = onlineUsers.get(data.to);
        if (targetSocketId) {
            console.log(`📤 Пересылка OFFER от ${from} к ${data.to}`);
            io.to(targetSocketId).emit('webRTC-offer', {
                from: from,
                offer: data.offer
            });
        }
    });

    socket.on('webRTC-answer', (data) => {
        const from = socket.data.peerId;
        const targetSocketId = onlineUsers.get(data.to);
        if (targetSocketId) {
            console.log(`📤 Пересылка ANSWER от ${from} к ${data.to}`);
            io.to(targetSocketId).emit('webRTC-answer', {
                from: from,
                answer: data.answer
            });
        }
    });

    socket.on('webRTC-candidate', (data) => {
        const from = socket.data.peerId;
        const targetSocketId = onlineUsers.get(data.to);
        if (targetSocketId) {
            console.log(`📤 Пересылка CANDIDATE от ${from} к ${data.to}`);
            io.to(targetSocketId).emit('webRTC-candidate', {
                from: from,
                candidate: data.candidate
            });
        }
    });

    socket.on('end-call', (data) => {
        const from = socket.data.peerId;
        const targetSocketId = onlineUsers.get(data.to);
        if (targetSocketId) {
            console.log(`📞 ${from} завершил разговор с ${data.to}`);
            io.to(targetSocketId).emit('partner-disconnected', {
                from: from
            });
        }
    });

    // ============ ЧАТ ============
    socket.on('chat-message', (data) => {
        const from = socket.data.peerId;
        const targetSocketId = onlineUsers.get(data.to);
        if (targetSocketId) {
            console.log(`💬 ${from} -> ${data.to}: "${data.text}"`);
            io.to(targetSocketId).emit('chat-message', {
                from: from,
                text: data.text,
                time: data.time
            });
        }
    });

    socket.on('disconnect', () => {
        const peerId = socket.data.peerId;
        if (peerId) {
            onlineUsers.delete(peerId);
            console.log(`🔴 ${peerId} отключился`);
            io.emit('online-count', onlineUsers.size);
        }
        
        const index = waitingUsers.indexOf(socket.id);
        if (index !== -1) {
            waitingUsers.splice(index, 1);
        }
    });
});

// ============ HTTP ENDPOINTS ============
app.get('/online', (req, res) => {
    res.json({ online: onlineUsers.size });
});

app.get('/users', (req, res) => {
    res.json({ 
        online: onlineUsers.size,
        users: Array.from(onlineUsers.keys()),
        waiting: waitingUsers.length 
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
    console.log(`📡 Socket.IO готов к подключениям`);
    console.log(`🎥 WebRTC сигналинг активен`);
});
