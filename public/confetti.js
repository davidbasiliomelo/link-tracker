// Confete simples em canvas, sem dependências externas.
function launchConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const colors = ['#d97757', '#f2b134', '#5fb87a', '#5aa9e6', '#e15a97'];
  const pieces = [];
  const count = 90;

  for (let i = 0; i < count; i++) {
    pieces.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 120,
      y: canvas.height * 0.3,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 8,
      vy: -Math.random() * 9 - 4,
      rotation: Math.random() * 360,
      vRotation: (Math.random() - 0.5) * 14,
      gravity: 0.28,
      opacity: 1,
    });
  }

  let frame = 0;
  const maxFrames = 110;

  function tick() {
    frame++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    pieces.forEach((p) => {
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.vRotation;
      if (frame > maxFrames * 0.6) {
        p.opacity = Math.max(0, p.opacity - 0.04);
      }

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });

    if (frame < maxFrames) {
      requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  requestAnimationFrame(tick);
}
