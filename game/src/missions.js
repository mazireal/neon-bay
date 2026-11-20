// The story of Neon Bay: Kai Mercer, a getaway driver new in town, working
// for Rosa Delgado of the Sunset Diner against the Viper crew. Five missions,
// each a chain of steps — steal, drive, deliver, fight, escape — with cash
// rewards and an autosave on every completion.
import { LANDMARKS } from './city.js';
import { spawnEnemies } from './combat.js';
import { addWanted } from './police.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    brief: "Rosa: 'New in town, huh? You need wheels. Borrow something — and don't get caught.'",
    reward: 150,
    steps: [
      { type: 'steal', text: 'Steal a car — walk up to one and press E' },
      { type: 'goto', target: 'diner', text: 'Drive to the Sunset Diner' },
    ],
  },
  {
    id: 'the-delivery',
    title: 'The Delivery',
    brief: "Rosa: 'A package is waiting at the docks. The Palms Hotel wants it in 100 seconds. No questions.'",
    reward: 300,
    steps: [
      { type: 'goto', target: 'docks', text: 'Pick up the package at the Harbor Docks' },
      { type: 'gotoTimed', target: 'hotel', time: 100, text: 'Deliver it to the Palms Hotel — fast!' },
    ],
  },
  {
    id: 'street-heat',
    title: 'Street Heat',
    brief: "Rosa: 'The Vipers are pushing into Palm Park. Go remind them whose streets these are.'",
    reward: 400,
    steps: [
      { type: 'goto', target: 'park', text: 'Head to Palm Park' },
      { type: 'kill', count: 5, at: 'park', text: 'Take out the Vipers — 5 left' },
    ],
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    brief: "Rosa: 'Vex tipped off the cops. Three stars, Kai. Lose them — hide until the heat cools off.'",
    reward: 350,
    steps: [
      { type: 'loseWanted', text: 'Lose the cops — stay out of sight until the stars clear' },
    ],
  },
  {
    id: 'neon-nights',
    title: 'Neon Nights',
    brief: "Rosa: 'Last job. Vex himself is at the marina with his crew. Finish it — then come home.'",
    reward: 600,
    steps: [
      { type: 'goto', target: 'marina', text: 'Drive to the Neon Marina' },
      { type: 'kill', count: 6, at: 'marina', text: 'Take down Vex and his crew — 6 left' },
      { type: 'goto', target: 'safehouse', text: 'Escape to the Safehouse' },
    ],
  },
];

export function missionCount() {
  return MISSIONS.length;
}

export function startMission(state, index) {
  const def = MISSIONS[index];
  if (!def) {
    state.mission = null;
    return;
  }
  state.mission = {
    index,
    def,
    step: 0,
    timer: 0,
    killsLeft: 0,
    started: true,
    cardTimer: 5, // the mission card shows for 5 seconds
  };
  state.message = `${def.title} — ${def.brief}`;
  state.messageTimer = 5;
  if (def.id === 'the-getaway') {
    addWanted(state, 3, 'tipped off');
  }
  beginStep(state);
}

function beginStep(state) {
  const mission = state.mission;
  const step = mission.def.steps[mission.step];
  if (!step) return;
  mission.timer = step.time || 0;
  if (step.type === 'kill') {
    const at = LANDMARKS[step.at];
    mission.killsLeft = step.count;
    spawnEnemies(state, at.x, at.y, step.count);
  }
  if (step.type === 'gotoTimed') mission.timer = step.time;
}

function completeStep(state) {
  const mission = state.mission;
  mission.step += 1;
  if (mission.step >= mission.def.steps.length) {
    completeMission(state);
  } else {
    beginStep(state);
  }
}

function completeMission(state) {
  const mission = state.mission;
  state.player.cash += mission.def.reward;
  state.missionsDone = Math.max(state.missionsDone, mission.index + 1);
  state.events.missionDone = true;
  state.missionCompleteBanner = { title: 'MISSION COMPLETE', subtitle: `${mission.def.title}  •  +$${mission.def.reward}`, timer: 3.5 };
  state.mission = null;
  state.missionDelay = 2.5; // a breath before the next job
  state.events.save = true;
}

export function failMission(state, reason) {
  if (!state.mission) return;
  state.events.missionFail = true;
  state.missionFailReason = reason;
  state.mission = null;
  state.missionDelay = 1.5;
  state.enemies = [];
}

export function stepMissions(state, dt) {
  if (state.missionDelay > 0) {
    state.missionDelay -= dt;
    if (state.missionDelay <= 0) {
      if (state.missionsDone < MISSIONS.length) startMission(state, state.missionsDone);
    }
    return;
  }
  const mission = state.mission;
  if (!mission) return;
  if (mission.cardTimer > 0) mission.cardTimer -= dt;
  const step = mission.def.steps[mission.step];
  if (!step) return;
  const player = state.player;
  if (step.type === 'steal') {
    if (player.inCar) completeStep(state);
  } else if (step.type === 'goto' || step.type === 'gotoTimed') {
    const target = LANDMARKS[step.target];
    if (step.type === 'gotoTimed') {
      mission.timer -= dt;
      if (mission.timer <= 0) {
        failMission(state, 'Too slow — the delivery window closed.');
        return;
      }
    }
    if (Math.hypot(player.x - target.x, player.y - target.y) < 90) completeStep(state);
  } else if (step.type === 'kill') {
    const left = state.enemies.filter((e) => e.health > 0).length;
    mission.killsLeft = left;
    if (left === 0) completeStep(state);
  } else if (step.type === 'loseWanted') {
    if (state.wanted === 0) completeStep(state);
  }
}

/** The world position the HUD, minimap and beacon should point at, or null. */
export function missionMarker(state) {
  const mission = state.mission;
  if (!mission) return null;
  const step = mission.def.steps[mission.step];
  if (!step) return null;
  if (step.type === 'goto' || step.type === 'gotoTimed') {
    const target = LANDMARKS[step.target];
    return { x: target.x, y: target.y, label: target.label };
  }
  if (step.type === 'kill') {
    const at = LANDMARKS[step.at];
    return { x: at.x, y: at.y, label: 'FIGHT' };
  }
  return null;
}

export function objectiveText(state) {
  const mission = state.mission;
  if (!mission) {
    return state.missionsDone >= MISSIONS.length
      ? 'FREE ROAM — Neon Bay is yours. Find the 10 neon tokens!'
      : 'Get ready for your next job...';
  }
  const step = mission.def.steps[mission.step];
  if (!step) return '';
  let text = step.text;
  if (step.type === 'kill') text = text.replace(/\d+ left/, `${mission.killsLeft} left`);
  if (step.type === 'gotoTimed') text += `  (${Math.max(0, Math.ceil(mission.timer))}s)`;
  return `${mission.def.title}: ${text}`;
}
