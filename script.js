(() => {
  const root = document.documentElement;
  const body = document.body;
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // DOM 元素
  const themeColorMeta = document.getElementById('theme-color-meta');
  const noiseCanvas = document.getElementById('noise-canvas');
  const noiseCtx = noiseCanvas.getContext('2d');
  const flashOverlay = document.getElementById('flash-overlay');
  const flashlight = document.getElementById('flashlight');
  const navCta = document.getElementById('nav-cta');
  const logoText = document.getElementById('logo-text');
  const navLinks = document.querySelectorAll('.nav-links a');
  const deviceStatusText = document.getElementById('device-status-text');
  const liveDeviceEl = document.getElementById('live-device');
  const liveTimeEl = document.getElementById('live-time');
  const liveScreenEl = document.getElementById('live-screen');
  const liveDistanceEl = document.getElementById('live-distance');
  const liveWarningEl = document.getElementById('live-warning');
  const escapeBtn = document.getElementById('escape-btn');
  const restartBtn = document.getElementById('restart-btn');
  const pupilGroup = document.getElementById('pupil-group');
  const audioToggleBtn = document.getElementById('audio-toggle');
  const demoAudioBtn = document.getElementById('demo-audio-btn');

  let scrollProgress = 0;
  let climaxTriggered = false;
  let escapeCount = 0;
  let lastPointerTime = 0;

  // 安全调用手机震动（Android 支持，iOS/桌面自动忽略）
  function vibrate(pattern) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (_) {}
    }
  }

  // ==================== 1. 动态遥测信息（识别手机/电脑，打破第四面墙） ====================
  function detectDeviceInfo() {
    const ua = navigator.userAgent;
    let label = '桌面终端 (主屏正前方)';
    if (/iPhone/i.test(ua)) label = 'iPhone 移动终端 (近距离握持中)';
    else if (/iPad/i.test(ua)) label = 'iPad 平板终端 (近距离凝视中)';
    else if (/Android/i.test(ua)) label = 'Android 移动终端 (近距离握持中)';
    else if (isTouchDevice) label = '移动触控终端 (近距离握持中)';

    if (liveDeviceEl) liveDeviceEl.textContent = label;
    if (isTouchDevice) {
      if (liveDistanceEl) liveDistanceEl.textContent = '距离面部 0.3 米 · 床边有微弱呼吸声';
      if (liveWarningEl) liveWarningEl.textContent = '不要突然抬头看天花板，也不要把手机扣过去。';
    }
  }
  detectDeviceInfo();

  function updateTelemetry() {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    if (liveTimeEl) liveTimeEl.textContent = `${hh}:${mm}:${ss}`;
    if (liveScreenEl) liveScreenEl.textContent = `${window.innerWidth} x ${window.innerHeight}`;
  }
  updateTelemetry();
  setInterval(updateTelemetry, 1000);

  // ==================== 2. Canvas 胶片噪点渲染（移动端限帧防发热） ====================
  function resizeNoise() {
    const scale = isTouchDevice ? 5 : 3;
    noiseCanvas.width = Math.max(80, Math.floor(window.innerWidth / scale));
    noiseCanvas.height = Math.max(80, Math.floor(window.innerHeight / scale));
  }
  resizeNoise();
  window.addEventListener('resize', resizeNoise);

  let lastNoiseFrame = 0;
  function renderNoise(ts) {
    const frameInterval = isTouchDevice ? 70 : 40; // 约 14~25fps，像真实胶片且省电
    if (scrollProgress > 0.22 && ts - lastNoiseFrame >= frameInterval) {
      lastNoiseFrame = ts;
      const w = noiseCanvas.width;
      const h = noiseCanvas.height;
      const imgData = noiseCtx.createImageData(w, h);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = Math.random() * 255;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
        data[i + 3] = 255;
      }
      noiseCtx.putImageData(imgData, 0, 0);
    }
    requestAnimationFrame(renderNoise);
  }
  requestAnimationFrame(renderNoise);

  // ==================== 3. Web Audio API 渐进式恐怖音效 ====================
  let audioCtx = null;
  let masterGain = null;
  let droneOsc1 = null;
  let droneOsc2 = null;
  let droneGain = null;
  let audioEnabled = false;

  function initAudio() {
    if (audioCtx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioCtx = new AudioContextClass();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.28;
    masterGain.connect(audioCtx.destination);

    // 低频恐怖持续音 (Drone)
    droneGain = audioCtx.createGain();
    droneGain.gain.value = 0.001;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 180;

    droneOsc1 = audioCtx.createOscillator();
    droneOsc1.type = 'sawtooth';
    droneOsc1.frequency.value = 46;

    droneOsc2 = audioCtx.createOscillator();
    droneOsc2.type = 'triangle';
    droneOsc2.frequency.value = 48.5;

    droneOsc1.connect(filter);
    droneOsc2.connect(filter);
    filter.connect(droneGain);
    droneGain.connect(masterGain);

    droneOsc1.start();
    droneOsc2.start();

    // 心跳定时器（同时配合移动端轻微震动）
    setInterval(() => {
      if (scrollProgress < 0.58) return;
      if (audioEnabled) playHeartbeat(scrollProgress);
      if (isTouchDevice && scrollProgress > 0.72) {
        vibrate([25, 110, 20]);
      }
    }, 1150);
  }

  function playHeartbeat(intensity) {
    if (!audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime;
    const vol = Math.min(0.45, (intensity - 0.52) * 0.95);

    [0, 0.22].forEach((offset, idx) => {
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(idx === 0 ? 64 : 52, now + offset);
      osc.frequency.exponentialRampToValueAtTime(28, now + offset + 0.16);

      g.gain.setValueAtTime(0.001, now + offset);
      g.gain.linearRampToValueAtTime(vol, now + offset + 0.03);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2);

      osc.connect(g);
      g.connect(masterGain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.22);
    });
  }

  function playStinger() {
    if (!audioEnabled || !audioCtx || audioCtx.state !== 'running') return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(36, now + 0.65);

    g.gain.setValueAtTime(0.36, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.74);
  }

  function updateAudioButtonUI() {
    const shortLabel = window.innerWidth <= 420;
    audioToggleBtn.classList.toggle('active', audioEnabled);
    audioToggleBtn.querySelector('.audio-icon').textContent = audioEnabled ? '🔊' : '🔇';
    audioToggleBtn.querySelector('.audio-label').textContent = audioEnabled
      ? (shortLabel ? '已开' : '音效已开')
      : (shortLabel ? '音效' : '沉浸音效');
  }
  window.addEventListener('resize', updateAudioButtonUI);
  updateAudioButtonUI();

  function toggleAudio() {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    audioEnabled = !audioEnabled;
    if (masterGain) {
      masterGain.gain.setTargetAtTime(audioEnabled ? 0.28 : 0.0, audioCtx.currentTime, 0.1);
    }
    updateAudioButtonUI();
    updateAudioByScroll(scrollProgress);
  }

  function updateAudioByScroll(p) {
    if (!audioEnabled || !audioCtx || !droneGain) return;
    const now = audioCtx.currentTime;
    const targetVol = p < 0.16 ? 0.005 : Math.min(0.42, (p - 0.14) * 0.52);
    droneGain.gain.setTargetAtTime(targetVol, now, 0.15);
    droneOsc2.frequency.setTargetAtTime(48.5 + p * 6.5, now, 0.2);
  }

  audioToggleBtn.addEventListener('click', toggleAudio);
  demoAudioBtn.addEventListener('click', () => {
    if (!audioEnabled) toggleAudio();
    demoAudioBtn.textContent = '▶ 正在播放环境音...';
  });

  // ==================== 4. 滚动进度主引擎 ====================
  function lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  function toHex(n) {
    return n.toString(16).padStart(2, '0');
  }

  function onScroll() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    scrollProgress = maxScroll > 0 ? Math.max(0, Math.min(1, window.scrollY / maxScroll)) : 0;

    // 背景色从浅米白 (250,251,252) 平滑过渡到深渊黑 (6,5,7)
    const darkT = Math.min(1, Math.max(0, (scrollProgress - 0.12) / 0.45));
    const bgR = Math.round(lerp(250, 6, darkT));
    const bgG = Math.round(lerp(251, 5, darkT));
    const bgB = Math.round(lerp(252, 7, darkT));

    const txtR = Math.round(lerp(24, 228, darkT));
    const txtG = Math.round(lerp(32, 228, darkT));
    const txtB = Math.round(lerp(44, 232, darkT));

    root.style.setProperty('--horror', scrollProgress.toFixed(3));
    root.style.setProperty('--bg-r', bgR);
    root.style.setProperty('--bg-g', bgG);
    root.style.setProperty('--bg-b', bgB);
    root.style.setProperty('--text-r', txtR);
    root.style.setProperty('--text-g', txtG);
    root.style.setProperty('--text-b', txtB);

    // 同步手机浏览器状态栏/地址栏颜色！
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', `#${toHex(bgR)}${toHex(bgG)}${toHex(bgB)}`);
    }

    const cardAlpha = lerp(0.92, 0.06, darkT);
    root.style.setProperty('--card-bg', `rgba(255, 255, 255, ${cardAlpha.toFixed(2)})`);

    // 暗角、噪点、扫描线强度
    root.style.setProperty('--vignette-opacity', Math.min(0.95, Math.max(0, (scrollProgress - 0.18) * 1.4)).toFixed(2));
    root.style.setProperty('--noise-opacity', Math.min(0.18, Math.max(0, (scrollProgress - 0.25) * 0.28)).toFixed(3));
    root.style.setProperty('--scanline-opacity', Math.min(0.45, Math.max(0, (scrollProgress - 0.35) * 0.8)).toFixed(2));

    // 手电筒暗影效果（中后期开启）
    flashlight.style.opacity = scrollProgress > 0.48 ? Math.min(0.85, (scrollProgress - 0.48) * 2).toFixed(2) : '0';

    // 阶段 Class 切换
    body.classList.toggle('stage-uneasy', scrollProgress > 0.2);
    body.classList.toggle('stage-dark', scrollProgress > 0.36);

    // 导航栏与文案异变
    if (scrollProgress > 0.38) {
      navCta.textContent = window.innerWidth <= 420 ? '已注册' : '你已经注册了';
      logoText.textContent = scrollProgress > 0.72 ? 'S0L4CE' : 'Solace';
      navLinks.forEach((a) => {
        a.textContent = a.dataset.corrupt;
      });
      document.title = scrollProgress > 0.75 ? '不要回头' : 'Solace — 它在看着你';
    } else {
      navCta.textContent = '免费试用';
      logoText.textContent = 'Solace';
      navLinks.forEach((a) => {
        a.textContent = a.dataset.normal;
      });
      document.title = 'Solace — 让每一个夜晚，都像回家一样安心';
    }

    // Hero 设备状态文字偷偷变化
    if (scrollProgress > 0.08 && deviceStatusText) {
      deviceStatusText.textContent = '卧室环境：异常 · 16°C · 门未锁';
    } else if (deviceStatusText) {
      deviceStatusText.textContent = '卧室环境：极佳 · 22°C · 静谧';
    }

    // 终局红光闪屏 + 音效冲击 + 手机震动（仅触发一次）
    if (scrollProgress > 0.88 && !climaxTriggered) {
      climaxTriggered = true;
      triggerFlash('flash-red', 200);
      playStinger();
      vibrate([120, 60, 180]);
    } else if (scrollProgress < 0.2) {
      climaxTriggered = false;
    }

    updateAudioByScroll(scrollProgress);
  }

  function triggerFlash(className, duration) {
    flashOverlay.classList.add(className);
    setTimeout(() => flashOverlay.classList.remove(className), duration);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ==================== 5. 鼠标 & 手机触控：手电筒 + 巨眼追踪 ====================
  function updatePointer(clientX, clientY) {
    lastPointerTime = Date.now();
    flashlight.style.setProperty('--mx', `${clientX}px`);
    flashlight.style.setProperty('--my', `${clientY}px`);

    if (pupilGroup && scrollProgress > 0.65) {
      const rect = pupilGroup.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const angle = Math.atan2(clientY - cy, clientX - cx);
      const dist = Math.min(26, Math.hypot(clientX - cx, clientY - cy) / 14);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist * 0.65;
      pupilGroup.setAttribute('transform', `translate(${dx.toFixed(1)}, ${dy.toFixed(1)})`);
    }
  }

  window.addEventListener('mousemove', (e) => updatePointer(e.clientX, e.clientY));
  window.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches[0]) updatePointer(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true }
  );
  window.addEventListener(
    'touchmove',
    (e) => {
      if (e.touches[0]) updatePointer(e.touches[0].clientX, e.touches[0].clientY);
    },
    { passive: true }
  );

  // 手机上如果用户停住不滑屏幕，巨眼会自己突然扫视一下，像活物在找你
  setInterval(() => {
    if (!pupilGroup || scrollProgress < 0.78) return;
    if (Date.now() - lastPointerTime > 2200) {
      const dx = (Math.random() - 0.5) * 42;
      const dy = (Math.random() - 0.5) * 18;
      pupilGroup.style.transition = 'transform 0.25s ease-out';
      pupilGroup.setAttribute('transform', `translate(${dx.toFixed(1)}, ${dy.toFixed(1)})`);
    }
  }, 2600);

  // ==================== 6. 深渊文字渐显 ====================
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.4 }
  );
  document.querySelectorAll('[data-reveal]').forEach((el) => revealObserver.observe(el));

  // ==================== 7. “取消订阅”逃跑按钮（兼容电脑悬停 + 手机点击躲闪） ====================
  const escapeLabels = ['取消订阅', '确定要离开吗？', '太晚了', '你关不掉的', '留在黑暗里吧'];

  function dodgeButton() {
    escapeCount++;
    const maxX = isTouchDevice ? 36 : 90;
    const maxY = isTouchDevice ? 22 : 40;
    const rx = (Math.random() - 0.5) * 2 * maxX;
    const ry = (Math.random() - 0.5) * 2 * maxY;
    escapeBtn.style.transform = `translate(${rx.toFixed(0)}px, ${ry.toFixed(0)}px)`;
    escapeBtn.textContent = escapeLabels[Math.min(escapeCount, escapeLabels.length - 1)];
    vibrate(35);
  }

  if (!isTouchDevice) {
    escapeBtn.addEventListener('mouseenter', dodgeButton);
  }

  escapeBtn.addEventListener('click', (e) => {
    if (isTouchDevice && escapeCount < 3) {
      e.preventDefault();
      dodgeButton();
      return;
    }
    escapeBtn.style.transform = 'translate(0, 0)';
    triggerFlash('flash-red', 160);
    vibrate([80, 40, 120]);
    escapeBtn.textContent = '契约已生效';
  });

  // ==================== 8. 回到顶部（瞬间恢复阳光营销页） ====================
  restartBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
})();
