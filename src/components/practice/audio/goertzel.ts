export type GoertzelProbe = {
  frequency: number;
  coefficient: number;
};

export function createGoertzelProbe(frequency: number, sampleRate: number): GoertzelProbe {
  return {
    frequency,
    coefficient: 2 * Math.cos((2 * Math.PI * frequency) / sampleRate),
  };
}

export function goertzelPower(
  samples: Float32Array,
  probe: GoertzelProbe
): number {
  let previous = 0;
  let previousPrevious = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index] + probe.coefficient * previous - previousPrevious;
    previousPrevious = previous;
    previous = current;
  }
  const power = previousPrevious * previousPrevious + previous * previous -
    probe.coefficient * previous * previousPrevious;
  return Math.max(0, power) / Math.max(1, samples.length * samples.length);
}

export function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (size - 1)));
  }
  return window;
}
