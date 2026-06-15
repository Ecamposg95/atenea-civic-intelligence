// frontend/src/modules/resultados/fixtures.ts
export interface PartyResult { party: string; color: string; votes: number; share: number; }
export interface EntityResult { entity: string; turnout: number; winner: string; margin: number; votes: number; }

export const NATIONAL = {
  turnout: 0.612,
  counted: 0.973,
  leader: "Coalición A",
  // Sample national turnout trend across the count window (preview only).
  turnoutTrend: [0.18, 0.27, 0.34, 0.41, 0.47, 0.53, 0.57, 0.59, 0.6, 0.612],
};

export const PARTY_RESULTS: PartyResult[] = [
  { party: "Coalición A", color: "#22d3ee", votes: 18_432_110, share: 0.41 },
  { party: "Coalición B", color: "#f5b53d", votes: 14_211_980, share: 0.316 },
  { party: "Coalición C", color: "#2dd4bf", votes: 8_123_450, share: 0.181 },
  { party: "Otros", color: "#7c8aa5", votes: 4_187_220, share: 0.093 },
];

export const ENTITY_RESULTS: EntityResult[] = [
  { entity: "Ciudad de México", turnout: 0.66, winner: "Coalición A", margin: 0.12, votes: 5_082_000 },
  { entity: "Estado de México", turnout: 0.61, winner: "Coalición A", margin: 0.09, votes: 7_869_000 },
  { entity: "Jalisco", turnout: 0.59, winner: "Coalición B", margin: 0.05, votes: 3_717_000 },
  { entity: "Nuevo León", turnout: 0.63, winner: "Coalición A", margin: 0.08, votes: 3_276_000 },
  { entity: "Veracruz", turnout: 0.57, winner: "Coalición C", margin: 0.03, votes: 3_363_000 },
  { entity: "Puebla", turnout: 0.58, winner: "Coalición A", margin: 0.06, votes: 2_726_000 },
  { entity: "Guanajuato", turnout: 0.6, winner: "Coalición B", margin: 0.11, votes: 2_940_000 },
  { entity: "Chiapas", turnout: 0.54, winner: "Coalición C", margin: 0.04, votes: 2_106_000 },
  { entity: "Nuevo México del Sur", turnout: 0.56, winner: "Coalición A", margin: 0.02, votes: 1_512_000 },
  { entity: "Michoacán", turnout: 0.55, winner: "Coalición C", margin: 0.07, votes: 1_980_000 },
  { entity: "Oaxaca", turnout: 0.52, winner: "Coalición C", margin: 0.09, votes: 1_716_000 },
  { entity: "Guerrero", turnout: 0.51, winner: "Coalición C", margin: 0.05, votes: 1_173_000 },
  { entity: "Baja California", turnout: 0.62, winner: "Coalición A", margin: 0.1, votes: 1_736_000 },
  { entity: "Sonora", turnout: 0.6, winner: "Coalición A", margin: 0.06, votes: 1_320_000 },
  { entity: "Coahuila", turnout: 0.64, winner: "Coalición B", margin: 0.03, votes: 1_344_000 },
  { entity: "Tamaulipas", turnout: 0.58, winner: "Coalición B", margin: 0.04, votes: 1_508_000 },
];
