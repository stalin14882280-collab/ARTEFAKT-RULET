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

    // Состояние
    let localStream = null;
    let isActive = false;
    let searchInterval = null;
    let isConnected = false;
    let isPermissionGranted = false;

    // ---------- ЗАПРОС РАЗРЕШЕНИЙ ----------
    async function requestMedia() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    width: { ideal: 640 }, 
                    height: { ideal: 480 },
                    facingMode: 'user'
                },
                audio: true
            });
            return stream;
        } catch (err) {
            console.warn('Ошибка доступа к медиа:', err);
            
            let message = '❌ Нет доступа к камере или микрофону.\n';
            if (err.name === 'NotAllowedError') {
                message += 'Ты запретил доступ в браузере.\n';
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

    // ---------- ПРОВЕРКА РАЗРЕШЕНИЙ ----------
    async function checkPermissions() {
        try {
            // Проверяем, есть ли уже разрешения
            const videoPermission = await navigator.permissions.query({ name: 'camera' });
            const audioPermission = await navigator.permissions.query({ name: 'microphone' });
            
            if (videoPermission.state === 'granted' && audioPermission.state === 'granted') {
                // Разрешения уже есть — сразу запрашиваем поток
                return await requestMedia();
            }
            
            return null;
        } catch (e) {
            // Если API недоступен (старые браузеры)
            return null;
        }
    }

    // ---------- АВТОМАТИЧЕСКИЙ ЗАПРОС ПРИ ЗАГРУЗКЕ ----------
    async function autoRequestPermission() {
        try {
            // Сначала проверяем, может разрешения уже есть
            const stream = await checkPermissions();
            if (stream) {
                // Ура! Разрешения уже были
                localStream = stream;
                showSelfVideo(stream);
                isPermissionGranted = true;
                permissionOverlay.classList.add('hidden');
                startBtn.disabled = false;
                setStatus('ГОТОВ К ПОИСКУ', 'idle');
                console.log('✅ Разрешения уже были, поток получен');
                return;
            }
        } catch (e) {
            // Ничего страшного, покажем оверлей
        }
        
        // Если разрешений нет — показываем оверлей
        permissionOverlay.classList.remove('hidden');
        startBtn.disabled = true;
        console.log('⏳ Ожидаем разрешения пользователя');
    }

    // ---------- ОБРАБОТЧИК КНОПКИ "РАЗРЕШИТЬ" ----------
    async function handlePermissionGrant() {
        try {
            // Запрашиваем доступ
            const stream = await requestMedia();
            if (!stream) {
                // Пользователь отказал
                alert('❌ Без доступа к камере и микрофону видеочат не работает.');
                return;
            }

            // Успех!
            localStream = stream;
            showSelfVideo(stream);
            isPermissionGranted = true;
            permissionOverlay.classList.add('hidden');
            startBtn.disabled = false;
            setStatus('ГОТОВ К ПОИСКУ', 'idle');
            console.log('✅ Разрешения получены, поток активирован');
            
        } catch (err) {
            console.error('Ошибка при получении разрешений:', err);
            alert('❌ Что-то пошло не так. Попробуй обновить страницу.');
        }
    }

    // ---------- ОТОБРАЖЕНИЕ СВОЕГО ВИДЕО ----------
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

    // ---------- ОТОБРАЖЕНИЕ СОБЕСЕДНИКА ----------
    function showRemoteConnected() {
        remotePlaceholder.textContent = '👤 ПОДКЛЮЧЁН';
        remotePlaceholder.style.color = '#70ddc0';
        remotePlaceholder.style.textShadow = '0 0 30px #00ffbb55';
    }

    function hideRemote() {
        remotePlaceholder.textContent = '⚡ ожидание';
        remotePlaceholder.style.color = '#3f6a5e';
        remotePlaceholder.style.textShadow = 'none';
        if (remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(t => t.stop());
            remoteVideo.srcObject = null;
        }
    }

    // ---------- ОБНОВЛЕНИЕ СТАТУСА ----------
    function setStatus(text, type = 'idle') {
        statusText.textContent = text;
        statusDot.className = 'dot';
        if (type === 'active') statusDot.classList.add('active');
        else if (type === 'searching') statusDot.classList.add('searching');
    }

    // ---------- ЗАПУСК ПОИСКА ----------
    async function startSession() {
        if (isActive) return;
        if (!isPermissionGranted || !localStream) {
            alert('Сначала разреши доступ к камере и микрофону');
            return;
        }

        // Активируем состояние
        isActive = true;
        isConnected = false;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        setStatus('ПОИСК СОБЕСЕДНИКА...', 'searching');

        // Имитация поиска
        let searchTime = 1500 + Math.random() * 4000;
        let elapsed = 0;
        const step = 200;

        if (searchInterval) clearInterval(searchInterval);
        searchInterval = setInterval(() => {
            elapsed += step;
            if (elapsed >= searchTime) {
                clearInterval(searchInterval);
                searchInterval = null;
                if (isActive) {
                    isConnected = true;
                    setStatus('✅ ПОДКЛЮЧЕНО!', 'active');
                    showRemoteConnected();
                    
                    // Звук подключения
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
            } else {
                const dots = '.'.repeat(Math.floor(elapsed / 600) % 4);
                setStatus(`ПОИСК${dots}`, 'searching');
            }
        }, step);
    }

    // ---------- ОСТАНОВКА СЕССИИ ----------
    function stopSession() {
        if (!isActive) return;

        isActive = false;
        isConnected = false;

        if (searchInterval) {
            clearInterval(searchInterval);
            searchInterval = null;
        }

        hideRemote();
        setStatus('⏹ ОСТАНОВЛЕНО', 'idle');
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }

    // ---------- ПОЛНАЯ ПЕРЕЗАГРУЗКА ----------
    function fullReset() {
        stopSession();
        if (localStream) {
            localStream.getTracks().forEach(t => t.stop());
            localStream = null;
        }
        hideSelfVideo();
        hideRemote();
        isPermissionGranted = false;
        setStatus('НАЖМИТЕ «НАЧАТЬ»', 'idle');
        startBtn.disabled = true;
        stopBtn.disabled = true;
        permissionOverlay.classList.remove('hidden');
    }

    // ---------- ИНИЦИАЛИЗАЦИЯ ----------
    function init() {
        // Показываем оверлей и запрашиваем разрешения
        autoRequestPermission();

        // Обработчик кнопки "РАЗРЕШИТЬ"
        permissionBtn.addEventListener('click', handlePermissionGrant);

        // Кнопки управления
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
        });

        console.log('✦ ARTEFAKT RULET ✦');
        console.log('📷 Автоматический запрос разрешений...');
    }

    // Запускаем
    init();
})();
