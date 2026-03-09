// Shared OSINT source registry
// Single source of truth used by both db.js (for pre-seeding) and risk.js (for fetching)
const OSINT_SOURCES = [
  { source: "GDACS",     category: "disaster",     description: "Desastres naturais (GDACS/UN-OCHA)" },
  { source: "WHO",       category: "health",        description: "Surtos de doenças (OMS)" },
  { source: "ReliefWeb", category: "humanitarian",  description: "Crises humanitárias (OCHA)" },
  { source: "IODA",      category: "internet",      description: "Interrupções de internet (Georgia Tech)" },
  { source: "USGS",      category: "seismic",       description: "Actividade sísmica (USGS)" },
  { source: "NOAA",      category: "space",         description: "Clima espacial (NOAA/SWPC)" },
  { source: "FOREX",     category: "economic",      description: "Stress cambial — moedas vs USD (BCE/Frankfurter)" },
  { source: "DOOMSDAY",  category: "geopolitical",  description: "Relógio do Apocalipse (Boletim dos Cientistas Atómicos)" },
  { source: "PIZZA",     category: "geopolitical",  description: "Pentagon Pizza Index — stress geopolítico composto" },
];

module.exports = OSINT_SOURCES;
