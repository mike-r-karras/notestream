const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const imagePath = path.join(projectRoot, 'proof', 'Ukulele-Chord-Chart.jpg');
const inputPath = path.join(projectRoot, 'proof', 'ukulele.json');
const outputPath = path.join(projectRoot, 'proof', 'ukulele_config.json');

const rowTops = [273, 442, 611, 780, 949, 1119, 1288, 1457, 1626, 1795, 1965];
const qualities = ['', '7', 'm', 'm7', 'Maj7', '6', 'm6', '9', 'sus', 'dim', '+'];
const roots = [
  ['A'], ['A#', 'Bb'], ['B'], ['C'], ['C#', 'Db'], ['D'],
  ['D#', 'Eb'], ['E'], ['F'], ['F#', 'Gb'], ['G'], ['G#', 'Ab'],
];
const sharpNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function darkPixelCount(data, width, centerX, centerY, radius, threshold) {
  let count = 0;
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (data[y * width + x] < threshold) count += 1;
    }
  }
  return count;
}

function verticalStringPositions(data, width, rowTop, column) {
  const hits = [];
  const left = 100 + column * 125;
  const right = 215 + column * 125;
  for (let x = left; x < right; x += 1) {
    let darkPixels = 0;
    for (let y = rowTop; y <= rowTop + 72; y += 1) {
      if (data[y * width + x] < 100) darkPixels += 1;
    }
    if (darkPixels > 55) hits.push(x);
  }

  const groups = [];
  hits.forEach(x => {
    const last = groups[groups.length - 1];
    if (!last || x > last[last.length - 1] + 1) groups.push([x]);
    else last.push(x);
  });
  const positions = groups.map(group =>
    Math.round(group.reduce((sum, x) => sum + x, 0) / group.length)
  );
  if (positions.length !== 4) {
    throw new Error(`Expected four strings at row ${rowTop}, column ${column}; found ${positions.length}`);
  }
  return positions;
}

function extractVoicing(data, width, rowTop, column) {
  return verticalStringPositions(data, width, rowTop, column).map(x => {
    let darkestFret = 0;
    let darkestCount = 0;
    for (let fret = 1; fret <= 5; fret += 1) {
      const y = rowTop + 8 + 16 * (fret - 1);
      const count = darkPixelCount(data, width, x, y, 5, 80);
      if (count > darkestCount) {
        darkestFret = fret;
        darkestCount = count;
      }
    }
    return darkestCount > 34 ? darkestFret : 0;
  });
}

function pitchToMidi(pitch) {
  const match = /^([A-G])(#|b)?(-?\d+)$/.exec(pitch);
  if (!match) throw new Error(`Unsupported tuning pitch: ${pitch}`);
  const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]];
  const accidental = match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + natural + accidental;
}

function midiToPitch(midi) {
  return `${sharpNotes[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

async function main() {
  const config = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const originalChords = structuredClone(config.chords);
  const { data, info } = await sharp(imagePath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const extracted = {};
  rowTops.forEach((rowTop, row) => {
    roots.forEach((rootLabels, column) => {
      const voicing = extractVoicing(data, info.width, rowTop, column);
      rootLabels.forEach(root => {
        extracted[`${root}${qualities[row]}`] = voicing;
      });
    });
  });

  Object.entries(originalChords).forEach(([label, voicing]) => {
    if (label in extracted && JSON.stringify(voicing) !== JSON.stringify(extracted[label])) {
      throw new Error(`Existing ${label} voicing disagrees with chart: ${voicing} vs ${extracted[label]}`);
    }
  });
  Object.entries(extracted).forEach(([label, voicing]) => {
    if (!(label in config.chords)) config.chords[label] = voicing;
  });

  const tuningMidi = config.tuning.map(pitchToMidi);
  config.chordTones = {};
  Object.entries(config.chords).forEach(([label, voicing]) => {
    config.chordTones[label] = voicing.map((fret, string) =>
      midiToPitch(tuningMidi[string] + fret)
    );
  });

  fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(config.chords).length} chord labels to ${outputPath}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
