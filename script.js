document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const form = document.getElementById('simulation-setup-form');
  const startButton = document.getElementById('start-simulation');
  const pauseButton = document.getElementById('pause-simulation');
  const resumeButton = document.getElementById('resume-simulation');
  const ffButton = document.getElementById('fast-forward-simulation');
  const resetButton = document.getElementById('reset-wip');
  const stationsWrapper = document.getElementById('stations-wrapper');
  const summaryReportEl = document.getElementById('summary-report');
  const summaryContentEl = document.getElementById('summary-content');
  const closeSummaryButton = document.getElementById('close-summary');
  const clockDisplay = document.getElementById('clock-display');
  const statusDisplay = document.getElementById('status-display');
  const errorMessageEl = document.getElementById('input-error-message');

  let simulationInterval = null;
  let dashboardInterval = null;
  let simulationTime = 0;
  let stats = {};
  let activeConfig = {};
  // Default speed multiplier is 60 for 1 sec real = 1 min sim
  let currentSpeedMultiplier = 60;
  let isSimulationRunning = false;

  // Format milliseconds to HH:MM:SS
  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hrs = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const secs = String(totalSeconds % 60).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }

  // Randomize processing time ± variationPercent (default 10%)
  function getRandomProcessingTime(baseTime, variationPercent = 10) {
    const variation = baseTime * (variationPercent / 100);
    const time = baseTime + (Math.random() * 2 - 1) * variation;
    return Math.max(time, baseTime * 0.5);
  }

  // Validate all inputs, return array of error strings
  function validateInputs(inputs) {
    const errors = [];
    if (isNaN(inputs.shifts) || inputs.shifts < 1 || inputs.shifts > 3) {
      errors.push('Number of shifts must be between 1 and 3.');
    }
    ['building', 'cutting', 'flipping', 'curing', 'coding'].forEach((station) => {
      if (isNaN(inputs[station]) || inputs[station] < 1) {
        errors.push(`${capitalize(station)} machines must be at least 1.`);
      }
    });
    if (isNaN(inputs.backlog) || inputs.backlog < 1) {
      errors.push('Backlog must be a positive integer.');
    }
    return errors;
  }

  // Capitalize first letter helper
  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Enable or disable simulation buttons
  function setControlsState({ start = true, pause = true, resume = true, fastForward = true, reset = true } = {}) {
    startButton.disabled = !start;
    pauseButton.disabled = !pause;
    resumeButton.disabled = !resume;
    ffButton.disabled = !fastForward;
    resetButton.disabled = !reset;
  }

  // Read form values and parse as integers
  function getFormValues() {
    return {
      shifts: parseInt(document.getElementById('input-shifts').value, 10),
      building: parseInt(document.getElementById('input-building').value, 10),
      cutting: parseInt(document.getElementById('input-cutting').value, 10),
      flipping: parseInt(document.getElementById('input-flipping').value, 10),
      curing: parseInt(document.getElementById('input-curing').value, 10),
      coding: parseInt(document.getElementById('input-coding').value, 10),
      backlog: parseInt(document.getElementById('input-backlog').value, 10),
    };
  }

  // Setup Simulation with parameters
  function setupSimulation(params) {
    simulationTime = 0;
    // Set default speed multiplier to 60: 1 real sec = 1 simulated minute
    currentSpeedMultiplier = 60;
    isSimulationRunning = true;

    stats = {
      buffers: {
        'backlog-buffer': { queue: new Array(params.backlog).fill('belt'), history: [], avg: 0 },
        'building-wip': { queue: [], history: [], avg: 0 },
        'cutting-wip': { queue: [], history: [], avg: 0 },
        'flipping-wip': { queue: [], history: [], avg: 0 },
        'curing-wip': { queue: [], history: [], avg: 0 },
        'finished-goods': { queue: [], history: [], avg: 0 },
      },
      stations: {},
      hourlyOutput: Array(params.shifts * 8).fill(0),
    };

    activeConfig = {
      shiftDurationMs: params.shifts * 8 * 3600 * 1000,
      breaks: [],
      stations: {
        Building: { name: 'Building', capacity: params.building, baseTime: 379.2, inputBuffer: 'backlog-buffer', outputBuffer: 'building-wip' },
        Cutting: { name: 'Cutting', capacity: params.cutting, baseTime: 240, inputBuffer: 'building-wip', outputBuffer: 'cutting-wip' },
        Flipping: { name: 'Flipping', capacity: params.flipping, baseTime: 600, inputBuffer: 'cutting-wip', outputBuffer: 'flipping-wip' },
        Curing: { name: 'Curing (DRUM)', capacity: params.curing, baseTime: 1596, inputBuffer: 'flipping-wip', outputBuffer: 'curing-wip', isDrum: true },
        Coding: { name: 'Coding', capacity: params.coding, baseTime: 496.2, inputBuffer: 'curing-wip', outputBuffer: 'finished-goods' },
      },
    };

    // Define breaks per shift
    for (let i = 0; i < params.shifts; i++) {
      const shiftStart = i * 8 * 3600 * 1000;
      activeConfig.breaks.push(
        { name: `S${i + 1} Bio 1`, start: shiftStart + 2 * 3600 * 1000, end: shiftStart + 2 * 3600 * 1000 + 10 * 60 * 1000 },
        { name: `S${i + 1} Lunch`, start: shiftStart + 4 * 3600 * 1000, end: shiftStart + 4 * 3600 * 1000 + 30 * 60 * 1000 },
        { name: `S${i + 1} Bio 2`, start: shiftStart + 6 * 3600 * 1000, end: shiftStart + 6 * 3600 * 1000 + 10 * 60 * 1000 }
      );
    }

    // Initialize stations and workers
    Object.entries(activeConfig.stations).forEach(([id, s]) => {
      stats.stations[id] = {
        id,
        name: s.name,
        capacity: s.capacity,
        setsProcessed: 0,
        idleTime: 0,
        workingTime: 0,
        utilization: 0,
        workers: Array(s.capacity).fill(null).map(() => ({ busyUntil: 0 })),
      };
    });

    renderStationsWithBacklogAndFinished();
    statusDisplay.textContent = 'Running';
    statusDisplay.classList.remove('on-break');
    setControlsState({ start: false, pause: true, resume: false, fastForward: true, reset: true });
    startSimulationLoop();
  }

  // Render backlog and finished containers explicitly with stations
  function renderStationsWithBacklogAndFinished() {
    stationsWrapper.innerHTML = '';

    // Backlog buffer container at start
    const backlogDiv = document.createElement('div');
    backlogDiv.className = 'station-container';
    backlogDiv.id = 'container-backlog-buffer';
    backlogDiv.innerHTML = `
      <h2>Backlog</h2>
      <div class="wip-buffer" id="buffer-backlog-buffer"></div>
    `;
    stationsWrapper.appendChild(backlogDiv);

    // Render all stations
    Object.entries(activeConfig.stations).forEach(([id, station]) => {
      const container = document.createElement('div');
      container.className = 'station-container';
      if (station.isDrum) container.classList.add('drum-container');
      container.id = `container-${id}`;

      const title = document.createElement('h2');
      title.textContent = station.name;
      if (station.isDrum) title.style.color = '#dc3545';
      container.appendChild(title);

      const stationDiv = document.createElement('div');
      stationDiv.className = 'station';
      stationDiv.id = `station-${id}`;
      container.appendChild(stationDiv);

      if (station.inputBuffer && station.inputBuffer !== 'backlog-buffer') {
        const inBufferDiv = document.createElement('div');
        inBufferDiv.className = 'wip-buffer';
        inBufferDiv.id = `buffer-${station.inputBuffer}`;
        inBufferDiv.title = `Buffer: ${station.inputBuffer}`;
        container.appendChild(document.createElement('hr'));
        container.appendChild(inBufferDiv);
      }

      if (station.outputBuffer && station.outputBuffer !== 'finished-goods') {
        const outBufferDiv = document.createElement('div');
        outBufferDiv.className = 'wip-buffer';
        outBufferDiv.id = `buffer-${station.outputBuffer}`;
        outBufferDiv.title = `Buffer: ${station.outputBuffer}`;
        container.appendChild(document.createElement('hr'));
        container.appendChild(outBufferDiv);
      }

      const statsDiv = document.createElement('div');
      statsDiv.className = 'stats-display';
      statsDiv.id = `stats-${id}`;
      container.appendChild(statsDiv);

      stationsWrapper.appendChild(container);
    });

    // Finished goods buffer container at end
    const finishedDiv = document.createElement('div');
    finishedDiv.className = 'station-container';
    finishedDiv.id = 'container-finished-goods';
    finishedDiv.innerHTML = `
      <h2>Finished Goods</h2>
      <div class="wip-buffer" id="buffer-finished-goods"></div>
    `;
    stationsWrapper.appendChild(finishedDiv);
  }

  // Render belt sets as circles for stations and buffers
  function renderBeltSets(containerId, count, state = '') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const belt = document.createElement('div');
      belt.className = 'v-belt-set';
      if (state === 'processing') belt.classList.add('processing');
      container.appendChild(belt);
    }
  }

  // Check if current simulation time is in a break period
  function isInBreak(time) {
    for (const brk of activeConfig.breaks) {
      if (time >= brk.start && time < brk.end) {
        return brk.name;
      }
    }
    return null;
  }

  // Increment idle times during breaks
  function incrementIdleTime(delta) {
    Object.values(stats.stations).forEach((station) => {
      station.idleTime += delta * currentSpeedMultiplier;
    });
  }

  // Simulation step executed every tick
  function simulationStep(delta) {
    // delta is real ms elapsed * currentSpeedMultiplier
    simulationTime += delta;

    if (simulationTime > activeConfig.shiftDurationMs) {
      endSimulation();
      return;
    }

    const breakName = isInBreak(simulationTime);
    if (breakName) {
      statusDisplay.textContent = `On Break: ${breakName}`;
      statusDisplay.classList.add('on-break');
      incrementIdleTime(delta);
      updateUI();
      clockDisplay.textContent = formatTime(simulationTime);
      return;
    } else {
      statusDisplay.textContent = 'Running';
      statusDisplay.classList.remove('on-break');
    }

    // Process stations and workers
    Object.entries(activeConfig.stations).forEach(([stationId, stationConfig]) => {
      const stationStats = stats.stations[stationId];
      const inputBuffer = stationConfig.inputBuffer ? stats.buffers[stationConfig.inputBuffer] : null;
      const outputBuffer = stationConfig.outputBuffer ? stats.buffers[stationConfig.outputBuffer] : null;

      for (let w = 0; w < stationStats.capacity; w++) {
        const worker = stationStats.workers[w];
        if (worker.busyUntil > simulationTime) {
          stationStats.workingTime += delta;
          continue;
        }

        if (inputBuffer && inputBuffer.queue.length === 0) {
          stationStats.idleTime += delta;
          continue;
        }

        if (inputBuffer) {
          inputBuffer.queue.shift();
        }

        const processingDuration = getRandomProcessingTime(stationConfig.baseTime, 10) * 1000; // convert seconds to ms
        worker.busyUntil = simulationTime + processingDuration;
        stationStats.workingTime += delta;

        setTimeout(() => {
          if (outputBuffer) outputBuffer.queue.push('belt');
          stationStats.setsProcessed++;
          stationStats.utilization = (stationStats.workingTime / (simulationTime || 1)) * 100;

          const hourIndex = Math.floor(simulationTime / (3600 * 1000));
          if (hourIndex < stats.hourlyOutput.length) stats.hourlyOutput[hourIndex]++;
        }, processingDuration / currentSpeedMultiplier);
      }
    });

    // Update buffer history and averages
    Object.values(stats.buffers).forEach((buffer) => {
      buffer.history.push(buffer.queue.length);
      if (buffer.history.length > 20) buffer.history.shift();
      buffer.avg = buffer.history.reduce((a, b) => a + b, 0) / buffer.history.length;
    });

    updateUI();
    clockDisplay.textContent = formatTime(simulationTime);
  }

  // Update the visualization UI
  function updateUI() {
    for (const bufferName in stats.buffers) {
      const buf = stats.buffers[bufferName];
      renderBeltSets(`buffer-${bufferName}`, buf.queue.length, '');
    }
    for (const [stationId, stationStats] of Object.entries(stats.stations)) {
      const busyCount = stationStats.workers.reduce((acc, w) => (w.busyUntil > simulationTime ? acc + 1 : acc), 0);
      renderBeltSets(`station-${stationId}`, busyCount, 'processing');
      const statEl = document.getElementById(`stats-${stationId}`);
      if (statEl) {
        statEl.innerHTML = `
          <div>Sets Processed: ${stationStats.setsProcessed}</div>
          <div>Utilization: ${stationStats.utilization.toFixed(1)}%</div>
          <div>Idle Time: ${(stationStats.idleTime / 60000).toFixed(1)} min</div>
        `;
      }
    }
  }

  // Detect bottleneck station or buffer combining utilization and buffer buildup
  function identifyBottleneck() {
    let maxUtil = 0;
    let maxUtilStation = null;

    for (const station of Object.values(stats.stations)) {
      if (station.utilization > maxUtil) {
        maxUtil = station.utilization;
        maxUtilStation = station;
      }
    }

    let maxBufferAvg = 0;
    let maxBufferName = null;

    for (const [name, buffer] of Object.entries(stats.buffers)) {
      if (buffer.avg > maxBufferAvg) {
        maxBufferAvg = buffer.avg;
        maxBufferName = name;
      }
    }

    const BUFFER_THRESHOLD = 10;
    if (maxBufferAvg > BUFFER_THRESHOLD) {
      return {
        type: 'Buffer buildup',
        name: maxBufferName,
        averageWIP: maxBufferAvg.toFixed(2),
      };
    } else if (maxUtilStation) {
      return {
        type: 'Utilization',
        name: maxUtilStation.name,
        utilization: maxUtilStation.utilization.toFixed(1),
      };
    }
    return { type: 'Unknown', name: 'None' };
  }

  // End the simulation and show summary modal
  function endSimulation() {
    isSimulationRunning = false;
    setControlsState({ start: true, pause: false, resume: false, fastForward: false, reset: true });
    statusDisplay.textContent = 'Simulation Completed';
    clockDisplay.textContent = formatTime(simulationTime);

    stopSimulationLoop();

    const totalSetsDone = Object.values(stats.stations).reduce((sum, s) => sum + s.setsProcessed, 0);
    const totalHours = activeConfig.shiftDurationMs / 3600000;
    const bottleneck = identifyBottleneck();

    let reportHtml = `<h3>Overall Results</h3>
      <p><strong>Simulated Time:</strong> ${formatTime(activeConfig.shiftDurationMs)}</p>
      <p><strong>Total Sets Produced:</strong> ${totalSetsDone}</p>
      <p><strong>Line Throughput:</strong> ${(totalSetsDone / totalHours).toFixed(2)} sets/hour</p>`;

    reportHtml += `<h3>Station Details</h3>
      <table>
        <thead><tr><th>Station</th><th>Processed Sets</th><th>Utilization (%)</th><th>Idle Time (min)</th></tr></thead>
        <tbody>`;
    for (const s of Object.values(stats.stations)) {
      reportHtml += `<tr><td>${s.name}</td><td>${s.setsProcessed}</td><td>${s.utilization.toFixed(1)}</td><td>${(s.idleTime / 60000).toFixed(1)}</td></tr>`;
    }
    reportHtml += `</tbody></table>`;

    reportHtml += `<h3>Buffer Average WIP</h3>
      <table>
        <thead><tr><th>Buffer</th><th>Average WIP</th></tr></thead>
        <tbody>`;
    for (const [name, buf] of Object.entries(stats.buffers)) {
      reportHtml += `<tr><td>${name}</td><td>${buf.avg.toFixed(2)}</td></tr>`;
    }
    reportHtml += `</tbody></table>`;

    reportHtml += `<h3>Primary Bottleneck</h3><p>`;
    if (bottleneck.type === 'Buffer buildup') {
      reportHtml += `Buffer "<strong>${bottleneck.name}</strong>" with average WIP: <strong>${bottleneck.averageWIP}</strong>`;
    } else if (bottleneck.type === 'Utilization') {
      reportHtml += `Station "<strong>${bottleneck.name}</strong>" with utilization: <strong>${bottleneck.utilization}%</strong>`;
    } else {
      reportHtml += 'No clear bottleneck detected.';
    }
    reportHtml += '</p>';

    summaryContentEl.innerHTML = reportHtml;
    summaryReportEl.classList.remove('hidden');
    summaryReportEl.focus();
  }

  // Stop simulation timers
  function stopSimulationLoop() {
    clearInterval(simulationInterval);
    clearInterval(dashboardInterval);
  }

  // Start simulation intervals
  function startSimulationLoop() {
    const tickMs = 100; // 100 ms per tick (real time)
    if (simulationInterval) clearInterval(simulationInterval);
    simulationInterval = setInterval(() => simulationStep(tickMs * currentSpeedMultiplier), tickMs);

    dashboardInterval = setInterval(() => updateUI(), 1000); // Update UI every second (real time)
  }

  // Event listeners

  // Validate inputs and enable/disable Start button
  form.addEventListener('input', () => {
    const params = getFormValues();
    const errors = validateInputs(params);
    if (errors.length === 0) {
      errorMessageEl.textContent = '';
      startButton.disabled = false;
    } else {
      errorMessageEl.textContent = errors.join(' ');
      startButton.disabled = true;
    }
  });

  // Form submission starts simulation
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const params = getFormValues();
    const errors = validateInputs(params);
    if (errors.length > 0) {
      errorMessageEl.textContent = errors.join(' ');
      return;
    }
    errorMessageEl.textContent = '';
    setupSimulation(params);
  });

  pauseButton.addEventListener('click', () => {
    if (!isSimulationRunning) return;
    stopSimulationLoop();
    isSimulationRunning = false;
    statusDisplay.textContent = 'Paused';
    setControlsState({ start: false, pause: false, resume: true, fastForward: false, reset: false });
  });

  resumeButton.addEventListener('click', () => {
    if (isSimulationRunning) return;
    startSimulationLoop();
    isSimulationRunning = true;
    statusDisplay.textContent = 'Running';
    setControlsState({ start: false, pause: true, resume: false, fastForward: true, reset: true });
  });

  ffButton.addEventListener('click', () => {
    const speeds = [1, 2, 5, 10, 30, 60];
    let idx = speeds.indexOf(currentSpeedMultiplier);
    idx = (idx + 1) % speeds.length;
    currentSpeedMultiplier = speeds[idx];
    ffButton.textContent = `Fast Forward (x${currentSpeedMultiplier})`;
  });

  resetButton.addEventListener('click', () => {
    stopSimulationLoop();
    isSimulationRunning = false;
    simulationTime = 0;
    stationsWrapper.innerHTML = '';
    summaryReportEl.classList.add('hidden');
    statusDisplay.textContent = 'Idle';
    clockDisplay.textContent = '00:00:00';
    errorMessageEl.textContent = '';
    setControlsState({ start: false, pause: false, resume: false, fastForward: false, reset: false });
  });

  closeSummaryButton.addEventListener('click', () => {
    summaryReportEl.classList.add('hidden');
  });

  // Initialize controls state on load
  setControlsState({ start: false, pause: false, resume: false, fastForward: false, reset: false });
});
