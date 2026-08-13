export function synthesizeSignal({
  frequencies,
  sampleRate = 48_000,
  size = 4096,
  amplitude = 0.35,
  noiseAmplitude = 0,
  harmonics = [],
}: {
  frequencies: number[];
  sampleRate?: number;
  size?: number;
  amplitude?: number;
  noiseAmplitude?: number;
  harmonics?: Array<{ multiple: number; amplitude: number }>;
}): Float32Array {
  const samples = new Float32Array(size);
  let seed = 0x12345678;
  for (let index = 0; index < size; index += 1) {
    let value = 0;
    for (const frequency of frequencies) {
      value += amplitude * Math.sin((2 * Math.PI * frequency * index) / sampleRate);
      for (const harmonic of harmonics) {
        value += amplitude * harmonic.amplitude *
          Math.sin((2 * Math.PI * frequency * harmonic.multiple * index) / sampleRate);
      }
    }
    seed = (1664525 * seed + 1013904223) >>> 0;
    value += (((seed / 0xffffffff) * 2) - 1) * noiseAmplitude;
    samples[index] = value;
  }
  return samples;
}
