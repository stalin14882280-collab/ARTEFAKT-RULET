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

    // Состояние
    let localStream = null;
    let peer = null;
    let currentCall = null;
    let isActive = false;
    let isConnected = false;
    let isPermissionGranted = false;
    let myPeerId = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT = 5;

    // ---------- КОНФИГУРАЦИЯ PEERJS ----------
    // Используем бесплатный сервер PeerJS
    // Для продакшена лучше использовать свой сервер
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

    // ---------- ПОДКЛЮЧЕНИЕ К PEERJS ----------
    function connectToPeerServer() {
        serverText.textContent = 'Подключение к серверу...';
        serverDot.className = 'status-dot';
        
        peer = new Peer(undefined, PEER_CONFIG);

        peer.on('open', (id) => {
            myPeerId = id;
            serverText.textContent = `✅ Сервер: ${id.slice(0, 8)}...`;
            serverDot.className = 'status-dot connected';
            reconnectAttempts = 0;
            console.log('✅ PeerJS подключён, ID:', id);
            
            // Обновляем счётчик (имитация)
            updateOnlineCount();
        });

        peer.on('error', (err) => {
            console.error('❌ Ошибка PeerJS:', err);
            serverText.textContent = '⚠️ Ошибка соединения';
            serverDot.className = 'status-dot';
            
            // Попытка переподключения
            if (reconnectAttempts < MAX_RECONNECT) {
                reconnectAttempts++;
                setTimeout(() => {
                    console.log(`🔄 Попытка переподключения ${reconnectAttempts}/${MAX_RECONNECT}`);
                    connectToPeerServer();
                }, 3000 * reconnectAttempts);
            }
        });

        peer.on('disconnected', () => {
            serverText.textContent = '⚠️ Сервер отключён';
            serverDot.className = 'status-dot';
            console.warn('⚠️ PeerJS отключился');
        });

        peer.on('close', () => {
            serverText.textContent = '❌ Соединение закрыто';
            serverDot.className = 'status-dot';
            console.warn('❌ PeerJS закрыт');
        });

        // Обработка входящих звонков
        peer.on('call', (call) => {
            console.log('📞 Входящий вызов от:', call.peer);
            if (isActive) {
                // Уже в разговоре — отклоняем
                call.close();
                return;
            }
            // Принимаем звонок
            acceptCall(call);
        });

        // Обновляем статус каждые 30 секунд
        setInterval(() => {
            if (peer && !peer.destroyed) {
                updateOnlineCount();
            }
        }, 30000);
    }

    // ---------- СЧЁТЧИК ОНЛАЙН (ИМИТАЦИЯ) ----------
    function updateOnlineCount() {
        // В реальном приложении здесь был бы запрос к серверу
        // Пока генерируем случайное число
        const count = Math.floor(Math.random() * 50) + 10;
        onlineCount.textContent = count;
    }

    // ---------- ЗАПРОС МЕДИА ----------
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
            console.warn('Ошибка доступа к медиа:', err);
            
            let message = '❌ Нет доступа к камере или микрофону.\n';
            if (err.name === 'NotAllowedError') {
                message += 'Нажми на 🔒 в адресной строке и разреши доступ.';
            } else if (err.name === 'NotFoundError') {
                message += 'Камера или микрофон не найдены.';
            } else {
                message += 'Ошибка: ' + err.message;
            }
            
            alert(message);
            return null;
        }
    }

    // ---------- РАЗРЕШЕНИЯ ----------
    async function handlePermissionGrant() {
        try {
            const stream = await requestMedia();
            if (!stream) return;

            localStream = stream;
            showSelfVideo(stream);
            isPermissionGranted = true;
            permissionOverlay.classList.add('hidden');
            startBtn.disabled = false;
            setStatus('ГОТОВ К ПОИСКУ', 'idle');
            
            // Подключаемся к PeerJS, если ещё не подключены
            if (!peer) {
                connectToPeerServer();
            }
            
        } catch (err) {
            console.error('Ошибка:', err);
            alert('❌ Что-то пошло не так. Попробуй обновить страницу.');
        }
    }

    // ---------- ВИДЕО ----------
    function showSelfVideo(stream) {
        selfVideo.srcObject = stream;
        selfVideo.onloadedmetadata = () => {
            selfVideo.play().catch(() => {});
        };
        selfPlaceholder.style.display = 'none';
    }

    function hideSelfVideo() {
        if (selfVideo.srcObject) {
            selfVideo.srcObject.getTracks().forEach(t => t.stop());
        }
        selfVideo.srcObject = null;
        selfPlaceholder.style.display = 'block';
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

    // ---------- СТАТУС ----------
    function setStatus(text, type = 'idle') {
        statusText.textContent = text;
        statusDot.className = 'dot';
        if (type === 'active') statusDot.classList.add('active');
        else if (type === 'searching') statusDot.classList.add('searching');
    }

    // ---------- ПОИСК СОБЕСЕДНИКА ----------
    async function findPartner() {
        if (!peer || peer.destroyed) {
            alert('❌ Нет соединения с сервером');
            return;
        }

        // Генерируем случайный ID для поиска
        // В реальном приложении здесь был бы запрос к серверу за списком свободных пользователей
        // Пока используем случайный ID
        const possibleId = generateRandomId();
        
        console.log('🔍 Ищем собеседника...');
        setStatus('ПОИСК СОБЕСЕДНИКА...', 'searching');
        
        try {
            // Пытаемся позвонить на случайный ID
            const call = peer.call(possibleId, localStream, {
                metadata: { type: 'artefakt' }
            });
            
            // Ждём ответа 5 секунд
            let answered = false;
            const timeout = setTimeout(() => {
                if (!answered) {
                    call.close();
                    // Если не ответили, пробуем другой ID
                    findPartner();
                }
            }, 5000);

            call.on('stream', (remoteStream) => {
                answered = true;
                clearTimeout(timeout);
                console.log('✅ Соединение установлено!');
                showRemoteVideo(remoteStream);
                isConnected = true;
                setStatus('✅ ПОДКЛЮЧЕНО!', 'active');
                startBtn.disabled = true;
                stopBtn.disabled = false;
                
                // Звук подключения
                playConnectionSound();
            });

            call.on('close', () => {
                console.log('🔴 Соединение закрыто');
                if (isConnected) {
                    disconnectCall();
                }
            });

            currentCall = call;

        } catch (err) {
            console.error('Ошибка при звонке:', err);
            // Пробуем снова через секунду
            setTimeout(() => {
                if (isActive) findPartner();
            }, 1000);
        }
    }

    // ---------- ПРИНЯТЬ ВХОДЯЩИЙ ЗВОНОК ----------
    function acceptCall(call) {
        if (!localStream) {
            call.close();
            return;
        }

        isActive = true;
        currentCall = call;
        
        call.answer(localStream);
        
        call.on('stream', (remoteStream) => {
            console.log('✅ Входящее соединение принято!');
            showRemoteVideo(remoteStream);
            isConnected = true;
            setStatus('✅ ПОДКЛЮЧЕНО!', 'active');
            startBtn.disabled = true;
            stopBtn.disabled = false;
            playConnectionSound();
        });

        call.on('close', () => {
            console.log('🔴 Соединение закрыто (входящее)');
            if (isConnected) {
                disconnectCall();
            }
        });
    }

    // ---------- РАЗЪЕДИНЕНИЕ ----------
    function disconnectCall() {
        if (currentCall) {
            currentCall.close();
            currentCall = null;
        }
        hideRemoteVideo();
        isConnected = false;
        isActive = false;
        setStatus('⏹ РАЗЪЕДИНЕНО', 'idle');
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }

    // ---------- ЗАПУСК СЕССИИ ----------
    async function startSession() {
        if (isActive) return;
        if (!isPermissionGranted || !localStream) {
            alert('Сначала разреши доступ к камере и микрофону');
            return;
        }
        if (!peer || peer.destroyed) {
            alert('⏳ Подключение к серверу... Подожди');
            return;
        }

        isActive = true;
        setStatus('ПОИСК...', 'searching');
        findPartner();
    }

    // ---------- ОСТАНОВКА ----------
    function stopSession() {
        if (!isActive && !isConnected) return;
        
        disconnectCall();
        hideRemoteVideo();
        setStatus('⏹ ОСТАНОВЛЕНО', 'idle');
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }

    // ---------- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ----------
    function generateRandomId() {
        // Генерируем случайный PeerJS ID (8 символов)
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        for (let i = 0; i < 8; i++) {
            id += chars[Math.floor(Math.random() * chars.length)];
        }
        return id;
    }

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

    // ---------- ИНИЦИАЛИЗАЦИЯ ----------
    function init() {
        // Показываем оверлей разрешений
        permissionOverlay.classList.remove('hidden');
        startBtn.disabled = true;
        
        // Подключаемся к PeerJS сразу
        connectToPeerServer();

        // Обработчики
        permissionBtn.addEventListener('click', handlePermissionGrant);
        startBtn.addEventListener('click', startSession);
        stopBtn.addEventListener('click', stopSession);

        // Клавиатура
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !startBtn.disabled) {
                startBtn.click();
            }
            if (e.key === 'Escape' && !stopBtn.disabled) {
                stopBtn.click();
            }
        });

        // Очистка при закрытии
        window.addEventListener('beforeunload', () => {
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
            }
            if (peer && !peer.destroyed) {
                peer.destroy();
            }
        });

        console.log('✦ ARTEFAKT RULET ✦');
        console.log('📡 Подключение к PeerJS серверу...');
    }

    // Запускаем
    init();
})();
