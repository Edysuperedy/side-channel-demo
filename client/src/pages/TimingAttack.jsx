import { useState, useRef, useEffect } from 'react';
import Plotly from 'plotly.js-dist-min';
import { recoverKey, resetSecret, peekSecret, bytesToHex } from '../lib/timing';

function Chart({ data, layout }) {
  const divRef = useRef(null);
  useEffect(() => {
    if (divRef.current) Plotly.react(divRef.current, data, layout);
  }, [data, layout]);
  return <div ref={divRef} style={{ width: '100%' }} />;
}

export default function TimingAttack() {
  const [running, setRunning] = useState(false);
  const [ampNs, setAmpNs] = useState(100000);
  const [samplesPerByte, setSamplesPerByte] = useState(3);
  const [progress, setProgress] = useState(null);
  const [recovered, setRecovered] = useState(new Uint8Array(0));
  const [secret, setSecret] = useState('');
  const abortRef = useRef(null);

  async function handleStart() {
    setRunning(true);
    setRecovered(new Uint8Array(0));
    setProgress(null);

    await resetSecret();
    setSecret(await peekSecret());

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const result = await recoverKey({
        ampNs,
        samplesPerByte,
        signal: ctrl.signal,
        onProgress: p => {
          setProgress(p);
          setRecovered(p.recovered);
        },
      });
      if (result) setRecovered(result);
    } finally {
      setRunning(false);
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  let plotData = [];
  if (progress?.medians) {
    const ys = Array.from(progress.medians);
    let maxIdx = 0;
    for (let i = 1; i < ys.length; i++) if (ys[i] > ys[maxIdx]) maxIdx = i;
    plotData = [{
      type: 'bar',
      x: ys.map((_, i) => i),
      y: ys,
      marker: { color: ys.map((_, i) => (i === maxIdx ? '#e74c3c' : '#3498db')) },
    }];
  }

  const recoveredHex = bytesToHex(recovered);
  const truthHex = secret;

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ marginTop: 0 }}>Live timing attack</h2>
      <p style={{ color: '#666', maxWidth: 800 }}>
        The server uses a naive byte-by-byte comparison with early exit. Each
        matching byte adds <code>amp</code> nanoseconds of work. By measuring
        response times for all 256 candidate values at each position, we recover
        the secret one byte at a time — the candidate with the highest median
        time is the correct one.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', margin: '16px 0' }}>
        <label>
          Amplification (ns/byte):
          <input
            type="number"
            value={ampNs}
            onChange={e => setAmpNs(Number(e.target.value))}
            disabled={running}
            style={{ marginLeft: 8, width: 100 }}
          />
        </label>
        <label>
          Samples per guess:
          <input
            type="number"
            value={samplesPerByte}
            min={1}
            max={50}
            onChange={e => setSamplesPerByte(Number(e.target.value))}
            disabled={running}
            style={{ marginLeft: 8, width: 60 }}
          />
        </label>
        {!running ? (
          <button onClick={handleStart} style={{ padding: '8px 18px', cursor: 'pointer' }}>
            Start attack
          </button>
        ) : (
          <button onClick={handleStop} style={{ padding: '8px 18px', cursor: 'pointer' }}>
            Stop
          </button>
        )}
      </div>

      {secret && (
        <div style={{ fontFamily: 'monospace', fontSize: 14, margin: '16px 0', lineHeight: 1.7 }}>
          <div>ground truth: <span style={{ color: '#888' }}>{truthHex}</span></div>
          <div>
            recovered:    <span style={{ color: '#27ae60' }}>{recoveredHex}</span>
            <span style={{ color: '#ccc' }}>{'··'.repeat(16 - recovered.length)}</span>
          </div>
          {progress && !progress.done && (
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              byte {progress.pos}, candidate {progress.candidate}/256
            </div>
          )}
          {progress?.done && (
            <div style={{ color: '#27ae60', fontSize: 13, marginTop: 4 }}>
              {recoveredHex === truthHex ? 'recovery complete' : 'recovery finished — check for mismatches'}
            </div>
          )}
        </div>
      )}

      {progress?.medians && (
        <Chart
          data={plotData}
          layout={{
            title: `byte ${progress.pos} — candidate timings`,
            xaxis: { title: 'candidate value (0–255)' },
            yaxis: { title: 'median time (ns)' },
            height: 400,
            margin: { t: 50, r: 20, b: 50, l: 70 },
          }}
        />
      )}
    </div>
  );
}