document.addEventListener('DOMContentLoaded', () => {
    const $ = id => document.getElementById(id);
    let ws, charts = {}, currentUser = null, allData = [];
    let lastSaveTime = 0, currentAutoMode = true;
    
    let lastPumpState = false, pumpStartTime = 0, totalWaterUsed = 0;
    let lastFanState = false, fanStartTime = 0, totalFanHours = 0;
    let activeAlerts = 0;

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(err => console.log(err));

    function seedUsers() {
        if (!localStorage.getItem('abrt_users')) {
            localStorage.setItem('abrt_users', JSON.stringify([
                { user: 'admin', pass: 'admin', role: 'admin', perms: { temp: true, hum: true, soil: true, water: true } },
                { user: 'guest', pass: 'guest', role: 'user', perms: { temp: true, hum: true, soil: false, water: false } }
            ]));
        }
    }
    function login() {
        const users = JSON.parse(localStorage.getItem('abrt_users'));
        const found = users.find(x => x.user === $('loginUser').value && x.pass === $('loginPass').value);
        if (found) { currentUser = found; $('loginScreen').style.display = 'none'; $('connectScreen').style.display = 'flex'; }
        else $('loginErr').textContent = 'ACCESS DENIED. INVALID CREDENTIALS.';
    }
    function logout() { currentUser = null; if(ws) ws.close(); $('app').style.display = 'none'; $('connectScreen').style.display = 'flex'; }

    function connectESP() {
        const inputVal = $('ipInput').value.trim();
        if (!inputVal) return $('connErr').textContent = 'IP ADDRESS OR TUNNEL URL REQUIRED.';
        localStorage.setItem('esp_ip', inputVal);
        
        let wsUrl = '';
        // Check if the user typed a secure tunnel URL (starts with http)
        if (inputVal.startsWith('http')) {
            // It's a tunnel URL (e.g., https://abc-xyz.localhost.run)
            let url = new URL(inputVal);
            // Convert https to wss (secure websocket). Do not add :81, the tunnel handles it.
            wsUrl = 'wss://' + url.hostname; 
        } else {
            // It's a local IP (e.g., 192.168.137.129)
            let wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            wsUrl = wsProtocol + inputVal + ':81'; // Add port 81 for local IP
        }
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            $('connectScreen').style.display = 'none'; $('app').style.display = 'flex';
            $('userDisplay').textContent = currentUser.user; initRoleUI(); loadSettings(); renderRules();
        };
        ws.onclose = () => { $('app').style.display = 'none'; $('connectScreen').style.display = 'flex'; $('connErr').textContent = 'LINK SEVERED.'; };
        ws.onmessage = (e) => {
            const d = JSON.parse(e.data);
            updateUI(d); checkAlerts(d); trackResources(d);
            allData.push({...d, time: new Date().toLocaleTimeString()});
            if (allData.length > 150) allData.shift();
            if (Date.now() - lastSaveTime > 30000) { localStorage.setItem('abrt_data', JSON.stringify(allData)); lastSaveTime = Date.now(); }
        };
    }
    function sendCmd(payload) { if(ws && ws.readyState === 1) ws.send(JSON.stringify(payload)); }

    function checkAlerts(d) {
        let alerts = [];
        if (d.water < 10) alerts.push("WATER TANK CRITICAL");
        if (d.temperature > 45) alerts.push("TEMPERATURE EXTREME");
        activeAlerts = alerts.length;
        if (activeAlerts > 0) {
            $('alertCount').style.display = 'flex'; $('alertCount').textContent = activeAlerts;
            $('alertBanner').style.display = 'block'; $('alertBanner').textContent = "⚠ " + alerts.join(" | ");
        } else {
            $('alertCount').style.display = 'none'; $('alertBanner').style.display = 'none';
        }
    }

    function trackResources(d) {
        if (d.pump && !lastPumpState) pumpStartTime = Date.now();
        if (!d.pump && lastPumpState) totalWaterUsed += ((Date.now() - pumpStartTime) / 60000) * 1.5;
        lastPumpState = d.pump;
        if (d.fan && !lastFanState) fanStartTime = Date.now();
        if (!d.fan && lastFanState) totalFanHours += ((Date.now() - fanStartTime) / 3600000);
        lastFanState = d.fan;
        $('waterUsed').textContent = totalWaterUsed.toFixed(1); $('fanHours').textContent = totalFanHours.toFixed(2);
    }

    function initRoleUI() {
        if (currentUser.role === 'admin') { $('userMgmt').style.display = 'block'; renderUserTable(); } else $('userMgmt').style.display = 'none';
        $('card_temp').style.display = currentUser.perms.temp ? 'flex' : 'none';
        $('card_hum').style.display = currentUser.perms.hum ? 'flex' : 'none';
        $('card_soil').style.display = currentUser.perms.soil ? 'flex' : 'none';
        $('card_soiltemp').style.display = currentUser.perms.soil ? 'flex' : 'none';
        $('card_water').style.display = currentUser.perms.water ? 'flex' : 'none';
    }

    function setRingProgress(id, val, max) {
        const ring = $(id);
        if(!ring) return;
        const circumference = 2 * Math.PI * 54;
        const percent = Math.min(val / max, 1);
        ring.style.strokeDashoffset = circumference * (1 - percent);
    }

    function updateUI(d) {
        currentAutoMode = d.auto;
        if (currentUser.perms.temp && $('temp')) { $('temp').textContent = d.temperature.toFixed(1); setRingProgress('ring_temp', d.temperature, 50); }
        if (currentUser.perms.hum && $('hum')) { $('hum').textContent = d.humidity.toFixed(1); setRingProgress('ring_hum', d.humidity, 100); }
        if (currentUser.perms.soil && $('soil')) { $('soil').textContent = d.soil; setRingProgress('ring_soil', d.soil, 100); }
        if (currentUser.perms.soil && $('soiltemp')) { $('soiltemp').textContent = d.soilTemp.toFixed(1); setRingProgress('ring_soiltemp', d.soilTemp, 50); }
        if (currentUser.perms.water && $('water')) { $('water').textContent = d.water; setRingProgress('ring_water', d.water, 100); }

        $('modeBadge').textContent = currentAutoMode ? 'AUTO MODE' : 'MANUAL MODE';
        $('modeBtn').textContent = currentAutoMode ? 'SWITCH TO MANUAL' : 'SWITCH TO AUTO';
        $('modeBtn').className = 'ctrl-btn ' + (currentAutoMode ? 'on' : '');
        
        $('fanBtn').textContent = `FAN: ${d.fan ? 'ON' : 'OFF'}`; $('fanBtn').className = 'ctrl-btn ' + (d.fan ? 'warn' : '') + (currentAutoMode ? ' locked' : '');
        $('ventBtn').textContent = `VENT: ${d.servo ? 'OPEN' : 'CLOSED'}`; $('ventBtn').className = 'ctrl-btn ' + (d.servo ? 'warn' : '') + (currentAutoMode ? ' locked' : '');
        $('pumpBtn').textContent = `PUMP: ${d.pump ? 'ACTIVE' : 'OFF'}`; $('pumpBtn').className = 'ctrl-btn ' + (d.pump ? 'danger' : '') + (currentAutoMode ? ' locked' : '');
        $('lightsBtn').textContent = `LIGHTS: ${d.lights ? 'ON' : 'OFF'}`; $('lightsBtn').className = 'ctrl-btn ' + (d.lights ? 'warn' : '') + (currentAutoMode ? ' locked' : '');
        $('heaterBtn').textContent = `HEATER: ${d.heater ? 'ON' : 'OFF'}`; $('heaterBtn').className = 'ctrl-btn ' + (d.heater ? 'warn' : '') + (currentAutoMode ? ' locked' : '');
        
        $('marqueeData').innerHTML = `<span>AIR: ${d.temperature.toFixed(1)}°C • SOIL: ${d.soilTemp.toFixed(1)}°C • HUM: ${d.humidity.toFixed(1)}% • MOIST: ${d.soil}% • TANK: ${d.water}% • HBRT AGRO TECH • </span><span>AIR: ${d.temperature.toFixed(1)}°C • SOIL: ${d.soilTemp.toFixed(1)}°C • HUM: ${d.humidity.toFixed(1)}% • MOIST: ${d.soil}% • TANK: ${d.water}% • HBRT AGRO TECH • </span>`;
        updateCharts(d);
    }

    function addRule() {
        const rules = JSON.parse(localStorage.getItem('abrt_rules') || '[]');
        rules.push({ param: $('ruleParam').value, op: $('ruleOperator').value, val: $('ruleValue').value, action: $('ruleAction').value });
        localStorage.setItem('abrt_rules', JSON.stringify(rules)); sendCmd({ type: 'rules', data: rules }); renderRules(); $('ruleValue').value = '';
    }
    function deleteRule(i) {
        const rules = JSON.parse(localStorage.getItem('abrt_rules') || '[]'); rules.splice(i, 1);
        localStorage.setItem('abrt_rules', JSON.stringify(rules)); sendCmd({ type: 'rules', data: rules }); renderRules();
    }
    function renderRules() {
        const rules = JSON.parse(localStorage.getItem('abrt_rules') || '[]');
        $('rulesList').innerHTML = rules.map((r, i) => `<div class="rule-item"><div class="logic">IF ${r.param.toUpperCase()} ${r.op} ${r.val} THEN ON ${r.action.toUpperCase()}</div><button class="delete-rule" onclick="deleteRule(${i})">DELETE</button></div>`).join('');
    }

    function switchView(name) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        $('view-' + name).classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`.nav-btn[data-view="${name}"]`).classList.add('active');
        if (name === 'data') renderTable();
        
        if (name === 'vision') {
            const camUrl = localStorage.getItem('cam_url');
            if (camUrl) { $('cameraStream').src = camUrl; $('camOverlay').style.display = 'none'; } 
            else { $('camOverlay').style.display = 'block'; }
        } else {
            $('cameraStream').src = '';
        }
    }

    function renderTable() {
        $('tableBody').innerHTML = allData.slice().reverse().map(r => `<tr><td>${r.time}</td><td>${r.temperature.toFixed(1)}</td><td>${r.humidity.toFixed(1)}</td><td>${r.soil}</td><td>${r.soilTemp.toFixed(1)}</td><td>${r.water}</td><td>${r.fan ? 'ON' : 'OFF'}</td><td>${r.pump ? 'ON' : 'OFF'}</td><td>${r.lights ? 'ON' : 'OFF'}</td><td>${r.heater ? 'ON' : 'OFF'}</td><td>${r.servo ? 'OPEN' : 'CLOSED'}</td></tr>`).join('');
        updateHistoryChart();
    }
    function exportCSV() {
        if (!allData.length) return alert("NO DATA.");
        let csv = "Time,AirTemp,Hum,Soil,SoilTemp,Water,Fan,Pump,Lights,Heater,Vent\n";
        allData.forEach(r => { csv += `${r.time},${r.temperature},${r.humidity},${r.soil},${r.soilTemp},${r.water},${r.fan},${r.pump},${r.lights},${r.heater},${r.servo}\n`; });
        const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "hbrt_backup.csv"; a.click();
    }
    function exportPDF() {
        if (!allData.length) return alert("NO DATA FOR PDF.");
        const { jsPDF } = window.jspdf; const doc = new jsPDF();
        doc.setFillColor(11, 20, 16); doc.rect(0, 0, 210, 40, 'F'); doc.setTextColor(57, 255, 20); doc.setFontSize(24); doc.text("HBRT GREENHOUSE REPORT", 105, 25, { align: 'center' });
        doc.setTextColor(0, 0, 0); doc.setFontSize(12); doc.text(`Date: ${new Date().toLocaleDateString()}`, 20, 50);
        const maxT = Math.max(...allData.map(r => r.temperature)); const minT = Math.min(...allData.map(r => r.temperature));
        const maxH = Math.max(...allData.map(r => r.humidity)); const minH = Math.min(...allData.map(r => r.humidity));
        const maxST = Math.max(...allData.map(r => r.soilTemp)); const minST = Math.min(...allData.map(r => r.soilTemp));
        doc.text(`Max Air: ${maxT.toFixed(1)}C | Min Air: ${minT.toFixed(1)}C`, 20, 60);
        doc.text(`Max Hum: ${maxH.toFixed(1)}% | Min Hum: ${minH.toFixed(1)}%`, 20, 70);
        doc.text(`Max Soil: ${maxST.toFixed(1)}C | Min Soil: ${minST.toFixed(1)}C`, 20, 80);
        const imgData = charts.hist.toBase64Image();
        doc.addImage(imgData, 'PNG', 20, 90, 170, 80);
        doc.setFontSize(10); doc.text("Generated by HBRT AgTech System", 105, 280, { align: 'center' });
        doc.save("HBRT_Greenhouse_Report.pdf");
    }

    function makeChart(ctx, datasets) {
        return new Chart(ctx, { type: 'line', data: { labels: [], datasets }, options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#E0E0E0', font: { family: 'Space Grotesk', size: 12 } } } }, scales: { x: { ticks: { color: '#7A9080', maxTicksLimit: 6 }, grid: { color: 'rgba(46, 139, 87, 0.1)' } }, y: { ticks: { color: '#7A9080' }, grid: { color: 'rgba(46, 139, 87, 0.1)' } } } } });
    }
    charts.th = makeChart($('chartTH').getContext('2d'), [{ label: 'Air Temp', data: [], borderColor: '#FF8C00', tension: .3, borderWidth: 2 }, { label: 'Hum', data: [], borderColor: '#39FF14', tension: .3, borderWidth: 2 }]);
    charts.sw = makeChart($('chartSW').getContext('2d'), [{ label: 'Soil Temp', data: [], borderColor: '#FFD700', tension: .3, borderWidth: 2 }, { label: 'Moisture', data: [], borderColor: '#2E8B57', tension: .3, borderWidth: 2 }, { label: 'Tank', data: [], borderColor: '#00aaff', tension: .3, borderWidth: 2 }]);
    charts.hist = makeChart($('chartHistory').getContext('2d'), [{ label: 'Air Temp', data: [], borderColor: '#FF8C00', tension: .3, borderWidth: 2 }, { label: 'Hum', data: [], borderColor: '#39FF14', tension: .3, borderWidth: 2 }, { label: 'Soil Moist', data: [], borderColor: '#2E8B57', tension: .3, borderWidth: 2 }, { label: 'Tank', data: [], borderColor: '#00aaff', tension: .3, borderWidth: 2 }, { label: 'Soil Temp', data: [], borderColor: '#FFD700', tension: .3, borderWidth: 2 }]);

    function updateCharts(d) {
        if(charts.th.data.labels.length > 30) { charts.th.data.labels.shift(); charts.sw.data.labels.shift(); charts.th.data.datasets[0].data.shift(); charts.th.data.datasets[1].data.shift(); charts.sw.data.datasets[0].data.shift(); charts.sw.data.datasets[1].data.shift(); charts.sw.data.datasets[2].data.shift(); }
        charts.th.data.labels.push(''); charts.sw.data.labels.push('');
        charts.th.data.datasets[0].data.push(d.temperature); charts.th.data.datasets[1].data.push(d.humidity);
        charts.sw.data.datasets[0].data.push(d.soilTemp); charts.sw.data.datasets[1].data.push(d.soil); charts.sw.data.datasets[2].data.push(d.water);
        charts.th.update('none'); charts.sw.update('none');
    }
    function updateHistoryChart() {
        const r = allData.slice(-100);
        charts.hist.data.labels = r.map(d => d.time); charts.hist.data.datasets[0].data = r.map(d => d.temperature);
        charts.hist.data.datasets[1].data = r.map(d => d.humidity); charts.hist.data.datasets[2].data = r.map(d => d.soil);
        charts.hist.data.datasets[3].data = r.map(d => d.water); charts.hist.data.datasets[4].data = r.map(d => d.soilTemp);
        charts.hist.update();
    }

    function saveSettings() { localStorage.setItem('lm_url', $('lmUrl').value); }
    function saveCamSettings() { localStorage.setItem('cam_url', $('camUrl').value); alert("CAMERA IP SAVED!"); }
    function loadSettings() { 
        $('lmUrl').value = localStorage.getItem('lm_url') || 'http://localhost:11434/v1/chat/completions'; 
        $('camUrl').value = localStorage.getItem('cam_url') || '';
    }

    async function askAI() {
        const url = $('lmUrl').value || 'http://localhost:11434/v1/chat/completions';
        const t = currentUser.perms.temp && $('temp') ? $('temp').textContent : "Hidden";
        const h = currentUser.perms.hum && $('hum') ? $('hum').textContent : "Hidden";
        const s = currentUser.perms.soil && $('soil') ? $('soil').textContent : "Hidden";
        const st = currentUser.perms.soil && $('soiltemp') ? $('soiltemp').textContent : "Hidden";
        const w = currentUser.perms.water && $('water') ? $('water').textContent : "Hidden";
        const q = $('aiIn').value || "Provide a 1 sentence system status summary.";
        const prompt = `You are an AI greenhouse core. Data: Air Temp=${t}C, Humidity=${h}%, Soil Moisture=${s}%, Soil Temp=${st}C, Water=${w}%. Question: ${q}`;
        callAI(url, prompt);
    }
    async function predictHarvest() {
        const url = $('lmUrl').value || 'http://localhost:11434/v1/chat/completions';
        if (allData.length < 10) return alert("NOT ENOUGH DATA. WAIT 20 SECONDS.");
        const avgT = (allData.reduce((a,b) => a + b.temperature, 0) / allData.length).toFixed(1);
        const avgH = (allData.reduce((a,b) => a + b.humidity, 0) / allData.length).toFixed(1);
        const avgS = (allData.reduce((a,b) => a + b.soil, 0) / allData.length).toFixed(1);
        const avgST = (allData.reduce((a,b) => a + b.soilTemp, 0) / allData.length).toFixed(1);
        const prompt = `You are an expert agronomist AI. Based on the greenhouse historical averages: Air Temp=${avgT}C, Humidity=${avgH}%, Soil Moisture=${avgS}%, Soil Temp=${avgST}C. Assuming these are tomato plants, predict the estimated harvest date from today and expected yield per square meter. Be concise.`;
        callAI(url, prompt);
    }
    async function callAI(url, prompt) {
        $('aiOut').textContent = "PROCESSING QUERY...";
        try {
            const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: "qwen2.5:1.5b", messages: [{role: "user", content: prompt}], temperature: 0.7 }) });
            const data = await res.json(); $('aiOut').textContent = data.choices[0].message.content;
        } catch (e) { $('aiOut').textContent = "ERROR: AI CORE UNREACHABLE AT " + url; }
    }

    function addUser() {
        const users = JSON.parse(localStorage.getItem('abrt_users'));
        users.push({ user: $('newUser').value, pass: $('newPass').value, role: $('newRole').value, perms: { temp: $('pTemp').checked, hum: $('pHum').checked, soil: $('pSoil').checked, water: $('pWater').checked } });
        localStorage.setItem('abrt_users', JSON.stringify(users)); renderUserTable(); $('newUser').value = ''; $('newPass').value = '';
    }
    function deleteUser(u) {
        if (u === 'admin') return alert("CANNOT DELETE ROOT ADMIN.");
        const users = JSON.parse(localStorage.getItem('abrt_users')).filter(x => x.user !== u);
        localStorage.setItem('abrt_users', JSON.stringify(users)); renderUserTable();
    }
    function renderUserTable() {
        const users = JSON.parse(localStorage.getItem('abrt_users'));
        $('userTableBody').innerHTML = users.map(u => `<tr><td>${u.user}</td><td>${u.role}</td><td>T:${u.perms.temp?1:0} H:${u.perms.hum?1:0} S:${u.perms.soil?1:0} W:${u.perms.water?1:0}</td><td>${u.user !== 'admin' ? `<button class="btn-primary" style="padding:4px 10px; background:var(--danger); color:#fff; border-radius:6px;" onclick="deleteUser('${u.user}')">DELETE</button>` : 'PROTECTED'}</td></tr>`).join('');
    }

    $('loginBtn').addEventListener('click', login);
    $('connectBtn').addEventListener('click', connectESP);
    $('logoutBtn').addEventListener('click', logout);
    $('exportCsvBtn').addEventListener('click', exportCSV);
    $('exportPdfBtn').addEventListener('click', exportPDF);
    $('saveSettingsBtn').addEventListener('click', saveSettings);
    $('saveCamBtn').addEventListener('click', saveCamSettings);
    $('askAiBtn').addEventListener('click', askAI);
    $('predictHarvestBtn').addEventListener('click', predictHarvest);
    $('addUserBtn').addEventListener('click', addUser);
    $('addRuleBtn').addEventListener('click', addRule);

    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
    $('modeBtn').addEventListener('click', () => sendCmd({device: 'auto', value: !currentAutoMode}));
    document.querySelectorAll('.ctrl-btn[data-device]').forEach(btn => btn.addEventListener('click', () => {
        const dev = btn.dataset.device; let state = false;
        if (dev === 'fan' || dev === 'servo' || dev === 'lights' || dev === 'heater') state = btn.classList.contains('warn');
        if (dev === 'pump') state = btn.classList.contains('danger');
        sendCmd({device: dev, value: !state});
    }));

    window.deleteUser = deleteUser; window.deleteRule = deleteRule;

    seedUsers();
    const savedIp = localStorage.getItem('esp_ip'); if (savedIp) $('ipInput').value = savedIp;
});
