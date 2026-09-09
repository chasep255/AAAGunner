import
{
  GUN_AMMO
}
from './game.js';
export const MODES = {
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
    description: 'Hold the trench through three infantry assaults. Work the water-cooled Maxim, reload its belt, and stop the charge before the line is overrun.',
    weapon: 'MAXIM',
    ammo: 'WATER COOLED · 250-ROUND BELT',
    range: '450 M',
    healthLabel: 'LINE',
    secondaryLabel: 'AMMUNITION',
    action: 'Reload belt',
    actionHint: 'Reload the Maxim (R or right-click)',
    heatLabel: 'JACKET HEAT',
    stat: 'STOPPED',
    fact: '250 ROUNDS',
    location: 'NO MAN’S LAND',
    defeatTitle: 'Overrun',
    gunSound: 'maxim',
    secondary(game)
    {
      game.reload();
    },
    defeat(game)
    {
      return `The line was overrun after ${Math.floor(game.time)} seconds. ${game.breaches} attackers reached the trench. Prioritize the closest soldiers and reload between charges.`;
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
        const game = new TrenchGame(physics, Math.random, d => view.flightHalfWidth(d), (b, d) => view.muzzlePosition(b, d));
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