import
{
  MODES
}
from './modes.js';
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
import
{
  ScreenBlood
}
from './screen-blood.js';
const ui = Object.fromEntries([
  'trenchDefense', 'lineStatus', 'supportStatus', 'coverBtn', 'suppressionStatus', 'modeSelect', 'modeFact', 'modeLocation', 'modeThreat', 'secondaryKeys', 'secondaryPanel', 'healthLabel', 'weaponLabel', 'secondaryLabel', 'heatLabel', 'targetLabel', 'coastHelp', 'trenchHelp',
  'skyCanvas', 'arena', 'engineStatus', 'soundBtn', 'fullscreenBtn', 'pauseBtn', 'stopBtn', 'panelStopBtn',
  'bombWarning', 'bombTime', 'gunAmmo', 'gunGuide', 'leadAssist', 'score', 'combo', 'timer', 'wave', 'reticle', 'toast', 'gunLead', 'gunLeadLabel',
  'heatWarning', 'gunStatus', 'heatPercent', 'heatMeter', 'heatFill', 'downed',
  'accuracy', 'shots', 'gamePanel', 'panelTitle', 'panelDescription',
  'roundSummary', 'roundOptions', 'panelStartBtn', 'restartBtn', 'helpBtn', 'helpModal',
  'sessionBest', 'difficulty', 'healthValue', 'healthMeter', 'healthFill',
  'healthStatus', 'damageOverlay', 'screenBlood', 'attackIndicators', 'missileStatus', 'missileReload', 'missileBtn', 'volume', 'volumeValue'
].map(id => [id, document.getElementById(id)]));

ui.gunAmmo.textContent = `4 × 20 MM HEI-T · ${GUN_AMMO.muzzleVelocity} M/S · G1 ${GUN_AMMO.bc.toFixed(3)}`;

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
let modeKey = new URL(location.href).searchParams.get('mode') || 'coast';
if (!Object.hasOwn(MODES, modeKey)) modeKey = 'coast';
let modeSpec = MODES[modeKey],
  loadedPhysics, switching = false;
ui.modeSelect.value = modeKey;
const bests = {};
let best = 0,
  disposed = false;
const audio = new GameAudio();
const screenBlood = new ScreenBlood(ui.screenBlood);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const driveBars = document.querySelectorAll('.drive-bars i');

function clearInput()
{
  pointerFiring = false;
  spaceFiring = false;
  if (game && modeKey === 'trench') game.ducking = false;
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
  ui.bombWarning.hidden = true;
  ui.difficulty.disabled = mode === 'paused';
  ui.modeSelect.disabled = mode === 'paused';
  if (mode === 'ready')
  {
    ui.restartBtn.disabled = true;
    ui.panelTitle.innerHTML = 'AAA<span>GUNNER</span>';
    ui.panelDescription.textContent = modeSpec.description;
    setStartLabel('Deploy');
  }
  else if (mode === 'paused')
  {
    ui.panelTitle.textContent = 'Paused';
    ui.panelDescription.textContent = 'The round, combat, cooling, and health recovery are paused.';
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
    bests[modeKey] = best;
    ui.sessionBest.textContent = best.toLocaleString();
    const survived = game.endReason === 'survived';
    ui.panelTitle.textContent = survived ? 'Survived!' : typeof modeSpec.defeatTitle === 'function' ? modeSpec.defeatTitle(game) : modeSpec.defeatTitle;
    ui.panelDescription.textContent = survived ? modeSpec.success(game) : modeSpec.defeat(game);
    ui.roundSummary.replaceChildren();
    for (const [value, label] of [
        [game.score.toLocaleString(), 'Score'],
        [game.destroyed, modeSpec.stat],
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

function configureMode()
{
  ui.arena.dataset.mode = modeKey;
  ui.arena.classList.remove('bayoneted');
  screenBlood.clear();
  document.getElementById('modeEyebrow').textContent = modeKey === 'trench' ? 'TRENCH DEFENSE' : 'COASTAL DEFENSE';
  ui.weaponLabel.textContent = modeSpec.weapon;
  ui.gunAmmo.textContent = modeSpec.ammo;
  ui.gunGuide.textContent = `${ui.leadAssist.checked ? 'AIM AT GOLD RING' : 'GUN RANGE'} · ${modeSpec.range}`;
  ui.healthLabel.textContent = modeSpec.healthLabel;
  ui.secondaryLabel.textContent = modeSpec.secondaryLabel;
  ui.missileBtn.textContent = modeSpec.action;
  ui.missileBtn.title = modeSpec.actionHint;
  ui.heatLabel.textContent = modeSpec.heatLabel;
  ui.heatMeter.setAttribute('aria-label', modeSpec.heatLabel.toLowerCase());
  ui.targetLabel.textContent = modeSpec.stat;
  const [number, ...label] = modeSpec.fact.split(' ');
  ui.modeFact.innerHTML = `<strong>${number}</strong> ${label.join(' ')}`;
  ui.modeLocation.textContent = modeSpec.location;
  ui.modeThreat.textContent = modeKey === 'trench' ? 'INFANTRY ASSAULT · HOLD THE LINE' : 'AIRCRAFT INBOUND · ALL SECTORS';
  ui.secondaryKeys.innerHTML = modeKey === 'trench' ? '<kbd>RMB / C</kbd> COVER' : '<kbd>RMB / M</kbd> MISSILE';
  ui.coastHelp.hidden = modeKey !== 'coast';
  ui.trenchHelp.hidden = modeKey !== 'trench';
  ui.trenchDefense.hidden = modeKey !== 'trench';
  ui.coverBtn.hidden = modeKey !== 'trench';
  ui.secondaryPanel.hidden = modeKey === 'trench';
  ui.healthMeter.setAttribute('aria-label', 'Player health');
  ui.skyCanvas.setAttribute('aria-label', `Move the mouse to aim. Hold left mouse or Space to fire. ${modeSpec.actionHint}. P or Escape pauses.`);
  ui.heatWarning.firstChild.textContent = modeKey === 'trench' ? 'WATER JACKET HOT ' : 'BARRELS HOT ';
  ui.heatWarning.querySelector('span').textContent = modeKey === 'trench' ? 'Let it cool' : 'Let them cool';
  ui.bombWarning.querySelector('strong').textContent = modeKey === 'trench' ? 'LINE IN DANGER' : 'BOMB INBOUND';
  best = bests[modeKey] || 0;
  ui.sessionBest.textContent = best.toLocaleString();
}

async function selectMode(key)
{
  if (switching || !Object.hasOwn(MODES, key)) return;
  switching = true;
  clearInput();
  audio.clear();
  audio.update(0);
  ui.modeSelect.disabled = true;
  ui.difficulty.disabled = true;
  setStartLabel('Loading…', true);
  ui.engineStatus.textContent = 'LOADING MODE';
  try
  {
    game?.dispose();
    view?.dispose();
    game = null;
    view = null;
    modeKey = key;
    modeSpec = MODES[key];
    const selected = await modeSpec.create(loadedPhysics, ui.skyCanvas);
    game = selected.game;
    view = selected.view;
    accumulator = 0;
    lastFrame = performance.now();
    aimX = aimY = 0;
    ui.modeSelect.value = key;
    configureMode();
    positionReticle();
    showPanel('ready');
    updateHud();
    const url = new URL(location.href);
    url.searchParams.set('mode', key);
    history.replaceState(null, '', url);
    ui.engineStatus.textContent = 'SYSTEMS READY';
  }
  catch (error)
  {
    fail(error);
  }
  finally
  {
    switching = false;
  }
}

function pause()
{
  clearInput();
  if (!['playing', 'overrun', 'dying'].includes(game?.state)) return;
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
  ui.arena.classList.remove('bayoneted');
  screenBlood.clear();
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
      ui.arena.classList.remove('bayoneted');
      screenBlood.clear();
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
    ui.modeSelect.disabled = true;
    ui.restartBtn.disabled = false;
    setStartLabel('Deploy', true);
    ui.reticle.hidden = game.state !== 'playing';
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

function secondaryAction()
{
  if (game?.state !== 'playing' || !view) return;
  const direction = view.directionAt(aimX, aimY);
  modeSpec.secondary(game, direction);
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
  const incoming = game.enemyShots.length > 0 || game.bombs.some(bomb => bomb.alive);
  const bombs = game.bombs.filter(bomb => bomb.alive);
  ui.bombWarning.hidden = game.state !== 'playing' || bombs.length === 0;
  if (bombs.length) ui.bombTime.textContent = `SHOOT IT DOWN · ${Math.max(0, Math.min(...bombs.map(bomb => bomb.duration - bomb.age))).toFixed(1)}s`;
  ui.healthStatus.textContent = incoming ? 'INCOMING FIRE' : game.regenerating ? 'RECOVERING' : game.healthPercent < 100 ? 'RECOVERY PENDING' : 'READY';
  ui.healthStatus.parentElement.classList.toggle('incoming', incoming);
  ui.healthStatus.parentElement.classList.toggle('recovering', game.regenerating && !incoming);
  ui.attackIndicators.replaceChildren(...(game.state === 'playing' ? view.attackMarkers(game).map(position =>
  {
    const marker = document.createElement('span');
    marker.textContent = position.label || 'FIRING';
    if (position.bomb) marker.classList.add('bomb-marker');
    if (position.allied) marker.classList.add('ally-marker');
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
  const locked = game.state === 'playing' && modeKey === 'coast' && Boolean(game.missileTarget(direction));
  const empty = game.missileAmmo === 0;
  ui.missileStatus.textContent = `${game.missileAmmo}/5 · ${empty ? 'EMPTY' : locked ? 'LOCK' : 'READY'}`;
  ui.missileReload.textContent = game.missileCooldown > 0 ? `+1 in ${game.missileCooldown.toFixed(1)}s` : 'MAGAZINE FULL';
  ui.missileStatus.parentElement.classList.toggle('locked', locked && !empty);
  ui.reticle.classList.toggle('locked', locked && !empty);
  ui.missileBtn.disabled = game.state !== 'playing' || empty;
  ui.gunStatus.textContent = game.overheated ? 'COOLING DOWN' : game.spool > 0.2 ? 'FIRING' : 'READY';
  driveBars.forEach((bar, i) => bar.classList.toggle('active', game.spool > i / 8));
  if (modeKey === 'trench')
  {
    ui.lineStatus.textContent = `LINE ${game.tuning.breaches-game.breaches}/${game.tuning.breaches} · ${game.breaches} BREACHES`;
    ui.supportStatus.textContent = `CREWS ${game.allies.filter(ally => ally.alive).length}/2 · BATTERY ${game.artillery.length ? 'FIRING' : 'LOADING'} · ${game.artilleryKills} STOPS`;
    ui.suppressionStatus.textContent = game.ducking ? 'IN COVER' : game.suppression > .25 ? `SUPPRESSED ${Math.round(game.suppression*100)}% · HOLD C` : 'HOLD C TO TAKE COVER';
    ui.coverBtn.textContent = game.ducking ? 'Leave cover' : 'Take cover';
    ui.coverBtn.setAttribute('aria-pressed', String(game.ducking));
    ui.coverBtn.disabled = game.state !== 'playing';
    const distance = game.nearestDistance;
    ui.healthStatus.textContent = game.regenerating ? 'RECOVERING' : `NEAREST ${Math.ceil(distance || 0)} M`;
    ui.healthStatus.parentElement.classList.toggle('incoming', distance !== null && distance < 40);
    ui.healthStatus.parentElement.classList.toggle('recovering', game.regenerating);
    ui.bombWarning.hidden = game.state !== 'playing' || distance === null || distance >= 40;
    ui.bombTime.textContent = `STOP THE CHARGE · ${Math.ceil(distance || 0)} M`;
    ui.gunStatus.textContent = game.ducking ? 'IN COVER' : game.suppression > .35 ? 'SUPPRESSED' : game.overheated ? 'COOLING' : game.spool > .2 ? 'FIRING' : 'READY';
  }
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
ui.coverBtn.addEventListener('click', () =>
{
  if (game?.state === 'playing' && modeKey === 'trench')
  {
    game.ducking = !game.ducking;
    updateHud();
    ui.skyCanvas.focus(
    {
      preventScroll: true
    });
  }
});
ui.modeSelect.addEventListener('change', () => selectMode(ui.modeSelect.value));
ui.restartBtn.addEventListener('click', () => beginRound());
ui.missileBtn.addEventListener('click', () =>
{
  secondaryAction();
  ui.skyCanvas.focus(
  {
    preventScroll: true
  });
});
ui.pauseBtn.addEventListener('click', pause);
ui.leadAssist.addEventListener('change', () =>
{
  ui.gunGuide.textContent = `${ui.leadAssist.checked ? 'AIM AT GOLD RING' : 'GUN RANGE'} · ${modeSpec.range}`;
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
  secondaryAction();
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
  if (event.code === 'KeyC' && modeKey === 'trench' && game.state === 'playing')
  {
    game.ducking = true;
    event.preventDefault();
  }
  if (event.repeat) return;
  if (event.code === 'KeyM' && modeKey === 'coast')
  {
    secondaryAction();
    event.preventDefault();
  }
  if (event.code === 'KeyP' || event.code === 'Escape')
  {
    if (['playing', 'overrun', 'dying'].includes(game.state)) pause();
    else if (game.state === 'paused') beginRound(true);
    event.preventDefault();
  }
  if (event.code === 'KeyR' && modeKey === 'coast' && game.state !== 'ready') beginRound();
});
window.addEventListener('keyup', event =>
{
  if (event.code === 'Space') spaceFiring = false;
  if (event.code === 'KeyC' && modeKey === 'trench' && game) game.ducking = false;
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
    loadPhysics
  },
  {
    STEP
  }] = await Promise.all([import('./physics.js'), import('./game.js')]);
  loadedPhysics = await loadPhysics();
  await selectMode(modeKey);
  const resizeObserver = new ResizeObserver(() => view?.resize());
  resizeObserver.observe(ui.arena);
  const tick = timestamp =>
  {
    if (disposed) return;
    if (switching || !game || !view)
    {
      lastFrame = timestamp;
      frameId = requestAnimationFrame(tick);
      return;
    }
    try
    {
      const elapsed = Math.max(0, Math.min(0.12, (timestamp - (lastFrame || timestamp)) / 1000));
      lastFrame = timestamp;
      const direction = view.directionAt(aimX, aimY);
      if (['playing', 'overrun', 'dying'].includes(game.state))
      {
        accumulator += elapsed;
        while (accumulator >= STEP && ['playing', 'overrun', 'dying'].includes(game.state))
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
          view.gunShot(event.barrel);
          audio.event(modeSpec.gunSound, null, game.time);
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
          if (event.kind !== 'infantry' && event.kind !== 'biplane') view.burst(event.position, true, event.velocity);
          ui.toast.textContent = `+${event.points}  ${event.part === 'head' ? 'HEADSHOT' : 'TARGET DOWN'}`;
          toastUntil = timestamp + 1400;
          if (event.kind !== 'infantry' && event.kind !== 'biplane') audio.event('explosion', event.position, game.time);
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
        if (event.type === 'bombDrop')
        {
          audio.event('bombAlert', null, game.time);
          ui.toast.textContent = 'BOMB RELEASED — SHOOT IT DOWN';
          toastUntil = timestamp + 1800;
        }
        if (event.type === 'bombImpact' || event.type === 'bombDestroyed')
        {
          view.burst(event.position, true);
          audio.event('explosion', event.position, game.time);
          if (event.type === 'bombDestroyed')
          {
            ui.toast.textContent = '+50  BOMB INTERCEPTED';
            toastUntil = timestamp + 1400;
          }
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
        if (event.type === 'blood') view.blood.burst(event.position, event.source, event.velocity);
        if (event.type === 'groundHit') view.dust(event.position);
        if (event.type === 'allyShot') audio.event('ally', event.position, game.time);
        if (event.type === 'artilleryLaunch') audio.event('whistle', event.position, game.time);
        if (event.type === 'artilleryImpact')
        {
          view.artilleryImpact(event.position);
          audio.event('explosion', event.position, game.time);
        }
        if (event.type === 'overrun')
        {
          clearInput();
          ui.reticle.hidden = true;
          ui.toast.textContent = 'ENEMY IN THE TRENCH';
          toastUntil = timestamp + 2100;
        }
        if (event.type === 'bayonetHit')
        {
          ui.arena.classList.add('bayoneted');
          screenBlood.hit(true);
          audio.event('bayonet', null, game.time);
          view.blood.burst(event.position, 'bayonet',
          {
            x: 0,
            y: 1,
            z: .5
          });
        }
        if (event.type === 'rifleShot') audio.event('rifle', event.position, game.time);
        if (event.type === 'planeFire') audio.event('enemy', event.position, game.time);
        if (event.type === 'nearMiss') audio.event('hit', event.position, game.time);
        if (event.type === 'rifleHit')
        {
          damageUntil = timestamp + 400;
          screenBlood.hit();
          audio.event('impact', event.position, game.time);
        }
        if (event.type === 'playerKilled')
        {
          clearInput();
          screenBlood.hit(true);
          ui.reticle.hidden = true;
          ui.toast.textContent = event.source === 'biplane' ? 'KILLED BY BIPLANE GUNFIRE' : 'KILLED BY RIFLE FIRE';
          toastUntil = timestamp + 2400;
        }
        if (event.type === 'airRaid')
        {
          ui.toast.textContent = 'BIPLANES INBOUND';
          toastUntil = timestamp + 2200;
        }
        if (event.type === 'planeCrash')
        {
          view.planeCrash(event.position, event.velocity);
          audio.event('explosion', event.position, game.time);
        }
        if (event.type === 'breach')
        {
          damageUntil = timestamp + 500;
          ui.toast.textContent = 'THE LINE IS BEING OVERRUN';
          toastUntil = timestamp + 1800;
          audio.event('bombAlert', null, game.time);
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
      screenBlood.update(game.state === 'paused' ? 0 : elapsed, reducedMotion.matches);
      audio.update(game.spool, game);
      hudClock += elapsed;
      if (hudClock >= 0.1)
      {
        updateHud();
        hudClock = 0;
      }
      view.render(game, direction, ['playing', 'ready', 'overrun', 'dying'].includes(game.state) ? elapsed : 0, reducedMotion.matches);
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
    game?.dispose();
    view?.dispose();
    audio.dispose();
  });
}
catch (error)
{
  view?.dispose();
  game?.dispose();
  fail(error);
}