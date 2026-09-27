import
{
  GUN_AMMO
}
from './game.js';
import { FORMATION_OFFSETS } from './b17/flight.js';
export const MODES = {
  b17:
  {
    label: 'B-17 Formation',
    description: 'Fly through a flak barrage over Europe. Man the tail, waist, nose, ball, or upper turret as your B-17 formation banks above the countryside. Fight off German fighters with your wingmen’s supporting fire.',
    eyebrow: 'B-17F · FORMATION DEFENSE',
    threat: 'GERMAN FIGHTERS · PROTECT THE FORMATION',
    weapon: 'BROWNING .50 CAL',
    ammo: 'BELT FED · UNLIMITED AMMO',
    range: '1.4 KM',
    healthLabel: 'BOMBER HULL',
    secondaryLabel: '',
    action: '',
    actionHint: 'Press 1–6 to change gun position. Move the mouse to the edges or use arrow keys to rotate the ball and upper turrets',
    heatLabel: 'BARREL HEAT',
    stat: 'FIGHTERS',
    fact: `${FORMATION_OFFSETS.length} WINGMEN`,
    location: 'OVER EUROPE · 6,000 M',
    defeatTitle: 'Bomber lost',
    gunSound: 'browning',
    defeat(game)
    {
      return `Your B-17 was shot down after ${Math.floor(game.time)} seconds. You destroyed ${game.destroyed} fighters; your formation destroyed ${game.allyKills}. Lead your shots and switch stations to cover each approach.`;
    },
    success(game)
    {
      return `Formation defended with ${Math.ceil(game.healthPercent)}% hull and ${game.allies.filter(a => a.alive).length}/${game.allies.length} wingmen remaining. Allied crews shot down ${game.allyKills} fighters.`;
    },
    async create(physics, canvas)
    {
      const [{ BomberView }, { BomberGame }] = await Promise.all([import('./b17/scene.js'), import('./b17/game.js')]);
      const view = new BomberView(canvas);
      try
      {
        const game = new BomberGame(physics, Math.random, t => view.isAttackVisible(t), (b, d) => view.muzzlePosition(b, d));
        return { view, game };
      }
      catch (error)
      {
        view.dispose();
        throw error;
      }
    }
  },
  coast:
  {
    label: 'Coast',
    description: 'Hold the coast. Take on three waves of incoming aircraft with quad 20 mm guns and homing missiles.',
    weapon: 'QUAD CANNONS',
    ammo: `4 × 20 MM HEI-T · ${GUN_AMMO.muzzleVelocity} M/S · G1 ${GUN_AMMO.bc.toFixed(3)}`,
    range: '2 KM',
    healthLabel: 'HEALTH',
    secondaryLabel: 'HEAT SEEKER',
    action: 'Fire missile',
    actionHint: 'Fire a homing missile (right-click or M)',
    heatLabel: 'BARREL HEAT',
    stat: 'PLANES',
    fact: '5 MISSILES',
    location: 'THE COAST',
    defeatTitle: 'Defeated',
    gunSound: 'gun',
    secondary(game, direction)
    {
      game.fireMissile(direction);
    },
    defeat(game)
    {
      return `You held out for ${Math.floor(game.time)} seconds. Shoot down incoming planes to give your health time to recover.`;
    },
    success(game)
    {
      return `All three waves survived with ${Math.ceil(game.healthPercent)}% health remaining.`;
    },
    async create(physics, canvas)
    {
      const [
      {
        ArenaView
      },
      {
        ArcadeGame
      }] = await Promise.all([import('./graphics/scene.js'), import('./game.js')]);
      const view = new ArenaView(canvas);
      try
      {
        const game = new ArcadeGame(physics, Math.random, t => view.isAttackVisible(t), d => view.flightHalfWidth(d), (b, d) => view.muzzlePosition(b, d));
        return {
          view,
          game
        };
      }
      catch (error)
      {
        view.dispose();
        throw error;
      }
    }
  },
  trench:
  {
    label: 'Trench',
    description: 'Hold the trench with the Maxim and friendly artillery. Stop the charge, take cover from riflemen and biplanes, and keep the line from being overrun.',
    weapon: 'MAXIM',
    ammo: 'WATER COOLED · UNLIMITED AMMO',
    range: '450 M',
    healthLabel: 'HEALTH',
    secondaryLabel: 'COVER',
    action: 'Take cover',
    actionHint: 'Hold C or toggle cover with right-click',
    heatLabel: 'JACKET HEAT',
    stat: 'STOPPED',
    fact: '10 ROUNDS/S',
    location: 'NO MAN’S LAND',
    defeatTitle(game)
    {
      return game.endReason === 'killed' ? 'Killed' : 'Overrun';
    },
    gunSound: 'maxim',
    secondary(game)
    {
      game.ducking = !game.ducking;
    },
    defeat(game)
    {
      if (game.endReason === 'killed') return `${game.deathSource === 'biplane' ? 'Biplane gunfire' : 'Rifle fire'} killed you at the gun after ${Math.floor(game.time)} seconds. Hold C to take cover from incoming fire. ${game.breaches} attackers had entered the trench.`;
      return `The line was overrun after ${Math.floor(game.time)} seconds. ${game.breaches} attackers reached the trench. Prioritize the closest soldiers and let the gun cool between bursts.`;
    },
    success(game)
    {
      return `The trench held through all three assaults. You stopped ${game.destroyed} attackers; friendly gunners stopped ${game.allyKills}.`;
    },
    async create(physics, canvas)
    {
      const [
      {
        TrenchView
      },
      {
        TrenchGame
      }] = await Promise.all([import('./trench/scene.js'), import('./trench/game.js')]);
      const view = new TrenchView(canvas);
      try
      {
        const game = new TrenchGame(physics, Math.random, d => view.flightHalfWidth(d), (b, d) => view.muzzlePosition(b, d), view.terrain);
        return {
          view,
          game
        };
      }
      catch (error)
      {
        view.dispose();
        throw error;
      }
    }
  }
};
