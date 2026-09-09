import
{
  GUN_AMMO
}
from './game.js';
import
{
  GameAudio
}
from './audio.js';
const ui = Object.fromEntries([
  'skyCanvas', 'arena', 'engineStatus', 'soundBtn', 'fullscreenBtn', 'pauseBtn', 'stopBtn', 'panelStopBtn',
  'gunAmmo', 'gunGuide', 'leadAssist', 'score', 'combo', 'timer', 'wave', 'reticle', 'toast', 'gunLead', 'gunLeadLabel',
  'heatWarning', 'gunStatus', 'heatPercent', 'heatMeter', 'heatFill', 'downed',
  'accuracy', 'shots', 'gamePanel', 'panelTitle', 'panelDescription',
  'roundSummary', 'roundOptions', 'panelStartBtn', 'restartBtn', 'helpBtn', 'helpModal',
  'sessionBest', 'difficulty', 'healthValue', 'healthMeter', 'healthFill',
  'healthStatus', 'damageOverlay', 'attackIndicators', 'missileStatus', 'missileReload', 'missileBtn', 'volume', 'volumeValue'
].map(id => [id, document.getElementById(id)]));

ui.gunAmmo.textContent = `20 MM HEI-T · ${GUN_AMMO.muzzleVelocity} M/S · G1 ${GUN_AMMO.bc.toFixed(3)}`;

let game, view, frameId, accumulator = 0,
  lastFrame = 0,
  hudClock = 0;
let pointerFiring = false,
  spaceFiring = false,
  activePointer = null;
let aimX = 0,
  aimY = 0,
  toastUntil = 0,
  hitUntil = 0,
  damageUntil = 0,
  panelMode = 'ready';
let best = 0,
  disposed = false;
const audio = new GameAudio();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const driveBars = document.querySelectorAll('.drive-bars i');

function clearInput()
{
  pointerFiring = false;
  spaceFiring = false;
  if (activePointer !== null && ui.skyCanvas.hasPointerCapture(activePointer)) ui.skyCanvas.releasePointerCapture(activePointer);
  activePointer = null;
}

function setStartLabel(text, disabled = false)
{
  for (const button of [ui.panelStartBtn])
  {
    button.textContent = text;
    button.disabled = disabled;
  }
}

function showPanel(mode)
{
  panelMode = mode;
  ui.gamePanel.hidden = false;
  ui.arena.classList.add('panel-open');
  ui.reticle.hidden = true;
  ui.roundSummary.hidden = mode !== 'ended';
  ui.pauseBtn.disabled = true;
  ui.stopBtn.disabled = mode !== 'paused';
  ui.panelStopBtn.hidden = mode !== 'paused';
  ui.missileBtn.disabled = true;
  ui.toast.textContent = '';
  ui.heatWarning.hidden = true;
  ui.difficulty.disabled = mode === 'paused';
  if (mode === 'paused')
  {
    ui.panelTitle.textContent = 'Paused';
    ui.panelDescription.textContent = 'The round, incoming fire, health recovery, and missile reload are paused.';
    setStartLabel('Resume');
  }
  else if (mode === 'stopped')
  {
    ui.panelTitle.textContent = 'Stopped';
    ui.panelDescription.textContent = 'Choose your settings, then deploy for a new round.';
    ui.restartBtn.disabled = true;
    setStartLabel('Deploy');
  }
  else if (mode === 'ended')
  {
    best = Math.max(best, game.score);
    ui.sessionBest.textContent = best.toLocaleString();
    ui.panelTitle.textContent = game.endReason === 'defeated' ? 'Defeated' : 'Survived!';
    ui.panelDescription.textContent = game.endReason === 'defeated' ?
      `You held out for ${Math.floor(game.time)} seconds. Shoot down incoming planes to give your health time to recover.` :
      `All three waves survived with ${Math.ceil(game.healthPercent)}% health remaining. Choose your settings and start another round.`;
    ui.roundSummary.replaceChildren();
    for (const [value, label] of [
        [game.score.toLocaleString(), 'Score'],
        [game.destroyed, 'Planes'],
        [`${game.accuracy}%`, 'Gun hit percentage'],
        [`×${game.bestCombo}`, 'Best streak']
      ])
    {
      const item = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = value;
      item.append(strong, document.createTextNode(label));
      ui.roundSummary.append(item);
    }
    setStartLabel('Deploy');
  }
}

function pause()
{
  clearInput();
  if (game?.state !== 'playing') return;
  game.pause();
  accumulator = 0;
  audio.update(0);
  showPanel('paused');
}

async function stopRound()
{
  if (!game || !view) return;
  clearInput();
  game.stop();
  accumulator = 0;
  audio.update(0);
  view.clearEffects();
  audio.clear();
  showPanel('stopped');
  updateHud();
  if (document.fullscreenElement) await document.exitFullscreen().catch(() =>
  {});
  ui.difficulty.focus(
  {
    preventScroll: false
  });
}

function beginRound(resume = false)
{
  if (!game || !view) return;
  try
  {
    clearInput();
    audio.unlock();
    if (resume) game.resume();
    else
    {
      game.start(ui.difficulty.value);
      view.clearEffects();
      audio.clear();
      aimX = aimY = 0;
      positionReticle();
      ui.toast.textContent = '';
      toastUntil = hitUntil = damageUntil = 0;
    }
    accumulator = 0;
    lastFrame = performance.now();
    ui.gamePanel.hidden = true;
    ui.arena.classList.remove('panel-open');
    ui.difficulty.disabled = true;
    ui.restartBtn.disabled = false;
    setStartLabel('Deploy', true);
    ui.reticle.hidden = false;
    ui.pauseBtn.disabled = false;
    ui.stopBtn.disabled = false;
    ui.skyCanvas.focus(
    {
      preventScroll: true
    });
    audio.update(game.spool, game);
    updateHud();
  }
  catch (error)
  {
    fail(error);
  }
}

function fail(error)
{
  console.error('AAAGunner:', error);
  clearInput();
  game?.pause();
  audio.update(0);
  panelMode = 'error';
  ui.gamePanel.hidden = false;
  ui.arena.classList.add('panel-open');
  ui.difficulty.disabled = true;
  ui.roundSummary.hidden = true;
  ui.restartBtn.disabled = true;
  ui.reticle.hidden = true;
  ui.panelTitle.textContent = 'Unable to Start';
  ui.panelDescription.textContent = 'The game needs WebGL and its 3D engine to load. Check your connection and browser graphics support, then try again.';
  setStartLabel('Reload');
  ui.engineStatus.textContent = 'Engine unavailable';
  ui.pauseBtn.disabled = true;
  ui.stopBtn.disabled = true;
  ui.panelStopBtn.hidden = true;
  ui.missileBtn.disabled = true;
}

function launchMissile()
{
  if (game?.state !== 'playing' || !view) return;
  const direction = view.directionAt(aimX, aimY);
  game.fireMissile(direction);
  updateHud();
}

function positionReticle()
{
  ui.reticle.style.left = `${(aimX + 1) * 50}%`;
  ui.reticle.style.top = `${(1 - aimY) * 50}%`;
}

function moveAim(event)
{
  const rect = ui.skyCanvas.getBoundingClientRect();
  aimX = Math.max(-0.98, Math.min(0.98, (event.clientX - rect.left) / rect.width * 2 - 1));
  aimY = Math.max(-0.98, Math.min(0.98, 1 - (event.clientY - rect.top) / rect.height * 2));
  positionReticle();
}

function updateHud()
{
  if (!game) return;
  ui.score.textContent = String(game.score).padStart(5, '0');
  const seconds = Math.ceil(game.remaining);
  ui.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  ui.combo.textContent = game.combo ? `STREAK ×${game.combo}` : 'BUILD A STREAK';
  ui.wave.textContent = `WAVE ${Math.min(3, game.wave)} / 3`;
  document.querySelector('.round-dots').textContent = ['● ○ ○', '● ● ○', '● ● ●'][Math.min(2, game.wave - 1)];
  ui.downed.textContent = game.destroyed;
  ui.accuracy.textContent = `${game.accuracy}%`;
  ui.shots.textContent = game.shots;
  const heat = Math.round(game.heat * 100);
  ui.heatPercent.textContent = `${heat}%`;
  ui.heatFill.style.width = `${heat}%`;
  ui.heatMeter.setAttribute('aria-valuenow', heat);
  ui.heatMeter.classList.toggle('hot', heat > 75);
  ui.heatWarning.hidden = !game.overheated || game.state !== 'playing';
  const health = Math.ceil(game.healthPercent);
  ui.healthValue.textContent = `${health}%`;
  ui.healthFill.style.width = `${game.healthPercent}%`;
  ui.healthMeter.setAttribute('aria-valuenow', health);
  ui.healthMeter.classList.toggle('low', health <= 30);
  const incoming = game.enemyShots.length > 0;
  ui.healthStatus.textContent = incoming ? 'INCOMING FIRE' : game.regenerating ? 'RECOVERING' : game.healthPercent < 100 ? 'RECOVERY PENDING' : 'READY';
  ui.healthStatus.parentElement.classList.toggle('incoming', incoming);
  ui.healthStatus.parentElement.classList.toggle('recovering', game.regenerating && !incoming);
  ui.attackIndicators.replaceChildren(...(game.state === 'playing' ? view.attackMarkers(game).map(position =>
  {
    const marker = document.createElement('span');
    marker.textContent = 'FIRING';
    marker.style.left = `${position.x}%`;
    marker.style.top = `${position.y}%`;
    return marker;
  }) : []));
  const direction = view.directionAt(aimX, aimY);
  const sight = game.state === 'playing' && ui.leadAssist.checked ? view.gunLeadMarker(game, direction) : null;
  ui.gunLead.hidden = !sight;
  if (sight)
  {
    ui.gunLead.style.left = `${sight.x}%`;
    ui.gunLead.style.top = `${sight.y}%`;
    ui.gunLeadLabel.textContent = `AIM HERE · ${Math.round(sight.distance / 10) * 10} m`;
  }
  const locked = game.state === 'playing' && Boolean(game.missileTarget(direction));
  const empty = game.missileAmmo === 0;
  ui.missileStatus.textContent = `${game.missileAmmo}/5 · ${empty ? 'EMPTY' : locked ? 'LOCK' : 'READY'}`;
  ui.missileReload.textContent = game.missileCooldown > 0 ? `+1 in ${game.missileCooldown.toFixed(1)}s` : 'MAGAZINE FULL';
  ui.missileStatus.parentElement.classList.toggle('locked', locked && !empty);
  ui.reticle.classList.toggle('locked', locked && !empty);
  ui.missileBtn.disabled = game.state !== 'playing' || empty;
  ui.gunStatus.textContent = game.overheated ? 'COOLING DOWN' : game.spool > 0.2 ? 'SPINNING' : 'READY';
  driveBars.forEach((bar, i) => bar.classList.toggle('active', game.spool > i / 8));

}

for (const button of [ui.panelStartBtn]) button.addEventListener('click', () =>
{
  if (panelMode === 'error')
  {
    location.reload();
    return;
  }
  beginRound(panelMode === 'paused');
});
ui.restartBtn.addEventListener('click', () => beginRound());
ui.missileBtn.addEventListener('click', () =>
{
  launchMissile();
  ui.skyCanvas.focus(
  {
    preventScroll: true
  });
});
ui.pauseBtn.addEventListener('click', pause);
ui.leadAssist.addEventListener('change', () =>
{
  ui.gunGuide.textContent = ui.leadAssist.checked ? 'AIM AT GOLD RING · 2 KM' : 'GUN RANGE · 2 KM';
  if (game && view) updateHud();
});

ui.volume.addEventListener('input', () =>
{
  audio.setVolume(Number(ui.volume.value) / 100);
  ui.volumeValue.textContent = ui.volume.value + '%';
});
ui.stopBtn.addEventListener('click', stopRound);
ui.panelStopBtn.addEventListener('click', stopRound);
ui.soundBtn.addEventListener('click', () =>
{
  audio.enabled = !audio.enabled;
  ui.soundBtn.textContent = audio.enabled ? 'Sound on' : 'Sound off';
  ui.soundBtn.setAttribute('aria-pressed', audio.enabled);
  if (audio.enabled) audio.unlock();
  else audio.update(0);
});
ui.helpBtn.addEventListener('click', () =>
{
  pause();
  ui.helpModal.showModal();
});
ui.helpModal.querySelector('.help-close').addEventListener('click', () => ui.helpModal.close());
ui.helpModal.addEventListener('click', event =>
{
  if (event.target === ui.helpModal)
  {
    const rect = ui.helpModal.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) ui.helpModal.close();
  }
});
ui.fullscreenBtn.addEventListener('click', async () =>
{
  try
  {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (ui.arena.requestFullscreen) await ui.arena.requestFullscreen();
    else throw new Error('Fullscreen unavailable');
  }
  catch
  {
    ui.fullscreenBtn.textContent = 'Fullscreen unavailable';
  }
});
document.addEventListener('fullscreenchange', () =>
{
  view?.resize();
  ui.fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
});
ui.skyCanvas.addEventListener('pointermove', event =>
{
  if (activePointer !== null && event.pointerId !== activePointer) return;
  moveAim(event);
});
ui.skyCanvas.addEventListener('pointerdown', event =>
{
  if (game?.state !== 'playing' || event.button !== 0 || activePointer !== null) return;
  moveAim(event);
  ui.skyCanvas.focus(
  {
    preventScroll: true
  });
  activePointer = event.pointerId;
  ui.skyCanvas.setPointerCapture(event.pointerId);
  pointerFiring = true;
  event.preventDefault();
});
const releasePointer = event =>
{
  if (event.pointerId !== activePointer) return;
  pointerFiring = false;
  if (ui.skyCanvas.hasPointerCapture(event.pointerId)) ui.skyCanvas.releasePointerCapture(event.pointerId);
  activePointer = null;
};
ui.skyCanvas.addEventListener('pointerup', releasePointer);
ui.skyCanvas.addEventListener('pointercancel', releasePointer);
ui.skyCanvas.addEventListener('lostpointercapture', releasePointer);
ui.skyCanvas.addEventListener('contextmenu', event =>
{
  event.preventDefault();
  moveAim(event);
  launchMissile();
});
window.addEventListener('keydown', event =>
{
  if (ui.helpModal.open)
  {
    if (event.code === 'Escape') ui.helpModal.close();
    return;
  }
  if (!game || event.target.closest('input, select, textarea, button') || event.ctrlKey || event.altKey || event.metaKey) return;
  if (event.code === 'Space' && game.state === 'playing')
  {
    spaceFiring = true;
    event.preventDefault();
  }
  if (event.repeat) return;
  if (event.code === 'KeyM')
  {
    launchMissile();
    event.preventDefault();
  }
  if (event.code === 'KeyP' || event.code === 'Escape')
  {
    if (game.state === 'playing') pause();
    else if (game.state === 'paused') beginRound(true);
    event.preventDefault();
  }
  if (event.code === 'KeyR' && game.state !== 'ready') beginRound();
});
window.addEventListener('keyup', event =>
{
  if (event.code === 'Space') spaceFiring = false;
});
window.addEventListener('blur', pause);
document.addEventListener('visibilitychange', () =>
{
  if (document.hidden) pause();
});
ui.skyCanvas.addEventListener('webglcontextlost', event =>
{
  event.preventDefault();
  cancelAnimationFrame(frameId);
  fail(new Error('WebGL context lost'));
});

try
{
  const [
  {
    ArenaView
  },
  {
    ArcadeGame,
    STEP
  },
  {
    loadPhysics
  }] = await Promise.all([
    import('./graphics/scene.js'), import('./game.js'), import('./physics.js')
  ]);
  const physics = await loadPhysics();
  view = new ArenaView(ui.skyCanvas);
  game = new ArcadeGame(physics, Math.random, target => view.isAttackVisible(target));
  ui.engineStatus.textContent = 'SYSTEMS READY';
  setStartLabel('Deploy');
  ui.reticle.hidden = true;
  const resizeObserver = new ResizeObserver(() => view.resize());
  resizeObserver.observe(ui.arena);
  const tick = timestamp =>
  {
    if (disposed) return;
    try
    {
      const elapsed = Math.max(0, Math.min(0.12, (timestamp - (lastFrame || timestamp)) / 1000));
      lastFrame = timestamp;
      const direction = view.directionAt(aimX, aimY);
      if (game.state === 'playing')
      {
        accumulator += elapsed;
        while (accumulator >= STEP && game.state === 'playing')
        {
          game.update(STEP, direction, pointerFiring || spaceFiring);
          accumulator -= STEP;
        }
      }
      else accumulator = 0;
      for (const event of game.events)
      {
        if (event.type === 'shot')
        {
          view.flashTime = .045;
          audio.event('gun', null, game.time);
        }
        if (event.type === 'shellImpact')
        {
          view.burst(event.position, false, null, true);
          audio.event('shellImpact', event.position, game.time);
        }
        if (event.type === 'hit')
        {
          hitUntil = timestamp + 100;
          audio.event('hit', event.position, game.time);
        }
        if (event.type === 'destroyed')
        {
          view.burst(event.position, true, event.velocity);
          ui.toast.textContent = `+${event.points}  TARGET DOWN`;
          toastUntil = timestamp + 1400;
          audio.event('explosion', event.position, game.time);
        }
        if (event.type === 'incoming')
        {
          audio.event('enemy', event.position, game.time);
          ui.toast.textContent = 'INCOMING FIRE';
          toastUntil = timestamp + 1200;
        }
        if (event.type === 'enemyImpact')
        {
          view.burst(event.position, false);
          audio.event('distantImpact', event.position, game.time);
        }
        if (event.type === 'damage')
        {
          damageUntil = timestamp + 450;
          if (event.position) view.burst(event.position, false);
          audio.event('impact', event.position, game.time);
        }
        if (event.type === 'missile')
        {
          audio.event('missile', null, game.time);
          ui.toast.textContent = 'MISSILE AWAY';
          toastUntil = timestamp + 900;
        }
        if (event.type === 'flare')
        {
          view.burst(event.position, false);
          ui.toast.textContent = 'FLARES';
          toastUntil = timestamp + 1100;
        }
        if (event.type === 'missileImpact')
        {
          view.burst(event.position, true);
          audio.event('explosion', event.position, game.time);
        }
        if (event.type === 'decoyed')
        {
          view.burst(event.position, true);
          audio.event('explosion', event.position, game.time);
          ui.toast.textContent = 'MISSILE DECOYED';
          toastUntil = timestamp + 1100;
        }
        if (event.type === 'ended')
        {
          clearInput();
          showPanel('ended');
        }
      }
      game.events.length = 0;
      if (timestamp > toastUntil) ui.toast.textContent = '';
      ui.reticle.classList.toggle('hit', timestamp < hitUntil);
      ui.damageOverlay.classList.toggle('active', timestamp < damageUntil && game.state === 'playing');
      audio.update(game.spool, game);
      hudClock += elapsed;
      if (hudClock >= 0.1)
      {
        updateHud();
        hudClock = 0;
      }
      view.render(game, direction, game.state === 'playing' || game.state === 'ready' ? elapsed : 0, reducedMotion.matches);
      frameId = requestAnimationFrame(tick);
    }
    catch (error)
    {
      fail(error);
    }
  };
  frameId = requestAnimationFrame(tick);
  window.addEventListener('pagehide', event =>
  {
    pause();
    if (event.persisted) return;
    disposed = true;
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    game.dispose();
    view.dispose();
    audio.dispose();
  });
}
catch (error)
{
  view?.dispose();
  game?.dispose();
  fail(error);
}