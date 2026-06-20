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

    // Состояние
    let localStream = null;
    let isActive = false;
    let searchInterval = null;
    let isConnected = false;

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
            
            // Проверяем, какая именно ошибка
            let message = '❌ Нет доступа к камере или микрофону.\n';
            if (err.name === 'NotAllowedError') {
                message += 'Ты запретил доступ в браузере. Разреши и обнови страницу.';
            } else if (err.name === 'NotFoundError') {
                message += 'Камера или микрофон не найдены.';
            } else {
                message += 'Ошибка: ' + err.message;
            }
            
            alert(message);
            return null;
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
        // Можно добавить анимацию или эффект
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

        // 1. Запрашиваем медиа
        if (!localStream) {
            const stream = await requestMedia();
            if (!stream) return;
            localStream = stream;
            showSelfVideo(stream);
        }

        // 2. Активируем состояние
        isActive = true;
        isConnected = false;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        setStatus('ПОИСК СОБЕСЕДНИКА...', 'searching');

        // 3. Имитация поиска
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
                    
                    // Можно добавить звуковой эффект
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

        // Не останавливаем локальный поток, чтобы при повторном старте
        // не запрашивать разрешения снова
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
        setStatus('ГОТОВ', 'idle');
        startBtn.disabled = false;
        stopBtn.disabled = true;
    }

    // ---------- ИНИЦИАЛИЗАЦИЯ ----------
    function init() {
        setStatus('НАЖМИТЕ «НАЧАТЬ»', 'idle');

        startBtn.addEventListener('click', startSession);
        stopBtn.addEventListener('click', stopSession);

        // Очистка при закрытии страницы
        window.addEventListener('beforeunload', () => {
            if (localStream) {
                localStream.getTracks().forEach(t => t.stop());
            }
        });

        // Клавиатурные сокращения
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !startBtn.disabled) {
                startBtn.click();
            }
            if (e.key === 'Escape' && !stopBtn.disabled) {
                stopBtn.click();
            }
        });

        console.log('✦ ARTEFAKT RULET ✦ готов к работе!');
        console.log('Нажми НАЧАТЬ для поиска собеседника.');
    }

    // Запускаем
    init();
})();
