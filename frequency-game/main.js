// İşitsel EQ Oyun - Tam Arayüz ve Ses Düzeltmeli
const audioFiles = [
  '../music/test.wav',
  '../music/guitar.wav',
  '../music/piano.wav'
];
const TOTAL_ROUNDS = 10;
const FREQ_MIN = 20;
const FREQ_MAX = 20000; // Max frequency limit for professional spectrum display
const GAIN_MIN = -8; // Increased cut range for more noticeable effect
const GAIN_MAX = 8;  // Increased boost range for more noticeable effect

let currentAudioUrl = '';
let boostedFrequency = 1000;
let boostedGain = 6;
let score = 0;
let round = 1;
let isGameOver = false;
let playingPlayer = null;
let userGuess = null; // {freq, gain}
let hasGuessed = false;
let firstInteraction = false;
let eqFilter = null;
let hoverPoint = null;
let canvasEnabled = true;
let masterVolume = null; // Master volume control

// DOM Elements
const playOriginalBtn = document.getElementById('play-original');
const playEqBtn = document.getElementById('play-eq');
const eqCanvas = document.getElementById('eq-canvas');
const eqHover = document.getElementById('eq-hover');

// Volume Control Elements
const volumeSlider = document.getElementById('volume-slider');
const volumeValue = document.getElementById('volume-value');

// ===== MASTER VOLUME CONTROL =====
function initializeMasterVolume() {
  if (!masterVolume) {
    masterVolume = new Tone.Volume(-6); // Default to 80% volume (-6dB)
    masterVolume.toDestination();
  }
}

// Volume control event handlers
if (volumeSlider && volumeValue) {
  volumeSlider.addEventListener('input', () => {
    const value = parseInt(volumeSlider.value);
    volumeValue.textContent = `${value}%`;

    if (masterVolume) {
      // Convert percentage to dB: 0% = -60dB, 100% = 0dB
      const dbValue = value === 0 ? -60 : (value / 100) * 60 - 60;
      masterVolume.volume.value = dbValue;
    }
  });
}
const submitGuessBtn = document.getElementById('submit-guess');
const resultDiv = document.getElementById('result');
const scoreDiv = document.getElementById('score');
const roundDiv = document.getElementById('round');
const nextQuestionBtn = document.getElementById('next-question');
const finalModal = document.getElementById('final-modal');
const finalScore = document.getElementById('final-score');
const finalMessage = document.getElementById('final-message');
const restartBtn = document.getElementById('restart-btn');

function getRandomAudio() {
  const idx = Math.floor(Math.random() * audioFiles.length);
  return audioFiles[idx];
}
function getRandomFrequency() {
  const min = Math.log10(FREQ_MIN);
  const max = Math.log10(18500); // Keep game range reasonable, but display full spectrum
  const rand = Math.random() * (max - min) + min;
  return Math.round(Math.pow(10, rand));
}
function getRandomGain() {
  // BOOST-ONLY MODE: Always positive gain for easier frequency detection training
  // Boost range: +6 to +10 dB for clear audibility
  const gain = Math.random() * 4 + 6; // 6 to 10 dB boost
  return Math.round(gain * 10) / 10;
}

// Validate audio URL before using
function validateAudioUrl(url) {
  if (!url || typeof url !== "string" || url.trim() === "") {
    console.error("Audio URL is invalid:", url);
    return false;
  }

  // Check if file extension is valid
  const validExtensions = ['.wav', '.mp3', '.ogg', '.m4a'];
  const hasValidExtension = validExtensions.some(ext => url.toLowerCase().includes(ext));

  if (!hasValidExtension) {
    console.error("Audio URL has invalid extension:", url);
    return false;
  }

  console.log("Audio URL validated:", url);
  return true;
}

function updateScore(points) {
  score += points;
  scoreDiv.textContent = score.toString();
}
function updateRound() {
  roundDiv.textContent = `${round} / ${TOTAL_ROUNDS}`;
}
function showResult(msg, color = 'green') {
  resultDiv.textContent = msg;
  resultDiv.style.color = color;
}
function resetResult() {
  resultDiv.textContent = '';
}
function stopCurrentAudio() {
  console.log('🛑 Stopping all audio in Frequency Game...');
  if (playingPlayer) {
    try {
      if (Array.isArray(playingPlayer)) {
        // Handle blended audio (array of players)
        playingPlayer.forEach(player => {
          if (player && player.state === 'started') {
            player.stop(0);
            player.dispose();
          }
        });
        console.log('✅ Multiple players stopped and disposed');
      } else {
        // Handle single player
        if (playingPlayer.state === 'started') {
          playingPlayer.stop(0);
        }
        playingPlayer.dispose();
        console.log('✅ Single player stopped and disposed');
      }
    } catch (error) {
      console.error('❌ Error stopping audio:', error);
    }
    playingPlayer = null;
  }
  if (eqFilter) {
    try {
      eqFilter.dispose();
      console.log('✅ EQ filter disposed');
    } catch (error) {
      console.error('❌ Error disposing filter:', error);
    }
    eqFilter = null;
  }
}
function freqToX(freq, width) {
  const min = Math.log10(FREQ_MIN);
  const max = Math.log10(FREQ_MAX);
  const val = Math.log10(freq);
  return ((val - min) / (max - min)) * width;
}
function xToFreq(x, width) {
  const min = Math.log10(FREQ_MIN);
  const max = Math.log10(FREQ_MAX);
  const val = (x / width) * (max - min) + min;
  return Math.round(Math.pow(10, val));
}
function gainToY(gain, height) {
  // Map gain from GAIN_MIN to GAIN_MAX to height from bottom to top
  const normalizedGain = (gain - GAIN_MIN) / (GAIN_MAX - GAIN_MIN);
  return height - (normalizedGain * height);
}
function yToGain(y, height) {
  // Map Y position to gain value
  const normalizedY = (height - y) / height;
  let g = normalizedY * (GAIN_MAX - GAIN_MIN) + GAIN_MIN;
  return Math.max(GAIN_MIN, Math.min(GAIN_MAX, Math.round(g * 10) / 10));
}
function formatFreq(freq) {
  if (freq < 1000) return `${freq} Hz`;
  return `${(freq / 1000).toFixed(2)} kHz`;
}

// Calculate optimal Q factor based on frequency for natural sound
function getOptimalQFactor(freq) {
  if (freq < 200) {
    return 4.5; // Moderate narrow for low frequencies
  } else if (freq > 15000) {
    return 4.5; // Moderate narrow for high frequencies  
  } else {
    return 3.5; // Natural but noticeable for mids
  }
}

// Calculate loudness compensation to maintain perceived volume consistency
function calculateLoudnessCompensation(gainDb, freq) {
  // Base compensation: inverse relationship to EQ gain
  let compensation = 1.0;

  // For boosts: reduce output to prevent loudness increase
  if (gainDb > 0) {
    // More aggressive compensation for higher gains
    const boostFactor = Math.abs(gainDb) / 8; // Normalize to 0-1 range (updated for ±6dB)
    compensation = 1 - (boostFactor * 0.25); // Reduce by up to 25%
  }
  // For cuts: increase output to prevent loudness decrease  
  else if (gainDb < 0) {
    // Less aggressive compensation for cuts (they're naturally quieter)
    const cutFactor = Math.abs(gainDb) / 8; // Normalize to 0-1 range
    compensation = 1 + (cutFactor * 0.15); // Increase by up to 15%
  }

  // Frequency-dependent adjustments (psychoacoustic compensation)
  if (freq >= 1000 && freq <= 4000) {
    // Mid frequencies are most sensitive to loudness changes
    compensation *= 0.95; // Slightly reduce for mids
  } else if (freq < 100 || freq > 10000) {
    // Extreme frequencies need less compensation
    compensation *= 1.05; // Slightly increase for extremes
  }

  // Ensure compensation stays within reasonable bounds
  return Math.max(0.6, Math.min(1.4, compensation));
}

// Calculate output gain compensation based on EQ gain
function calculateOutputGainCompensation(gainDb) {
  // Inverse relationship: boost reduces output, cut increases output
  const normalized = Math.abs(gainDb) / 6; // Normalize to 0-1 for ±6dB range

  if (gainDb > 0) {
    // For boosts: reduce output gain to prevent perceived loudness increase
    return 1 - (normalized * 0.4); // Reduce by up to 40%
  } else if (gainDb < 0) {
    // For cuts: increase output gain to prevent perceived loudness decrease
    return 1 + (normalized * 0.3); // Increase by up to 30%
  }

  return 1.0; // No EQ, no compensation
}

// Real-time RMS monitoring and dynamic loudness adjustment
function monitorAndAdjustLoudness(dryMeter, wetMeter, finalGain, freq, gainDb) {
  let monitoringActive = true;
  let adjustmentCount = 0;
  const maxAdjustments = 5; // Limit adjustments to prevent instability

  const monitorInterval = setInterval(() => {
    if (!monitoringActive || adjustmentCount >= maxAdjustments) {
      clearInterval(monitorInterval);
      return;
    }

    try {
      // Get RMS values (in dB)
      const dryLevel = dryMeter.getValue();
      const wetLevel = wetMeter.getValue();

      if (dryLevel !== -Infinity && wetLevel !== -Infinity) {
        // Calculate RMS difference
        const levelDiff = wetLevel - dryLevel;

        // If wet signal is significantly louder/quieter, adjust
        if (Math.abs(levelDiff) > 1.5) { // 1.5dB threshold
          const adjustment = Math.pow(10, -levelDiff / 40); // Convert dB to gain (gentler)
          const currentGain = finalGain.gain.value;
          const newGain = Math.max(0.3, Math.min(2.0, currentGain * adjustment));

          finalGain.gain.rampTo(newGain, 0.1); // Smooth 100ms transition

          console.log(`📊 RMS Adjust: Dry=${dryLevel.toFixed(1)}dB, Wet=${wetLevel.toFixed(1)}dB, Final=${newGain.toFixed(2)}x`);
          adjustmentCount++;
        }
      }
    } catch (error) {
      console.warn('RMS monitoring error:', error);
      clearInterval(monitorInterval);
    }
  }, 200); // Check every 200ms

  // Auto-stop monitoring after 3 seconds
  setTimeout(() => {
    monitoringActive = false;
    clearInterval(monitorInterval);
  }, 3000);
}

// ==================== FREQUENCY BANDS UI ====================
// Frequency band definitions for the selector
const FREQUENCY_BANDS = [
  { label: 'Sub', min: 20, max: 60, center: 40, color: '#8b5cf6' },
  { label: 'Bass', min: 60, max: 250, center: 120, color: '#6366f1' },
  { label: 'Low Mid', min: 250, max: 500, center: 350, color: '#3b82f6' },
  { label: 'Mid', min: 500, max: 2000, center: 1000, color: '#22d3ee' },
  { label: 'High Mid', min: 2000, max: 4000, center: 3000, color: '#10b981' },
  { label: 'Presence', min: 4000, max: 8000, center: 6000, color: '#f59e0b' },
  { label: 'Brilliance', min: 8000, max: 20000, center: 12000, color: '#ef4444' }
];

// Animation state
let selectedBandIndex = null;
let hoverBandIndex = null;

// Find which band contains a frequency
function findBandForFrequency(freq) {
  for (let i = 0; i < FREQUENCY_BANDS.length; i++) {
    const band = FREQUENCY_BANDS[i];
    if (freq >= band.min && freq < band.max) return i;
  }
  return FREQUENCY_BANDS.length - 1;
}

// Draw the frequency bands selector (NEW UI)
function drawFrequencyBands({ selectedFreq, answerFreq, showAnswer, hoveredBand } = {}) {
  if (!eqCanvas) return;

  const { ctx, width: w, height: h } = setupHighDPICanvas(eqCanvas, false);
  ctx.clearRect(0, 0, w, h);

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, '#0f1419');
  bgGrad.addColorStop(1, '#1a1f2e');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  const bandCount = FREQUENCY_BANDS.length;
  const bandWidth = (w - 30) / bandCount;  // Reduced side padding
  const bandHeight = h - 100;  // More space for labels at bottom
  const startX = 15;
  const startY = 25;  // Less space at top

  const selectedBand = selectedFreq ? findBandForFrequency(selectedFreq) : null;
  const answerBand = answerFreq ? findBandForFrequency(answerFreq) : null;

  FREQUENCY_BANDS.forEach((band, i) => {
    const x = startX + i * bandWidth;
    const isHovered = hoveredBand === i;
    const isSelected = selectedBand === i;
    const isAnswer = showAnswer && answerBand === i;
    const isCorrect = showAnswer && selectedBand === answerBand && isAnswer;

    ctx.save();

    let glowIntensity = 0;
    if (isHovered && !showAnswer) glowIntensity = 0.3;
    if (isSelected) glowIntensity = 0.5;
    if (isAnswer) glowIntensity = 0.7;

    if (glowIntensity > 0) {
      ctx.shadowColor = band.color;
      ctx.shadowBlur = 20 * glowIntensity;
    }

    const bandX = x + 4;
    const bandY = startY;
    const bw = bandWidth - 8;
    const bh = bandHeight;
    const radius = 8;

    ctx.beginPath();
    ctx.roundRect(bandX, bandY, bw, bh, radius);

    if (isAnswer && showAnswer) {
      ctx.fillStyle = isCorrect ? '#10b981' : band.color;
    } else if (isSelected) {
      ctx.fillStyle = band.color;
    } else if (isHovered) {
      ctx.fillStyle = band.color + '80';
    } else {
      ctx.fillStyle = '#2a3040';
    }
    ctx.fill();

    ctx.strokeStyle = isSelected || isAnswer ? '#fff' : band.color + '60';
    ctx.lineWidth = isSelected || isAnswer ? 3 : 1;
    ctx.stroke();
    ctx.restore();

    // Band label
    ctx.save();
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isSelected || isAnswer ? '#fff' : '#9ca3af';
    ctx.fillText(band.label, bandX + bw / 2, bandY + bh + 22);

    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = isSelected || isAnswer ? band.color : '#6b7280';
    const rangeText = band.max >= 1000
      ? `${band.min >= 1000 ? (band.min / 1000) + 'k' : band.min}-${band.max / 1000}k`
      : `${band.min}-${band.max}`;
    ctx.fillText(rangeText, bandX + bw / 2, bandY + bh + 38);
    ctx.restore();

    // Indicators
    if (isSelected || (isAnswer && showAnswer)) {
      ctx.save();
      ctx.font = 'bold 24px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';

      if (isAnswer && isCorrect) {
        ctx.fillText('✓', bandX + bw / 2, bandY + bh / 2);
      } else if (isAnswer && showAnswer) {
        ctx.fillText('⬤', bandX + bw / 2, bandY + bh / 2);
      } else if (isSelected && !showAnswer) {
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.fillText('?', bandX + bw / 2, bandY + bh / 2);
      } else if (isSelected && showAnswer && !isCorrect) {
        ctx.fillText('✗', bandX + bw / 2, bandY + bh / 2);
      }
      ctx.restore();
    }
  });

  // Instructions text at top
  ctx.save();
  ctx.font = '14px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9ca3af';

  if (showAnswer) {
    const isCorrect = selectedBand === answerBand;
    ctx.fillStyle = isCorrect ? '#10b981' : '#f59e0b';
    ctx.fillText(isCorrect ? 'Doğru!' : `Doğru cevap: ${FREQUENCY_BANDS[answerBand]?.label}`, w / 2, 18);
  } else if (selectedFreq) {
    ctx.fillText(`Seçiminiz: ${FREQUENCY_BANDS[selectedBand]?.label}`, w / 2, 18);
  } else {
    ctx.fillText('Boostlanan frekans bandını seçin', w / 2, 18);
  }
  ctx.restore();
}

// EQ Bell Curve Drawing Functions
function drawEQBellCurve(ctx, centerFreq, gain, width, height, color, alpha = 0.6, qFactor = 2) {
  if (gain === 0) return; // Don't draw curves for zero gain

  const centerX = freqToX(centerFreq, width);
  const baselineY = gainToY(0, height);

  // Calculate Q-dependent width (higher Q = narrower curve)
  const curveWidth = Math.max(50, 200 / qFactor);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2.5, qFactor / 1.5); // Optimized thickness for high-DPI
  ctx.fillStyle = color;
  ctx.globalAlpha = alpha * 0.3; // More transparent fill

  // Draw the bell curve using multiple points
  ctx.beginPath();
  let firstPoint = true;

  // Sample points across the canvas width
  for (let x = 0; x <= width; x += 2) {
    const freq = xToFreq(x, width);
    const freqRatio = freq / centerFreq;

    // Gaussian-like bell curve formula
    // More accurate EQ response: gain * e^(-(log(freqRatio))^2 * Q)
    const logRatio = Math.log(freqRatio);
    const bellResponse = gain * Math.exp(-(logRatio * logRatio) * qFactor);

    const y = gainToY(bellResponse, height);

    if (firstPoint) {
      ctx.moveTo(x, baselineY);
      ctx.lineTo(x, y);
      firstPoint = false;
    } else {
      ctx.lineTo(x, y);
    }
  }

  // Complete the filled area
  ctx.lineTo(width, baselineY);
  ctx.lineTo(0, baselineY);
  ctx.closePath();

  // Fill the area under the curve
  ctx.fill();

  // Draw the curve outline
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  firstPoint = true;

  for (let x = 0; x <= width; x += 2) {
    const freq = xToFreq(x, width);
    const freqRatio = freq / centerFreq;
    const logRatio = Math.log(freqRatio);
    const bellResponse = gain * Math.exp(-(logRatio * logRatio) * qFactor);
    const y = gainToY(bellResponse, height);

    if (firstPoint) {
      ctx.moveTo(x, y);
      firstPoint = false;
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

// Canvas dimensions cache to prevent resizing on every draw
let canvasDimensions = null;

// Setup high-DPI canvas rendering with stable dimensions
function setupHighDPICanvas(canvas, forceResize = false) {
  const ctx = canvas.getContext('2d');

  // Always force proper initialization on startup or window resize
  if (forceResize || !canvasDimensions) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Ensure minimum canvas size for visibility
    const minWidth = 800;
    const minHeight = 280;
    const actualWidth = Math.max(rect.width, minWidth);
    const actualHeight = Math.max(rect.height, minHeight);

    // Set actual canvas size in memory (scaled up for high DPI)
    canvas.width = actualWidth * dpr;
    canvas.height = actualHeight * dpr;

    // Set CSS size for consistent display
    canvas.style.width = actualWidth + 'px';
    canvas.style.height = actualHeight + 'px';

    // Cache stable dimensions
    canvasDimensions = {
      width: actualWidth,
      height: actualHeight,
      dpr: dpr
    };

    // Scale the drawing context for high-DPI
    ctx.scale(dpr, dpr);

    console.log(`🎨 Canvas initialized: ${actualWidth}x${actualHeight} (DPR: ${dpr})`);
  }

  return { ctx, width: canvasDimensions.width, height: canvasDimensions.height, dpr: canvasDimensions.dpr };
}

function drawEQCanvas({ guess, answer, showAnswer, hover } = {}) {
  if (!eqCanvas) {
    console.error('❌ EQ Canvas not found!');
    return;
  }

  const { ctx, width: w, height: h, dpr } = setupHighDPICanvas(eqCanvas, false);

  // Clear canvas completely
  ctx.clearRect(0, 0, w, h);

  // Professional EQ background (solid dark color for better contrast)
  ctx.fillStyle = '#0f1419';
  ctx.fillRect(0, 0, w, h);

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, 'rgba(35, 41, 70, 0.3)');
  grad.addColorStop(1, 'rgba(24, 28, 43, 0.5)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Professional grid system (Pro-Q3 style)
  ctx.save();

  // Major frequency grid lines
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 1;

  [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(f => {
    const x = freqToX(f, w);
    if (x >= 0 && x <= w) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  });

  // Major gain grid lines
  [-8, -6, -4, -2, 0, 2, 4, 6, 8].forEach(g => {
    const y = gainToY(g, h);
    if (y >= 0 && y <= h) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  });

  // Zero line emphasis (like professional EQs)
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#22d3ee';
  ctx.lineWidth = 2;
  const zeroY = gainToY(0, h);
  ctx.beginPath();
  ctx.moveTo(0, zeroY);
  ctx.lineTo(w, zeroY);
  ctx.stroke();

  // Professional frequency labels
  ctx.globalAlpha = 0.8;
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.fillStyle = '#9ca3af';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].forEach(f => {
    const x = freqToX(f, w);
    if (x >= 25 && x <= w - 25) {
      const label = f < 1000 ? `${f}` : `${f / 1000}k`;
      ctx.fillText(label, x, h - 18);
    }
  });

  // Professional gain labels
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#22d3ee';

  [-6, -3, 0, 3, 6].forEach(g => {
    const y = gainToY(g, h);
    if (y >= 12 && y <= h - 12) {
      ctx.fillText(`${g >= 0 ? '+' : ''}${g}`, w - 8, y);
    }
  });

  ctx.restore();

  // 🎛️ LIVE EQ CURVE - Show real-time curve when hovering (before guess submission)
  if (hover && !hasGuessed && hover.gain !== 0) {
    const hoverColor = hover.gain > 0 ? '#fbbf24' : '#f87171'; // Yellow for boost, red for cut
    const hoverQ = getOptimalQFactor(hover.freq);
    drawEQBellCurve(ctx, hover.freq, hover.gain, w, h, hoverColor, 0.4, hoverQ);
  }

  // Draw EQ bell curves BEHIND the circular points (only after guess is submitted)
  if (showAnswer && hasGuessed) {
    // Draw correct answer curve (blue for boost, red for cut)
    if (answer && answer.gain !== 0) {
      const answerColor = answer.gain > 0 ? '#22d3ee' : '#ef4444';
      const answerQ = getOptimalQFactor(answer.freq);
      drawEQBellCurve(ctx, answer.freq, answer.gain, w, h, answerColor, 0.7, answerQ);
    }

    // Draw user guess curve (purple for boost, pink for cut)
    if (guess && guess.gain !== 0) {
      const guessColor = guess.gain > 0 ? '#8b5cf6' : '#e879f9';
      const guessQ = getOptimalQFactor(guess.freq);
      drawEQBellCurve(ctx, guess.freq, guess.gain, w, h, guessColor, 0.6, guessQ);
    }
  }

  // Draw guess point (purple)
  if (guess) {
    const x = freqToX(guess.freq, w);
    const y = gainToY(guess.gain, h);

    // Draw circle with high-DPI support
    ctx.save();
    ctx.shadowColor = '#7c3aed';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#7c3aed';
    ctx.stroke();
    ctx.restore();

    // Draw label with crisp text rendering
    ctx.save();
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#232946';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // Calculate label position to avoid overlapping with edges
    const labelY = y < 40 ? y + 35 : y - 25;
    ctx.fillText(`${formatFreq(guess.freq)}, ${guess.gain >= 0 ? '+' : ''}${guess.gain} dB`, x, labelY);
    ctx.restore();
  }

  // Draw answer point (cyan) - shown after submission
  if (showAnswer && answer) {
    const x = freqToX(answer.freq, w);
    const y = gainToY(answer.gain, h);

    // Draw circle with high-DPI support
    ctx.save();
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#22d3ee';
    ctx.stroke();
    ctx.restore();

    // Draw label with crisp text rendering
    ctx.save();
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.fillStyle = '#22d3ee';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#232946';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // Position label to avoid overlap with guess label
    const labelY = y < 40 ? y + 50 : y - 40;
    ctx.fillText(`${formatFreq(answer.freq)}, ${answer.gain >= 0 ? '+' : ''}${answer.gain} dB`, x, labelY);
    ctx.restore();
  }

  // Draw hover point (light blue) - only when not guessed yet
  if (hover && !hasGuessed) {
    const x = freqToX(hover.freq, w);
    const y = gainToY(hover.gain, h);
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, 2 * Math.PI);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.restore();
  }
}

async function ensureToneStarted() {
  try {
    if (Tone.context.state !== 'running') {
      await Tone.start();
      console.log('Tone.js started successfully, state:', Tone.context.state);
    }
    firstInteraction = true;
  } catch (error) {
    console.error('Failed to start Tone.js:', error);
    showResult('Ses sistemi başlatılamadı!', 'red');
    throw error;
  }
}

async function playOriginal() {
  try {
    console.log('🎵 Playing original audio...');
    await ensureToneStarted();

    // IMPORTANT: Stop any current audio BEFORE starting new one
    stopCurrentAudio();
    // Give audio system time to clean up
    await new Promise(resolve => setTimeout(resolve, 50));

    // Validate audio URL
    if (!validateAudioUrl(currentAudioUrl)) {
      showResult('Geçersiz ses dosyası!', 'red');
      return;
    }

    console.log('Loading audio:', currentAudioUrl);

    // Create player with matched volume for consistent levels
    const originalGain = new Tone.Gain(1.5); // Match with EQ audio level
    const player = new Tone.Player({
      url: currentAudioUrl,
      autostart: false,
      onload: () => {
        console.log('✅ Audio loaded successfully');
      },
      onerror: (error) => {
        console.error('❌ Audio load error:', error);
        showResult('Ses yüklenemedi!', 'red');
      }
    });

    // Create master volume node and connect properly
    initializeMasterVolume();
    originalGain.connect(masterVolume || Tone.getDestination());
    player.connect(originalGain);

    await player.load(currentAudioUrl);
    playingPlayer = player;
    player.start();
    console.log('🔊 Orijinal ses çalıyor');

    player.onstop = () => {
      if (player) player.dispose();
      if (originalGain) originalGain.dispose();
      if (playingPlayer === player) playingPlayer = null;
      console.log('🔇 Orijinal ses durdu');
    };

  } catch (error) {
    console.error('❌ Error playing original audio:', error);
    showResult('Orijinal ses çalınamadı: ' + error.message, 'red');
  }
}
async function playEqBoosted(freq, gain) {
  try {
    console.log('🎛️ Playing EQ processed audio...');
    await ensureToneStarted();

    // IMPORTANT: Stop any current audio BEFORE starting new one
    stopCurrentAudio();
    // Give audio system time to clean up
    await new Promise(resolve => setTimeout(resolve, 50));

    // Validate audio URL
    if (!validateAudioUrl(currentAudioUrl)) {
      showResult('Geçersiz ses dosyası!', 'red');
      return;
    }

    const f = freq || boostedFrequency;
    const g = gain !== undefined ? gain : boostedGain;

    console.log(`Playing EQ processed audio: ${f}Hz, ${g >= 0 ? '+' : ''}${g}dB`);

    // Advanced RMS-based loudness matching system
    const isBoost = g > 0;

    // Peaking filter preserves the full audio spectrum while modifying only the target frequency
    // No need for dry/wet mixing - use single player with EQ
    // Use gain compensation to match original audio level
    const gainCompensation = 1.0 - (Math.abs(g) / 25);  // Slight reduction for EQ boost
    const outputGain = new Tone.Gain(1.5 * gainCompensation); // Match with original

    // RMS meter for monitoring
    const meter = new Tone.Meter();

    console.log(`🎚️ EQ mode, Compensation: ${gainCompensation.toFixed(2)}x, Output: ${outputGain.gain.value.toFixed(2)}x`);

    // Peaking filter already has gain control built-in
    let eqFilter;

    // Master gain - no extra boost, match with original
    initializeMasterVolume();
    const masterGain = new Tone.Gain(1.0).connect(masterVolume);


    // Wider Q factor for more audible and musical EQ effect
    // Lower Q = wider bandwidth = easier to hear the boosted frequency
    let qFactor;
    if (f < 200) {
      qFactor = 2.5; // Wider for low frequencies
    } else if (f > 10000) {
      qFactor = 3.0; // Slightly narrower for high frequencies
    } else {
      qFactor = 2.0; // Wide for mids (musical, easy to hear)
    }

    // Surgical Peaking EQ using Tone.js's BiquadFilter wrapper
    // This is simpler and more stable than native nodes
    const peakingEQ = new Tone.BiquadFilter({
      type: 'peaking',
      frequency: f,
      Q: qFactor,
      gain: g  // Gain in dB
    });

    console.log(`🎛️ Surgical Peaking EQ: ${f}Hz, Q=${qFactor} (narrow), Gain=${g >= 0 ? '+' : ''}${g}dB`);


    // Create single audio player for peaking EQ
    const player = new Tone.Player({
      url: currentAudioUrl,
      autostart: false,
      onload: () => {
        console.log('✅ Audio loaded for peaking EQ');
      },
      onerror: (error) => {
        console.error('❌ Audio load error:', error);
        showResult('Ses yüklenemedi!', 'red');
      }
    });


    // Simple signal path: player -> peakingEQ -> meter -> outputGain -> masterGain
    player.connect(peakingEQ);
    peakingEQ.connect(meter);
    meter.connect(outputGain);
    outputGain.connect(masterGain);

    console.log(`🎛️ Tone.js peaking EQ chain: player → BiquadFilter(${f}Hz, Q=${qFactor}, ${g >= 0 ? '+' : ''}${g}dB) → output`);

    // Load player
    await player.load(currentAudioUrl);
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Dry audio loading timeout'));
      }, 20000); // Increased from 10s to 20s

      resolve();
    }).catch((error) => {
      clearTimeout(timeout);
      reject(error);
    });

    // Start player with loop
    playingPlayer = player;
    player.loop = true;
    player.start();

    console.log(`🔊 Peaking EQ audio playing: ${f}Hz (Q=${qFactor}), ${g >= 0 ? '+' : ''}${g}dB`);

    // Handle cleanup when audio stops
    const cleanupFn = () => {
      if (player) player.dispose();
      if (peakingEQ) peakingEQ.dispose();
      if (meter) meter.dispose();
      if (outputGain) outputGain.dispose();
      if (masterGain) masterGain.dispose();
      playingPlayer = null;
      console.log('🔇 Peaking EQ audio stopped');
    };

    player.onstop = cleanupFn;

  } catch (error) {
    console.error('❌ Error playing EQ processed audio:', error);
    showResult('EQ ses çalınamadı: ' + error.message, 'red');
  }
}

// Helper function to get accurate mouse coordinates
function getCanvasMousePos(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.clientWidth / canvas.offsetWidth;
  const scaleY = canvas.clientHeight / canvas.offsetHeight;

  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

// Helper function to detect which band was clicked
function getBandIndexFromClick(mouseX, canvasWidth) {
  const bandCount = FREQUENCY_BANDS.length;
  const bandWidth = (canvasWidth - 40) / bandCount;
  const startX = 20;

  for (let i = 0; i < bandCount; i++) {
    const bandX = startX + i * bandWidth;
    if (mouseX >= bandX && mouseX < bandX + bandWidth) {
      return i;
    }
  }
  return null;
}

eqCanvas.addEventListener('mousemove', (e) => {
  if (!canvasEnabled) return;
  const mousePos = getCanvasMousePos(e, eqCanvas);
  const canvasWidth = eqCanvas.clientWidth;

  const bandIndex = getBandIndexFromClick(mousePos.x, canvasWidth);
  hoverBandIndex = bandIndex;

  if (bandIndex !== null) {
    const band = FREQUENCY_BANDS[bandIndex];
    eqHover.textContent = `${band.label} (${band.min}-${band.max} Hz)`;
  } else {
    eqHover.textContent = '';
  }

  drawFrequencyBands({
    selectedFreq: userGuess?.freq,
    answerFreq: boostedFrequency,
    showAnswer: hasGuessed,
    hoveredBand: bandIndex
  });
});

eqCanvas.addEventListener('mouseleave', () => {
  if (!canvasEnabled) return;
  hoverBandIndex = null;
  eqHover.textContent = '';
  drawFrequencyBands({
    selectedFreq: userGuess?.freq,
    answerFreq: boostedFrequency,
    showAnswer: hasGuessed,
    hoveredBand: null
  });
});

eqCanvas.addEventListener('click', (e) => {
  if (!canvasEnabled || hasGuessed) return;
  ensureToneStarted();

  const mousePos = getCanvasMousePos(e, eqCanvas);
  const canvasWidth = eqCanvas.clientWidth;

  const bandIndex = getBandIndexFromClick(mousePos.x, canvasWidth);
  if (bandIndex !== null) {
    const band = FREQUENCY_BANDS[bandIndex];
    // Set user guess to the center frequency of the selected band
    userGuess = { freq: band.center, gain: boostedGain };
    selectedBandIndex = bandIndex;

    drawFrequencyBands({
      selectedFreq: userGuess.freq,
      answerFreq: boostedFrequency,
      showAnswer: false,
      hoveredBand: null
    });
  }
});

// ===== TOUCH EVENT SUPPORT FOR MOBILE =====
function getTouchPos(touch, canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = (canvas.width / (window.devicePixelRatio || 1)) / rect.width;
  const scaleY = (canvas.height / (window.devicePixelRatio || 1)) / rect.height;
  return {
    x: (touch.clientX - rect.left) * scaleX,
    y: (touch.clientY - rect.top) * scaleY
  };
}

eqCanvas.addEventListener('touchstart', (e) => {
  if (!canvasEnabled || hasGuessed) return;
  e.preventDefault(); // Prevent scrolling
  ensureToneStarted();

  const touch = e.touches[0];
  const touchPos = getTouchPos(touch, eqCanvas);
  const canvasWidth = eqCanvas.clientWidth;

  const bandIndex = getBandIndexFromClick(touchPos.x, canvasWidth);
  hoverBandIndex = bandIndex;

  if (bandIndex !== null) {
    const band = FREQUENCY_BANDS[bandIndex];
    eqHover.textContent = `${band.label} (${band.min}-${band.max} Hz)`;

    // Set user guess on touch
    userGuess = { freq: band.center, gain: boostedGain };
    selectedBandIndex = bandIndex;
  }

  drawFrequencyBands({
    selectedFreq: userGuess?.freq,
    answerFreq: boostedFrequency,
    showAnswer: hasGuessed,
    hoveredBand: bandIndex
  });
}, { passive: false });

eqCanvas.addEventListener('touchmove', (e) => {
  if (!canvasEnabled || hasGuessed) return;
  e.preventDefault(); // Prevent scrolling

  const touch = e.touches[0];
  const touchPos = getTouchPos(touch, eqCanvas);
  const canvasWidth = eqCanvas.clientWidth;

  const bandIndex = getBandIndexFromClick(touchPos.x, canvasWidth);
  hoverBandIndex = bandIndex;

  if (bandIndex !== null) {
    const band = FREQUENCY_BANDS[bandIndex];
    eqHover.textContent = `${band.label} (${band.min}-${band.max} Hz)`;

    // Update user guess as finger moves
    userGuess = { freq: band.center, gain: boostedGain };
    selectedBandIndex = bandIndex;
  }

  drawFrequencyBands({
    selectedFreq: userGuess?.freq,
    answerFreq: boostedFrequency,
    showAnswer: hasGuessed,
    hoveredBand: bandIndex
  });
}, { passive: false });

eqCanvas.addEventListener('touchend', (e) => {
  if (!canvasEnabled) return;
  hoverBandIndex = null;

  drawFrequencyBands({
    selectedFreq: userGuess?.freq,
    answerFreq: boostedFrequency,
    showAnswer: hasGuessed,
    hoveredBand: null
  });
}, { passive: true });

submitGuessBtn.addEventListener('click', () => {
  if (isGameOver || !userGuess || hasGuessed) return;

  // Stop any playing audio immediately when submitting
  stopCurrentAudio();

  hasGuessed = true;

  // BAND-BASED SCORING: Check if user selected the correct frequency band
  const userBand = findBandForFrequency(userGuess.freq);
  const answerBand = findBandForFrequency(boostedFrequency);
  const bandDiff = Math.abs(userBand - answerBand);

  let points = 0;
  let feedback = '';
  let color = 'green';

  const userBandName = FREQUENCY_BANDS[userBand]?.label;
  const answerBandName = FREQUENCY_BANDS[answerBand]?.label;

  if (bandDiff === 0) {
    points = 100;
    feedback = `🎯 Mükemmel! Doğru bant: ${answerBandName}!`;
  } else if (bandDiff === 1) {
    points = 60;
    feedback = `🔥 Yaklaştın! Seçtiğin: ${userBandName}, Doğru: ${answerBandName}`;
    color = 'orange';
  } else if (bandDiff === 2) {
    points = 30;
    feedback = `💪 Devam et! Seçtiğin: ${userBandName}, Doğru: ${answerBandName}`;
    color = 'orange';
  } else {
    points = 0;
    feedback = `❌ Kaçırdın! Seçtiğin: ${userBandName}, Doğru: ${answerBandName}`;
    color = 'red';
  }

  updateScore(points);
  showResult(feedback, color);
  stopCurrentAudio();

  drawFrequencyBands({
    selectedFreq: userGuess.freq,
    answerFreq: boostedFrequency,
    showAnswer: true,
    hoveredBand: null
  });

  nextQuestionBtn.classList.remove('hidden');
  submitGuessBtn.classList.add('hidden');
  canvasEnabled = false;
});

nextQuestionBtn.addEventListener('click', () => {
  resultDiv.classList.add('fade-out');
  eqCanvas.classList.add('fade-out');
  setTimeout(() => {
    resultDiv.classList.remove('fade-out');
    eqCanvas.classList.remove('fade-out');
    if (round >= TOTAL_ROUNDS) {
      endGame();
    } else {
      round++;
      loadNewRound();
    }
  }, 350);
});

function loadNewRound() {
  if (isGameOver) return;

  currentAudioUrl = getRandomAudio();
  boostedFrequency = getRandomFrequency();
  boostedGain = getRandomGain();

  const expectedComp = calculateLoudnessCompensation(boostedGain, boostedFrequency);
  console.log(`🎮 Round ${round}: ${boostedFrequency}Hz, ${boostedGain >= 0 ? '+' : ''}${boostedGain}dB, Expected comp: ${expectedComp.toFixed(2)}x`);

  // Validate the selected audio URL
  if (!validateAudioUrl(currentAudioUrl)) {
    console.error('❌ Invalid audio URL for round, trying another...');
    // Try again with a different file
    currentAudioUrl = audioFiles[0]; // Fallback to first file
    if (!validateAudioUrl(currentAudioUrl)) {
      showResult('Ses dosyası bulunamadı!', 'red');
      return;
    }
  }

  userGuess = null;
  hasGuessed = false;
  hoverPoint = null;
  canvasEnabled = true;
  eqHover.textContent = '';
  resetResult();
  updateRound();
  stopCurrentAudio();
  drawFrequencyBands({});
  nextQuestionBtn.classList.add('hidden');
  submitGuessBtn.classList.remove('hidden');
}

playOriginalBtn.addEventListener('click', async () => {
  await ensureToneStarted();
  playOriginal();
});
playEqBtn.addEventListener('click', async () => {
  await ensureToneStarted();
  if (userGuess && !hasGuessed) {
    playEqBoosted(userGuess.freq, userGuess.gain);
  } else {
    playEqBoosted();
  }
});

// Stop Audio Button
const stopAudioBtn = document.getElementById('stop-audio');
if (stopAudioBtn) {
  stopAudioBtn.addEventListener('click', () => {
    stopCurrentAudio();
    console.log('⏹️ Audio stopped by user');
  });
}

async function endGame() {
  isGameOver = true;
  stopCurrentAudio();
  finalScore.textContent = `${score} Puan`;
  let msg = '';
  if (score >= 800) {
    msg = '🎉 Mükemmel kulak! Harika iş!';
  } else if (score >= 500) {
    msg = '👏 Güzel deneme! Pratik yapmaya devam!';
  } else {
    msg = 'Tekrar dene! Pratik mükemmelleştirir.';
  }
  finalMessage.textContent = msg;

  // Save score to Firebase if user is logged in
  await saveScoreToFirebase();

  finalModal.classList.remove('hidden');
}

// Firebase integration for score saving with user feedback
async function saveScoreToFirebase() {
  try {
    const { auth } = await import('../main/js/firebase-init.js');
    const { updateUserStats } = await import('../main/js/game-stats.js');

    const user = auth.currentUser;
    if (!user) {
      console.log('👤 Misafir mod: Skor kaydedilmedi');
      // Add guest mode notification to final message
      const currentMessage = finalMessage.textContent;
      finalMessage.innerHTML = currentMessage +
        '<br><br><span style="color: #f59e0b;">⚠️ Misafir moddasınız. Skorunuz kaydedilmedi.</span>' +
        '<br><a href="../main/login.html" style="color: #3b82f6; text-decoration: underline;">Giriş yaparak</a> XP kazanabilirsiniz!';
      return;
    }

    // Use the centralized updateUserStats function
    const result = await updateUserStats(user.uid, 'Frequency Game', score);
    console.log('✅ Frequency Game skoru kaydedildi ve istatistikler güncellendi:', score);

    // Show user feedback about their XP gain and achievements
    if (result && result.achievements && result.achievements.length > 0) {
      const achievementNames = result.achievements.map(a => a.name).join(', ');
      alert(`🎉 Yeni başarım kazandınız: ${achievementNames}`);
    }

    // Notify other open pages about the score update
    const scoreUpdateEvent = new CustomEvent('scoreUpdated', {
      detail: {
        game: 'Frequency Game',
        score: score,
        userId: user.uid
      }
    });
    window.dispatchEvent(scoreUpdateEvent);

    // Also notify the opener window if this is in a popup
    if (window.opener) {
      window.opener.postMessage({
        type: 'scoreUpdated',
        data: {
          game: 'Frequency Game',
          score: score,
          userId: user.uid
        }
      }, '*');
    }

  } catch (error) {
    console.error('❌ Skor kaydetme hatası:', error);
  }
}

// Show dynamic score feedback to user
function showScoreFeedback(result) {
  // Update final message with XP feedback
  const currentMessage = finalMessage.textContent;
  let feedbackMessage = currentMessage + '\n\n' + result.message;

  // Add achievement notifications
  if (result.newAchievements && result.newAchievements.length > 0) {
    feedbackMessage += '\n\n🏆 Yeni Başarımlar:';
    result.newAchievements.forEach(achievement => {
      feedbackMessage += `\n${achievement.name}`;
    });
  }

  // Add total XP info
  if (result.totalScore) {
    feedbackMessage += `\n\n📈 Toplam XP: ${result.totalScore}`;
  }

  finalMessage.textContent = feedbackMessage;

  // Optional: Add a celebration effect for new records
  if (result.isNewRecord && result.improvement >= 50) {
    finalModal.style.animation = 'pulse 0.6s ease-in-out';
    setTimeout(() => {
      finalModal.style.animation = '';
    }, 600);
  }
}



restartBtn.addEventListener('click', () => {
  score = 0;
  round = 1;
  isGameOver = false;
  userGuess = null;
  hasGuessed = false;
  hoverPoint = null;
  scoreDiv.textContent = '0';
  finalModal.classList.add('hidden');
  drawFrequencyBands({});
  loadNewRound();
  canvasEnabled = true;
});

// Handle window resize to maintain canvas quality
window.addEventListener('resize', () => {
  if (!isGameOver) {
    // Reset canvas dimensions cache and force resize
    canvasDimensions = null;
    drawEQCanvas({ guess: userGuess, answer: { freq: boostedFrequency, gain: boostedGain }, showAnswer: hasGuessed, hover: hoverPoint });
  }
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('🎮 Frequency Game initializing...');

  score = 0;
  round = 1;
  isGameOver = false;
  userGuess = null;
  hasGuessed = false;
  hoverPoint = null;
  canvasEnabled = true;

  // Update UI
  if (scoreDiv) scoreDiv.textContent = '0';
  if (finalModal) finalModal.classList.add('hidden');

  // Show game content and hide loading
  const gameContent = document.getElementById('game-content');
  const loading = document.getElementById('loading');
  if (gameContent) gameContent.style.display = 'block';
  if (loading) loading.style.display = 'none';

  // Initialize canvas with forced reset and professional spectrum
  if (eqCanvas) {
    // Force canvas visibility and size
    eqCanvas.style.display = 'block';
    eqCanvas.style.width = '100%';
    eqCanvas.style.height = '280px';

    // Initialize with force resize
    setupHighDPICanvas(eqCanvas, true);

    // Draw initial professional spectrum
    drawFrequencyBands({});

    console.log('✅ EQ Canvas initialized with professional spectrum display');
    console.log(`📐 Canvas dimensions: ${eqCanvas.clientWidth}x${eqCanvas.clientHeight}`);
  } else {
    console.error('❌ EQ Canvas not found!');
  }

  loadNewRound();
  console.log('✅ Frequency Game ready with stable spectrum display');
});