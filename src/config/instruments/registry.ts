import type { InstrumentConfig } from '../../types/easyScore';
import ukulele from './ukulele.json';

const instrumentRegistry: Record<string, InstrumentConfig> = {
  ukulele,
  uke: ukulele,
};

function normalizeInstrumentName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export function getInstrumentConfig(
  ...instrumentNames: Array<string | null | undefined>
): InstrumentConfig | null {
  for (const name of instrumentNames) {
    if (!name) continue;
    const config = instrumentRegistry[normalizeInstrumentName(name)];
    if (config) return config;
  }
  return null;
}

