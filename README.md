<h1>side-channel-demo</h1>
<p>Browser-based demo for side-channel attacks — extract keys from timing and power traces, no hardware required.<br>
Includes a slide deck, live demo, and writeup.</p>

<hr>

<h2>Table of Contents</h2>
<ol>
  <li><a href="#1-the-attacks">The Attacks</a>
    <ul>
      <li><a href="#1a-timing-attack">1a. Timing Attack (live demo)</a></li>
      <li><a href="#1b-simulated-power-traces-cpa">1b. Simulated Power Traces (CPA)</a></li>
      <li><a href="#1c-real-traces-ascad">1c. Real Traces (ASCAD)</a></li>
    </ul>
  </li>
  <li><a href="#2-architecture">Architecture</a></li>
  <li><a href="#3-file-by-file-plan">File-by-file Plan</a></li>
  <li><a href="#4-gotchas">Gotchas</a></li>
  <li><a href="#5-build-order">Build Order</a></li>
</ol>

<hr>

<h2 id="1-the-attacks">1. The Attacks</h2>

<h3 id="1a-timing-attack">1a. Timing Attack (live demo)</h3>

<p>The vulnerable pattern is byte-by-byte string comparison with early exit:</p>

<pre><code>function naiveCompare(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i &lt; a.length; i++) {
    if (a[i] !== b[i]) return false;   // early-exit leaks position
  }
  return true;
}</code></pre>

<p>If you guess the first byte wrong, the loop exits after 1 iteration. If you get the first byte right but the second wrong, it exits after 2. Response time ≈ length of the matching prefix. That's the leak.</p>

<h4>Recovery algorithm — byte-by-byte</h4>
<ol>
  <li>Fix bytes <code>0..i-1</code> to the prefix you've already recovered.</li>
  <li>For each candidate <code>c ∈ 0..255</code> at position <code>i</code>, send the server <code>prefix || c || padding</code> N times, record server-side processing time.</li>
  <li>The candidate with the highest <b>median</b> time is the correct byte. (Median, not mean — outliers from GC/scheduler dominate the mean.)</li>
  <li>Append it to the prefix; repeat for <code>i+1</code>.</li>
</ol>

<blockquote>
<b>Reality check:</b> Real network timing attacks against <code>hmac.compare</code> over the internet need millions of samples. In a 30-second demo you can't do that honestly. Two options:
<ul>
  <li><b>Amplify:</b> add a deliberate <code>busyWait(50µs)</code> per matching byte on the server. Tell the audience: "this amplifies a real effect; without it you'd need 10,000× more samples."</li>
  <li><b>Localhost only:</b> with no network jitter, even unamplified leaks are recoverable with a few hundred samples per byte.</li>
</ul>
Recommended: do both — a slider sets the amplification, so you can show <i>off → noise → on → instant recovery</i>.
</blockquote>

<hr>

<h3 id="1b-simulated-power-traces-cpa">1b. Simulated Power Traces (CPA)</h3>

<p>The CMOS leakage model: power drawn by a register loaded with value <code>v</code> is roughly proportional to <code>popcount(v)</code> — the Hamming Weight. For AES, the textbook attack point is the first-round S-box output:</p>

<pre><code>v = sbox[plaintext[i] XOR key[i]]
power_at_leak_time ≈ HW(v) + noise</code></pre>

<p>To simulate: pick a key byte <code>k</code>, generate N random plaintexts <code>p</code>, and for each one create a fake "trace" — an array of ~100 samples — where one specific sample equals <code>HW(sbox[p XOR k]) + Gaussian(σ)</code> and the rest are random noise.</p>

<p><b>SPA</b> (Simple Power Analysis) = squinting at one trace and recognising structure. Mostly storytelling for the demo: "if rounds were visible you'd see 10 humps."</p>

<p><b>CPA</b> (Correlation Power Analysis) is the real attack. For every candidate key guess <code>g ∈ 0..255</code>:</p>

<pre><code>hypothesis_g = [ HW(sbox[p[t] XOR g])  for t in 0..N-1 ]
correlation_g = pearson(hypothesis_g, traces[:, leak_sample])</code></pre>

<p>The correct <code>g</code> produces high correlation (~0.5–0.9 depending on noise); wrong guesses produce ~0. Plot <code>|corr|</code> over all 256 guesses → one bar towers above the rest.</p>

<blockquote>
If you didn't know the leak sample, compute correlation at <i>every</i> sample point of the trace and find the peak. That's how you locate leaks in unknown hardware — worth showing as a heatmap.
</blockquote>

<hr>

<h3 id="1c-real-traces-ascad">1c. Real Traces (ASCAD)</h3>

<p>ASCAD is the standard public dataset: real power measurements from an ATMega8515 running AES, packaged as HDF5. Same CPA code as 1b — that's the punchline. The simulation isn't a toy; it's the same algorithm.</p>

<p>HDF5 in the browser is painful. Preprocess offline: extract ~2000 traces × ~700 samples around the known leak window, dump as a raw <code>Float32Array</code> binary plus a <code>Uint8Array</code> of plaintexts (~5–10 MB total), loaded with <code>fetch → arrayBuffer() → typed-array view</code>. No HDF5 in the browser at all.</p>

<hr>

<h2 id="2-architecture">2. Architecture</h2>

<pre>
┌─────────────────────────────────────┐
│  client/  (Vite + React, port 5173) │
│    Tab 1: Timing Attack → server    │
│    Tab 2: Simulated traces (pure JS)│
│    Tab 3: Real traces (loads .bin)  │
└─────────────┬───────────────────────┘
              │ fetch POST /verify
              ▼
┌─────────────────────────────────────┐
│  server/  (Express, port 3001)      │
│    POST /vulnerable/verify          │
│    POST /safe/verify    (control)   │
│    POST /reset                      │
└─────────────────────────────────────┘
</pre>

<ul>
  <li><b>Why split:</b> Tab 1 needs a real server to attack. Tabs 2 and 3 are pure client-side — you can demo them even if the server fails on stage.</li>
  <li><b>Why Express:</b> ~30 lines of code, zero ceremony, everyone recognises it.</li>
  <li><b>Communication:</b> REST. The attack is request-driven; WebSockets are unnecessary.</li>
</ul>

<hr>

<h2 id="3-file-by-file-plan">3. File-by-file Plan</h2>

<h3>Server (<code>server/</code>)</h3>

<table>
  <thead>
    <tr><th>File</th><th>Purpose</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><code>index.js</code></td>
      <td>Entrypoint (~20 lines). CORS for <code>localhost:5173</code>, JSON body parsing, mounts <code>/vulnerable</code> and <code>/safe</code> routes, exposes <code>POST /reset</code> to regenerate the secret, accepts <code>amplificationUs</code> query param.</td>
    </tr>
    <tr>
      <td><code>routes/vulnerable.js</code></td>
      <td>Reads <code>{ guess }</code> from body, times comparison with <code>process.hrtime.bigint()</code>, uses <code>naiveCompare</code> with optional <code>busyWait</code>, returns <code>{ ok, serverTimeNs }</code>.</td>
    </tr>
    <tr>
      <td><code>routes/safe.js</code></td>
      <td>Same shape, uses <code>crypto.timingSafeEqual</code>. The control: same attack, no recovery.</td>
    </tr>
  </tbody>
</table>

<blockquote><code>busyWait</code> uses <code>while (process.hrtime.bigint() - start &lt; target)</code> — not <code>setTimeout</code>, which has ~1 ms resolution.</blockquote>

<h3>Client (<code>client/</code>)</h3>

<table>
  <thead>
    <tr><th>File</th><th>Purpose</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><code>vite.config.js</code></td>
      <td>Dev server proxy: <code>/api → localhost:3001</code> (avoids CORS in dev).</td>
    </tr>
    <tr>
      <td><code>src/App.jsx</code></td>
      <td>Tab state (<code>useState('timing' | 'sim' | 'real')</code>), renders one page component. ~30 lines.</td>
    </tr>
    <tr>
      <td><code>src/pages/TimingAttack.jsx</code></td>
      <td>Controls (target, samples-per-guess, amplification sliders, start/stop). Live bar chart of median times per candidate + recovered key hex display.</td>
    </tr>
    <tr>
      <td><code>src/pages/SimulatedTraces.jsx</code></td>
      <td>Controls (key byte, N traces, noise σ). Generates synthetic traces, runs CPA, renders: one sample trace, correlation bar chart, and a correlation heatmap.</td>
    </tr>
    <tr>
      <td><code>src/pages/RealTraces.jsx</code></td>
      <td>Loads <code>/data/ascad_subset.bin</code> once, runs same CPA, shows recovered vs ground-truth key byte.</td>
    </tr>
    <tr>
      <td><code>src/lib/aes.js</code></td>
      <td>Hardcoded <code>SBOX: Uint8Array(256)</code> and precomputed <code>HW: Uint8Array(256)</code> popcount table.</td>
    </tr>
    <tr>
      <td><code>src/lib/cpa.js</code></td>
      <td>Core CPA: <code>Float32Array</code>-based two-pass Pearson correlation, yields to UI every ~50 sample points for the heatmap path.</td>
    </tr>
    <tr>
      <td><code>src/lib/timing.js</code></td>
      <td>Attack driver: <code>recoverKey({ endpoint, keyLength, samples, onProgress })</code>.</td>
    </tr>
  </tbody>
</table>

<hr>

<h2 id="4-gotchas">4. Gotchas</h2>

<ul>
  <li><b>CORS:</b> configure <code>cors({ origin: 'http://localhost:5173' })</code> from the start, not when the first request fails on stage.</li>
  <li><b>Server-measured time:</b> measure with <code>hrtime.bigint()</code> on the server and return it. Client-side <code>Date.now()</code> includes network jitter and drowns the signal at micro-amplification levels.</li>
  <li><b>Median, not mean:</b> GC pauses can be 10 ms+ — 1000× the signal. Use median or low percentile (e.g., min of 5).</li>
  <li><b>Typed arrays for CPA:</b> always <code>Float32Array</code>, never <code>[]</code>. The inner loop is 50× slower with regular arrays due to boxed numbers.</li>
  <li><b>Plotly weight:</b> ~3 MB. Use <code>Plotly.react()</code> semantics — reuse the layout object reference, or every update recreates the SVG.</li>
  <li><b>Background-tab throttling:</b> Chrome throttles <code>setTimeout</code> to 1 Hz in inactive tabs. Keep the demo tab focused.</li>
  <li><b>ASCAD file size:</b> don't ship the full HDF5 (~7 GB). Preprocess offline and ship only the slice you need.</li>
  <li><b><code>hrtime.bigint()</code> returns BigInt:</b> doesn't <code>JSON.stringify</code> natively. Convert to string before sending, or use <code>Number()</code> (safe — values are nanoseconds, not picoseconds).</li>
</ul>

<hr>

<h2 id="5-build-order">5. Build Order</h2>

<ol>
  <li>Scaffold both packages (<code>npm create vite</code>, <code>npm init</code> in <code>server/</code>).</li>
  <li>Get the timing endpoint working — verify with <code>curl</code> that an amplified response is measurably slower for a longer matching prefix. <b>Don't move on until this works in the terminal.</b></li>
  <li>Write <code>lib/timing.js</code> and a minimal CLI test (Node script that runs the attack, prints recovered key) — proves the attack logic independently of the UI.</li>
  <li>Build the React tab around it.</li>
  <li>Write <code>lib/aes.js</code> and <code>lib/cpa.js</code>. Unit-test on a tiny synthetic case (4 traces, no noise, verify correlation = 1.0 for correct candidate).</li>
  <li>Build the <b>SimulatedTraces</b> tab.</li>
  <li>Preprocess ASCAD subset offline (Python + h5py → <code>.bin</code> files).</li>
  <li>Build the <b>RealTraces</b> tab — mostly reuses CPA from step 5.</li>
</ol>

<blockquote>Each step is independently verifiable in isolation. When something breaks during prep, you know which layer.</blockquote>
