document.addEventListener('DOMContentLoaded', () => {
    const playBtn = document.getElementById('play-btn');
    const submitBtn = document.getElementById('submit-btn');
    const nextBtn = document.getElementById('next-btn');
    const spreadSlider = document.getElementById('spread-slider');
    const sliderValue = document.getElementById('slider-value');
    const roundInfo = document.getElementById('round-info');
    const scoreInfo = document.getElementById('score-info');
    const resultContainer = document.getElementById('result-container');
    const resultMessage = document.getElementById('result-message');
    const correctValueSpan = document.getElementById('correct-value');
    const userValueSpan = document.getElementById('user-value');
    const differenceSpan = document.getElementById('difference');
    const finalModal = document.getElementById('final-modal');
    const finalScoreSpan = document.getElementById('final-score');
    const restartBtn = document.getElementById('restart-btn');

    // Volume Control Elements
    const volumeSlider = document.getElementById('volume-slider');
    const volumeValue = document.getElementById('volume-value');

    const soundFiles = ['vocal1.mp3', 'vocal2.mp3'];
    const totalRounds = 8;

    // Generate random pan position between -1.0 (full left) and 1.0 (full right)
    function generateRandomPan() {
        // Generate values like -1.00, -0.75, -0.50, ..., 0.50, 0.75, 1.00
        return Math.round((Math.random() * 2 - 1) * 100) / 100;
    }

    let player, panner, masterVolume;
    let correctPan = 0;
    let currentSoundFile = '';
    let currentRound = 1;
    let score = 0;
    let isPlaying = false;
    let isLoading = false;
    let roundInitialized = false;

    // Initialize master volume control
    function initializeMasterVolume() {
        if (!masterVolume) {
            masterVolume = new Tone.Volume(-6);
            masterVolume.toDestination();
        }
    }

    // Volume control event handlers
    volumeSlider.addEventListener('input', () => {
        const value = parseInt(volumeSlider.value);
        volumeValue.textContent = `${value}%`;

        if (masterVolume) {
            const dbValue = value === 0 ? -60 : (value / 100) * 60 - 60;
            masterVolume.volume.value = dbValue;
        }
    });

    function stopSound() {
        if (player) {
            try {
                player.stop();
                player.dispose();
            } catch (e) {
                console.warn('Error stopping player:', e);
            }
        }
        if (panner) {
            try {
                panner.dispose();
            } catch (e) {
                console.warn('Error disposing panner:', e);
            }
        }

        player = panner = null;
        isPlaying = false;
        isLoading = false;
        playBtn.innerHTML = '<span class="btn-icon">🔊</span> Sesi Dinle';
        playBtn.disabled = false;
    }

    async function setupAndPlay() {
        if (isPlaying) {
            stopSound();
            return;
        }

        if (isLoading) return;

        isLoading = true;
        playBtn.disabled = true;
        playBtn.innerHTML = '<span class="btn-icon">⏳</span> Yükleniyor...';

        try {
            await Tone.start();
            console.log('Audio context started.');

            // Initialize round if not already done (pan and sound stay same until next round)
            if (!roundInitialized) {
                loadNewRound();
            }

            const panLabel = correctPan < -0.3 ? 'Sol' : correctPan > 0.3 ? 'Sağ' : 'Orta';
            console.log(`🎚️ Playing: sound=${currentSoundFile}, Pan=${correctPan.toFixed(2)} (${panLabel})`);

            // Create player
            player = new Tone.Player();
            await player.load(`sounds/${currentSoundFile}`);
            console.log('✅ Audio file loaded successfully.');

            // Create panner with the target pan position
            // -1 = full left, 0 = center, +1 = full right
            panner = new Tone.Panner(correctPan);

            // Initialize master volume if not already done
            initializeMasterVolume();

            // Connect: player -> panner -> masterVolume -> destination
            player.connect(panner);
            panner.connect(masterVolume);

            player.loop = true;
            player.start();

            isPlaying = true;
            playBtn.innerHTML = '<span class="btn-icon">⏹️</span> Durdur';

            console.log(`🔊 Playing with pan: ${correctPan.toFixed(2)}`);

        } catch (error) {
            console.error("❌ Error setting up or playing sound:", error);
            stopSound();
            playBtn.innerHTML = '<span class="btn-icon">❌</span> Hata Oluştu';
        } finally {
            isLoading = false;
            playBtn.disabled = false;
        }
    }

    function formatPanValue(pan) {
        if (pan < -0.1) {
            return `${pan.toFixed(2)} (Sol)`;
        } else if (pan > 0.1) {
            return `${pan.toFixed(2)} (Sağ)`;
        } else {
            return `${pan.toFixed(2)} (Orta)`;
        }
    }

    function submitGuess() {
        if (isPlaying) {
            stopSound();
        }

        const userGuess = parseFloat(spreadSlider.value);
        const difference = Math.abs(correctPan - userGuess);

        let roundScore = 0;
        let message = '';

        // Scoring based on pan difference (range is 0 to 2 max)
        if (difference < 0.1) {
            message = '🎯 Mükemmel!';
            roundScore = 100;
        } else if (difference < 0.2) {
            message = '🔥 Harika!';
            roundScore = 90;
        } else if (difference < 0.35) {
            message = '👍 İyi!';
            roundScore = Math.max(60, 85 - Math.floor(difference * 100));
        } else if (difference < 0.6) {
            message = '📈 Yaklaştın!';
            roundScore = Math.max(30, 60 - Math.floor(difference * 50));
        } else if (difference < 1.0) {
            message = '💪 Devam et!';
            roundScore = Math.max(10, 35 - Math.floor(difference * 20));
        } else {
            message = '❌ Kaçırdın!';
            roundScore = 0;
        }
        score += roundScore;

        resultMessage.textContent = message;
        correctValueSpan.textContent = formatPanValue(correctPan);
        userValueSpan.textContent = formatPanValue(userGuess);
        differenceSpan.textContent = difference.toFixed(2);

        resultContainer.classList.remove('hidden');
        submitBtn.classList.add('hidden');
        nextBtn.classList.remove('hidden');
        scoreInfo.textContent = `Puan: ${score}`;
    }

    function nextRound() {
        currentRound++;
        resultContainer.classList.add('hidden');
        nextBtn.classList.add('hidden');
        submitBtn.classList.remove('hidden');

        // Reset slider to center
        spreadSlider.value = 0;
        sliderValue.textContent = '0.00 (Orta)';

        if (currentRound > totalRounds) {
            endGame();
        } else {
            roundInfo.textContent = `Tur: ${currentRound} / ${totalRounds}`;
            // Generate new pan and sound for next round
            loadNewRound();
        }
    }

    // Generate pan position and sound file for current round
    function loadNewRound() {
        correctPan = generateRandomPan();
        currentSoundFile = soundFiles[Math.floor(Math.random() * soundFiles.length)];
        roundInitialized = true;

        const panLabel = correctPan < -0.3 ? 'Sol' : correctPan > 0.3 ? 'Sağ' : 'Orta';
        console.log(`🎧 Round ${currentRound}: Pan=${correctPan.toFixed(2)} (${panLabel}), Sound=${currentSoundFile}`);
    }

    async function endGame() {
        const maxScore = totalRounds * 100;
        const percentage = Math.round((score / maxScore) * 100);

        let message = '';
        if (percentage >= 80) {
            message = '🎉 Mükemmel kulak! Pan pozisyonlarını çok iyi duyuyorsun!';
        } else if (percentage >= 60) {
            message = '👏 İyi iş! Pratik yapmaya devam et.';
        } else {
            message = '💪 Pratik yapmaya devam! Pan algısı gelişecek.';
        }

        finalScoreSpan.textContent = `${score} / ${maxScore} (%${percentage})`;

        // Update modal message if element exists
        const finalMessageEl = document.getElementById('final-message');
        if (finalMessageEl) {
            finalMessageEl.textContent = message;
        }

        // Save score to Firebase
        try {
            const { auth } = await import('../main/js/firebase-init.js');
            const { updateUserStats } = await import('../main/js/game-stats.js');

            const user = auth.currentUser;
            if (user) {
                const result = await updateUserStats(user.uid, 'Pan Position Game', score);
                console.log('✅ Pan Position Game skoru kaydedildi:', score);

                if (result && result.achievements && result.achievements.length > 0) {
                    const achievementNames = result.achievements.map(a => a.name).join(', ');
                    alert(`🎉 Yeni başarım kazandınız: ${achievementNames}`);
                }
            }
        } catch (error) {
            console.error('❌ Skor kaydetme hatası:', error);
        }

        finalModal.classList.remove('hidden');
    }

    function restartGame() {
        currentRound = 1;
        score = 0;
        correctPan = 0;
        roundInitialized = false;

        stopSound();

        finalModal.classList.add('hidden');
        resultContainer.classList.add('hidden');
        nextBtn.classList.add('hidden');
        submitBtn.classList.remove('hidden');

        spreadSlider.value = 0;
        sliderValue.textContent = '0.00 (Orta)';
        roundInfo.textContent = `Tur: ${currentRound} / ${totalRounds}`;
        scoreInfo.textContent = 'Puan: 0';

        // Generate new pan for first round
        loadNewRound();
    }

    // Event Listeners
    playBtn.addEventListener('click', setupAndPlay);
    submitBtn.addEventListener('click', submitGuess);
    nextBtn.addEventListener('click', nextRound);
    restartBtn.addEventListener('click', restartGame);

    // Stop Audio Button
    const stopAudioBtn = document.getElementById('stop-audio');
    if (stopAudioBtn) {
        stopAudioBtn.addEventListener('click', () => {
            stopSound();
            console.log('⏹️ Audio stopped by user');
        });
    }

    // Slider value display update
    spreadSlider.addEventListener('input', () => {
        const val = parseFloat(spreadSlider.value);
        sliderValue.textContent = formatPanValue(val);
    });

    // Initial setup
    roundInfo.textContent = `Tur: ${currentRound} / ${totalRounds}`;
    scoreInfo.textContent = 'Puan: 0';
    finalModal.classList.add('hidden');
    resultContainer.classList.add('hidden');
    nextBtn.classList.add('hidden');
});