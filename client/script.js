(function() {
    "use strict";

    // DOM элементы
    const selfVideo = document.getElementById('selfVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const selfPlaceholder = document.getElementById('selfPlaceholder');
    const remotePlaceholder = document.getElementById('remotePlaceholder');
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const permissionOverlay = document.getElementById('permissionOverlay');
    const permissionBtn = document.getElementById('permissionBtn');
    const serverStatus = document.getElementById('serverStatus');
    const serverDot = document.getElementById('serverDot');
    const serverText = document.getElementById('serverText');
    const onlineCount = document.getElementById('onlineCount');
    const partnerIdElement = document.getElementById('partnerId');

    // Состояние
    let localStream = null;
    let peer = null;
    let socket = null;
    let currentCall = null;
    let isActive = false;
    let isConnected = false;
    let isPermissionGranted = false;
    let myPeerId = null;
    let isSearching = false;
    let searchTimeout = null;
    const SEARCH_TIMEOUT = 7000; // 7 секунд

    // ============ КОНФИГУРАЦИЯ ============
    // 🔥 ДЛЯ ПРОДАКШЕНА НА RENDER:
    const SERVER_URL = 'https://artefakt-rulet-server.onrender.com';
    
    // 🔥 ДЛЯ ЛОКАЛЬНОЙ РАЗРАБОТКИ (закомментируй строку выше и раскомментируй эту):
    // const SERVER_URL = 'http://localhost:3000';

    const PEER_CONFIG = {
        host: '0.peerjs.com',
        port: 443,
        path: '/',
        secure: true,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                {
                    urls: 'turn:relay1.expressturn.com:3478',
                    username: 'efZRVVVFCWXWUOQCUJ',
                    credential: 'sZ6BVVUYSXJEVNKY'
                }
            ]
        }
    };

    // ============ ПОДКЛЮЧЕНИЕ К SOCKET.IO ============
    function connectToServer() {
        serverText.textContent = 'Подключение к серверу...';
        serverDot.className = 'status-dot';
        
        socket = io(SERVER_URL, {
            transports: ['websocket', 'polling']
        });

        socket.on('connect', () => {
            console.log('✅ Socket.IO подключён');
            serverText.textContent = '✅ Сервер подключён';
            serverDot.className = 'status-dot connected';
            
            if (myPeerId) {
                socket.emit('register', myPeerId);
            }
        });

        socket.on('connect_error', (err) => {
            console.error('❌ Ошибка подключения к серверу:', err);
            serverText.textContent = '⚠️ Ошибка подключения';
            serverDot.className = 'status-dot';
        });

        socket.on('online-count', (count) => {
            onlineCount.textContent = count;
        });

        socket.on('registered', (data) => {
            console.log('✅ Зарегистрирован на сервере:', data);
            onlineCount.textContent = data.online;
        });

        socket.on('waiting', (data) => {
            console.log('⏳ Ожидание собеседника...');
            setStatus('⏳ ОЖИДАНИЕ...', 'searching');
        });

        socket.on('partner-found', (data) => {
            console.log('🎯 Найден собеседник:', data.partnerId);
            
            // Очищаем таймаут поиска
            if (searchTimeout) {
                clearTimeout(searchTimeout);
                searchTimeout = null;
            }
            
            callPartner(data.partnerId);
        });

        socket.on('disconnect', () => {
            console.warn('⚠️ Сервер отключился');
            serverText.textContent = '⚠️ Сервер отключён';
            serverDot.className = 'status-dot';
        });
    }

    // ============ PEERJS ============
    function connectToPeerServer() {
        peer = new Peer(undefined, PEER_CONFIG);

        peer.on('open', (id) => {
            myPeerId = id;
            console.log('✅ PeerJS подключён, ID:', id);
            
            if (socket && socket.connected) {
                socket.emit('register', id);
            }
        });

        peer.on('error', (err) => {
            console.error('❌ Ошибка PeerJS:', err);
        });

        peer.on('call', (call) => {
            console.log('📞 Входящий вызов от:', call.peer);
            if (isConnected) {
                call.close();
                return;
            }
            acceptCall(call);
        });
    }

    // ============ ЗВОНОК ПАРТНЁРУ ============
    function callPartner(partnerId) {
        if (!localStream) {
            console.error('❌ Нет локального потока');
            return;
        }

        console.log(`📞 Звоним ${partnerId}...`);
        setStatus('📞 СОЕДИНЕНИЕ...', 'searching');
        
        const call = peer.call(partnerId, localStream);
        currentCall = call;

        call.on('stream', (remoteStream) => {
            console.log('✅ Стрим получен от:', partnerId);
            showRemoteVideo(remoteStream);
            isConnected = true;
            isSearching = false;
            setStatus('✅ ПОДКЛЮЧЕНО!', 'active');
            startBtn.disabled = true;
            stopBtn.disabled = false;
            partnerIdElement.textContent = partnerId;
            partnerIdElement.className = 'id connected';
            playConnectionSound();
        });

        call.on('close', () => {
            console.log('🔴 Звонок закрыт');
            if (isConnected) {
                disconnectCall();
            }
        });
    }

    // ============ ПРИНЯТЬ ЗВОНОК ============
    function acceptCall(call) {
        if (!localStream) {
            call.close();
            return;
        }

        isActive = true;
        currentCall = call;
        
        call.answer(localStream);
        partnerIdElement.textContent = call.peer;
        partnerIdElement.className = 'id connected';

        call.on('stream', (remoteStream) => {
            console.log('✅ Входящий стрим от:', call.peer);
            showRemoteVideo(remoteStream);
            isConnected = true;
            isSearching = false;
            setStatus('✅ ПОДКЛЮЧЕНО!', 'active');
            startBtn.disabled = true;
            stopBtn.disabled = false;
            playConnectionSound();
        });

        call.on('close', () => {
            console.log('🔴 Входящий звонок закрыт');
            if (isConnected) {
                disconnectCall();
            }
        });
    }

    // ============ ПОИСК СОБЕСЕДНИКА ============
    function findPartner() {
        if (!socket || !socket.connected) {
            alert('❌ Нет подключения к серверу');
            return;
        }
        if (isSearching) return;
        
        isSearching = true;
        isActive = true;
        setStatus('🔍 ПОИСК... 7с', 'searching');
        
        // Очищаем предыдущий таймаут
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        
        // Запускаем таймаут на 7 секунд
        searchTimeout = setTimeout(() => {
            if (isSearching) {
                // Поиск не удался
                isSearching = false;
                isActive = false;
                setStatus('⏱️ ВРЕМЯ ВЫШЛО', 'idle');
                startBtn.disabled = false;
                stopBtn.disabled = true;
                
                if (socket && socket.connected) {
                    socket.emit('cancel-search');
                }
                
                showNotification('⏱️ Собеседник не найден', 'Повторите попытку через несколько секунд');
                playFailSound();
                
                if (navigator.vibrate) {
                    navigator.vibrate([200, 100, 200]);
                }
            }
        }, SEARCH_TIMEOUT);
        
        socket.emit('find-partner');
    }

    // ============ РАЗЪЕДИНЕНИЕ ============
    function disconnectCall() {
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        
        hideRemoteVideo();
        isConnected = false;
        isActive = false;
        isSearching = false;
        setStatus('⏹ РАЗЪЕДИНЕНО', 'idle');
        startBtn.disabled = false;
        stopBtn.disabled = true;
        partnerIdElement.textContent = '—';
        partnerIdElement.className = 'id';
        
        if (socket && socket.connected) {
            socket.emit('end-call');
        }
    }

    // ============ ЗАПУСК СЕССИИ ============
    async function startSession() {
        if (isActive || isSearching) return;
        if (!isPermissionGranted || !localStream) {
            alert('Сначала разреши доступ к камере и микрофону');
            return;
        }
        if (!peer || peer.destroyed) {
            alert('⏳ Подключение к PeerJS... Подожди');
            return;
        }
        if (!socket || !socket.connected) {
            alert('⏳ Подключение к серверу... Подожди');
            return;
        }

        findPartner();
    }

    // ============ ОСТАНОВКА ============
    function stopSession() {
        if (!isActive && !isConnected) return;
        
        if (searchTimeout) {
            clearTimeout(searchTimeout);
            searchTimeout = null;
        }
        
        document.querySelectorAll('.notification').forEach(el => el.remove());
        
        if (isSearching) {
            isSearching = false;
            if (socket && socket.connected) {
                socket.emit('cancel-search');
            }
            setStatus('⏹ ОСТАНОВЛЕНО', 'idle');
            startBtn.disabled = false;
            stopBtn.disabled = true;
            return;
        }
        
        disconnectCall();
    }

    // ============ ВИДЕО ============
    function showSelfVideo(stream) {
        selfVideo.srcObject = stream;
        selfVideo.onloadedmetadata = () => {
            selfVideo.play().catch(() => {});
        };
        selfPlaceholder.style.display = 'none';
    }

    function showRemoteVideo(stream) {
        remoteVideo.srcObject = stream;
        remoteVideo.onloadedmetadata = () => {
            remoteVideo.play().catch(() => {});
        };
        remotePlaceholder.style.display = 'none';
    }

    function hideRemoteVideo() {
        if (remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(t => t.stop());
        }
        remoteVideo.srcObject = null;
        remotePlaceholder.style.display = 'block';
        remotePlaceholder.textContent = '⚡ ожидание';
        remotePlaceholder.style.color = '#3f6a5e';
        remotePlaceholder.style.textShadow = 'none';
    }

    // ============ СТАТУС ============
    function setStatus(text, type = 'idle') {
        statusText.textContent = text;
        statusDot.className = 'dot';
        if (type === 'active') statusDot.classList.add('active');
        else if (type === 'searching') statusDot.classList.add('searching');
    }

    // ============ ЗВУКИ ============
    function playConnectionSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.frequency.value = 880;
            oscillator.type = 'sine';
            gainNode.gain.value = 0.1;
            oscillator.start();
            setTimeout(() => oscillator.stop(), 200);
        } catch (e) {}
    }

    function playFailSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.frequency.value = 400;
            oscillator.type = 'sawtooth';
            gainNode.gain.value = 0.05;
            oscillator.start();
            setTimeout(() => oscillator.stop(), 300);
        } catch (e) {}
    }

    // ============ УВЕДОМЛЕНИЯ ============
    function showNotification(title, message) {
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.innerHTML = `
            <div class="notification-icon">⏱️</div>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">✕</button>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);
        
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        });
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.classList.remove('show');
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
    }

    // ============ РАЗРЕШЕНИЯ ============
    async function requestMedia() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            return stream;
        } catch (err) {
            console.warn('Ошибка доступа к медиа:',
