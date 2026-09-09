import createPhysics from '../engine/physics.js';

// This module is built locally from engine/; no other project is required.
const ready = createPhysics();
export const loadPhysics = () => ready;
