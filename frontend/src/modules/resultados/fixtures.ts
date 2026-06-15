// frontend/src/modules/resultados/fixtures.ts
export interface PartyResult { party: string; color: string; votes: number; share: number; }
export interface EntityResult { entity: string; turnout: number; winner: string; margin: number; }

export const NATIONAL = { turnout: 0.612, counted: 0.973, leader: "Coalición A" };

export const PARTY_RESULTS: PartyResult[] = [
  { party: "Coalición A", color: "#22d3ee", votes: 18432110, share: 0.41 },
  { party: "Coalición B", color: "#f59e0b", votes: 14211980, share: 0.316 },
  { party: "Coalición C", color: "#2dd4bf", votes: 8123450, share: 0.181 },
  { party: "Otros", color: "#7c8aa5", votes: 4187220, share: 0.093 },
];

export const ENTITY_RESULTS: EntityResult[] = [
  { entity: "Ciudad de México", turnout: 0.66, winner: "Coalición A", margin: 0.12 },
  { entity: "Jalisco", turnout: 0.59, winner: "Coalición B", margin: 0.05 },
  { entity: "Nuevo León", turnout: 0.63, winner: "Coalición A", margin: 0.08 },
  { entity: "Veracruz", turnout: 0.57, winner: "Coalición C", margin: 0.03 },
  { entity: "Estado de México", turnout: 0.61, winner: "Coalición A", margin: 0.09 },
];
