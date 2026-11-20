// The loop: boot, screens, the fixed-step simulation, and the wiring that
// turns the world's events into sound and screen changes. `?shot=name&seed=N`
// stages a deterministic screenshot scene instead of starting the game and
// sets window.__shotReady once the frame is drawn.
import { STEP, WANTED } from './config.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_RELOAD, createInput } from './input.js';
import { createWorld, policeChasing, respawnAfterArrest, stepWorld } from './world.js';
import { SCREEN_BUSTED, SCREEN_FAILED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED, createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { clearSave, loadSave } from './save.js';
import { stageShot } from './shots.js';

const NO_ACTIONS = { interact: false, reload: false };
const IDLE_INPUT = {
  moveX: () => 0,
  moveY: () => 0,
  run: () => false,
  handbrake: () => false,
  mouse: () => ({ x: 640, y: 360, down: false }),
};

function main() {
  const canvas = document.getElementById('game');
  const input = createInput(canvas);
  const renderer = createRenderer(canvas);
  const audio = createAudio();
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seedParam = Number.parseInt(params.get('seed') || '', 10);
  const seed = Number.isInteger(seedParam) ? seedParam : 7;

  // Screenshot mode: stage the scene, draw one frame, signal readiness.
  if (shot) {
    const state = createWorld(seed, null);
    const { screen } = stageShot(shot, state);
    window.__game = state;
    renderer.draw(state, screen, { saveExists: false, saveMissions: 0, saveCash: 40, bestCash: 40, fine: 0, failReason: '' });
    window.__shotReady = true;
    return;
  }

  const save = loadSave();
  let state = createWorld(Math.floor(Math.random() * 1000000), save);
  let screen = SCREEN_TITLE;
  const ui = {
    saveExists: !!save,
    saveMissions: save ? save.missionsDone : 0,
    saveCash: save ? save.cash : 40,
    bestCash: save ? save.bestCash : 40,
    fine: 0,
    failReason: '',
  };
  window.__game = state;

  // N on the title screen starts over from scratch.
  window.addEventListener('keydown', (event) => {
    if (screen === SCREEN_TITLE && event.code === 'KeyN') {
      clearSave();
      state = createWorld(Math.floor(Math.random() * 1000000), null);
      window.__game = state;
      ui.saveExists = false;
      ui.saveMissions = 0;
      ui.saveCash = 40;
      ui.bestCash = 40;
    }
  });

  function handleEvents() {
    const events = state.events;
    if (events.shot) audio.shoot();
    if (events.crash) audio.crash(0.3);
    if (events.explosion) audio.explosion();
    if (events.pickup) audio.pickup();
    if (events.missionDone) audio.missionDone();
    if (events.missionFail) {
      audio.missionFail();
      ui.failReason = state.missionFailReason || '';
      screen = SCREEN_FAILED;
      return;
    }
    if (state.player.busted) {
      audio.busted();
      ui.fine = WANTED.bustedFine;
      screen = SCREEN_BUSTED;
    } else if (state.player.wasted) {
      ui.fine = WANTED.wastedFine;
      screen = SCREEN_WASTED;
    }
  }

  let last = performance.now();
  let accumulator = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const bits = input.takeActions();
    if (bits & ACTION_MUTE) audio.setMuted(!audio.isMuted());

    if (screen === SCREEN_TITLE) {
      // Attract mode: the city lives behind the logo, but the first job
      // waits until the player actually starts, and nothing autosaves.
      accumulator += dt;
      while (accumulator >= STEP) {
        stepWorld(state, STEP, IDLE_INPUT, NO_ACTIONS);
        state.missionDelay = 1.2;
        state.saveTimer = 30;
        accumulator -= STEP;
      }
      if (bits & ACTION_CONFIRM) {
        audio.ensure();
        audio.click();
        screen = SCREEN_PLAY;
      }
    } else if (screen === SCREEN_PAUSED) {
      if (bits & (ACTION_PAUSE | ACTION_CONFIRM)) {
        audio.click();
        screen = SCREEN_PLAY;
      }
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      if (bits & ACTION_CONFIRM) {
        respawnAfterArrest(state, screen === SCREEN_BUSTED);
        audio.click();
        screen = SCREEN_PLAY;
      }
    } else if (screen === SCREEN_FAILED) {
      // The mission restarts itself: failMission already queued it.
      if (bits & ACTION_CONFIRM) {
        audio.click();
        screen = SCREEN_PLAY;
      }
    } else {
      if (bits & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
      } else {
        accumulator += dt;
        // One-shot actions apply to the first step of the frame only, so a
        // single press of E never enters and leaves the car at once.
        let actions = { interact: !!(bits & ACTION_INTERACT), reload: !!(bits & ACTION_RELOAD) };
        while (accumulator >= STEP) {
          stepWorld(state, STEP, input, actions);
          actions = NO_ACTIONS;
          accumulator -= STEP;
          handleEvents();
          if (screen !== SCREEN_PLAY) break;
        }
        // Continuous sounds follow the world.
        const player = state.player;
        if (player.inCar && player.car) {
          audio.engine(Math.min(1, Math.abs(player.car.speed) / 600));
        } else {
          audio.engine(null);
        }
        audio.siren(policeChasing(state), state.time);
      }
    }

    ui.bestCash = state.bestCash;
    renderer.draw(state, screen, ui);
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
  });

  requestAnimationFrame(frame);
}

main();
