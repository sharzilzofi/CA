import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
        
// NEW: Load the official Google Gen AI SDK
import { GoogleGenAI } from "https://esm.run/@google/genai";

const firebaseConfig = {
    apiKey: "AIzaSyAikuOjG8LoHC46ifrcx3Xn638AaU3NcI8",
    authDomain: "accounting-fe179.firebaseapp.com",
    projectId: "accounting-fe179",
    storageBucket: "accounting-fe179.firebasestorage.app",
    messagingSenderId: "1097908946191",
    appId: "1:1097908946191:web:d8a067b46b366a2417aa7a",
    measurementId: "G-SMZ1ZRHX32"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

let globalValidExcelData = [];
let fetchedTransactions = [];
window.ledgerFilters = { start: '', end: '', account: '', type: 'All' };

function showStatusMessage(message, isError = false) {
    const el = document.getElementById('de-status-message');
    el.textContent = message;
    el.className = `p-4 rounded border text-sm font-bold tracking-widest uppercase mb-6 block ${isError ? 'bg-neon-red/10 border-neon-red text-neon-red' : 'bg-neon-green/10 border-neon-green text-neon-green'}`;
    setTimeout(() => { el.classList.add('hidden'); }, 7000);
}

// ==========================================
// SMART AI ENTRY LOGIC (NEW GOOGLE GENAI SDK)
// ==========================================
window.processAIEntry = async function() {
    const inputField = document.getElementById('ai-prompt-input');
    const input = inputField.value.trim();
    if (!input) {
        showStatusMessage("Please describe a transaction first.", true);
        return;
    }

    const statusEl = document.getElementById('ai-status');
    const btn = document.getElementById('btn-ai-process');
    statusEl.classList.remove('hidden');
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');

    try {
        // Initialize using the newly provided SDK
        const ai = new GoogleGenAI({ apiKey: "AIzaSyAWy9YM0Sym_8HeIohGA-to5ryhMNTI4Jc" });

        const systemPrompt = `You are an intelligent accounting engine for a data-entry web app.
        Your job is ONLY to classify transactions based on natural descriptions and return a strict JSON object.
        
        Return exactly this JSON format:
        {
            "type": "Income" | "Expense" | "Asset" | "Liability" | "Equity",
            "account": "Suggested Chart of Accounts Name (e.g., Office Supplies, Cash)",
            "category": "Broad category name (e.g., Utilities, Operations)",
            "debit": Number (if this leg is a debit) OR null,
            "credit": Number (if this leg is a credit) OR null,
            "desc": "A short, clean description of the transaction"
        }
        
        Rules:
        - Deduce whether the primary transaction is a Debit or Credit based on standard double-entry accounting.
        - OUTPUT ONLY RAW JSON. Do not include markdown formatting, backticks, or the word "json".`;

        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Transaction to classify: "${input}"`,
            config: {
                systemInstruction: systemPrompt,
                temperature: 0.1
            }
        });

        let textResponse = response.text.trim();
        
        // Bulletproof JSON extraction to avoid markdown crashes
        const startIndex = textResponse.indexOf('{');
        const endIndex = textResponse.lastIndexOf('}');
        
        if (startIndex === -1 || endIndex === -1) {
            throw new Error("API did not return a valid JSON format.");
        }
        
        const jsonString = textResponse.substring(startIndex, endIndex + 1);
        const data = JSON.parse(jsonString);

        // Auto-fill the form elements securely
        document.getElementById('me-type').value = data.type || '';
        document.getElementById('me-account').value = data.account || '';
        document.getElementById('me-category').value = data.category || '';
        
        document.getElementById('me-debit').value = data.debit ? data.debit : '';
        document.getElementById('me-credit').value = data.credit ? data.credit : '';
        document.getElementById('me-desc').value = data.desc || input;

        // Set today's date if empty
        if (!document.getElementById('me-date').value) {
            document.getElementById('me-date').value = new Date().toISOString().split('T')[0];
        }

        showStatusMessage("AI analyzed successfully. Please review the populated fields below and click 'Record Transaction' to confirm.");
        
    } catch (err) {
        console.error("API Error: ", err);
        showStatusMessage("AI Processing failed: " + err.message, true);
    } finally {
        statusEl.classList.add('hidden');
        btn.disabled = false;
        btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
};

// ==========================================
// REALTIME SYNC (DASHBOARD, BS, CF, LEDGER)
// ==========================================
onSnapshot(collection(db, "transactions"), (snapshot) => {
    let totalRev = 0, totalExp = 0;
    let inflows = 0, outflows = 0;
    const monthlyData = {}; 
    const cfMonthly = {};
    const assetAccounts = {};
    const liabilityAccounts = {};
    const equityAccounts = {};
    let cfOperating = 0, cfInvesting = 0, cfFinancing = 0;

    fetchedTransactions = [];

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        data.id = docSnap.id;
        fetchedTransactions.push(data);

        const debit = parseFloat(data.debit) || 0;
        const credit = parseFloat(data.credit) || 0;
        const type = data.type;
        const account = data.account;
        const date = data.date; 

        // KPIs
        if (type === 'Income') totalRev += credit;
        else if (type === 'Expense') totalExp += debit;

        // BALANCE SHEET
        if (type === 'Asset') {
            if (!assetAccounts[account]) assetAccounts[account] = 0;
            assetAccounts[account] += (debit - credit);
        } 
        else if (type === 'Liability') {
            if (!liabilityAccounts[account]) liabilityAccounts[account] = 0;
            liabilityAccounts[account] += (credit - debit);
        } else if (type === 'Equity') {
            if (!equityAccounts[account]) equityAccounts[account] = 0;
            equityAccounts[account] += (credit - debit);
        }

        // CASH FLOW 
        const cashImpact = credit - debit;
        if (cashImpact > 0) inflows += cashImpact;
        else outflows += Math.abs(cashImpact);

        if (type === 'Income' || type === 'Expense') cfOperating += cashImpact;
        else if (type === 'Asset') cfInvesting += cashImpact;
        else if (type === 'Liability' || type === 'Equity') cfFinancing += cashImpact;

        // CHARTS
        if (date) {
            const month = date.substring(0, 7);
            if (!monthlyData[month]) monthlyData[month] = { rev: 0, exp: 0 };
            if (type === 'Income') monthlyData[month].rev += credit;
            if (type === 'Expense') monthlyData[month].exp += debit;

            if (!cfMonthly[month]) cfMonthly[month] = 0;
            cfMonthly[month] += cashImpact;
        }
    });

    // Retained Earnings
    const retainedEarnings = totalRev - totalExp;
    equityAccounts['Retained Earnings (Auto)'] = retainedEarnings;
    const netProfit = totalRev - totalExp;
    const cashBalance = inflows - outflows;

    // Render Dashboard
    document.getElementById('dash-revenue').innerText = `$${totalRev.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('dash-expenses').innerText = `$${totalExp.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('dash-profit').innerText = `$${netProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('dash-cash').innerText = `$${cashBalance.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // Updates
    renderBalanceSheet(assetAccounts, liabilityAccounts, equityAccounts);
    renderCashFlow(cfOperating, cfInvesting, cfFinancing, inflows, outflows, cfMonthly);
    fetchedTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    renderRecentTransactions();
    renderLedger();
    updateDashboardChart(monthlyData);
});

function renderBalanceSheet(assets, liabs, equity) {
    const renderList = (obj, containerId, highlightClass) => {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        let total = 0;
        Object.entries(obj).forEach(([name, balance]) => {
            if (balance === 0) return;
            total += balance;
            container.innerHTML += `
                <div class="flex justify-between text-sm text-text-main gap-4">
                    <span class="uppercase tracking-wider truncate">${name}</span>
                    <span class="font-bold ${balance < 0 ? highlightClass : ''} shrink-0">${balance < 0 ? '(' : ''}$${Math.abs(balance).toLocaleString(undefined, {minimumFractionDigits: 2})}${balance < 0 ? ')' : ''}</span>
                </div>`;
        });
        if (container.innerHTML === '') container.innerHTML = '<div class="text-xs text-text-muted text-center py-4">No accounts in this category.</div>';
        return total;
    };

    const totalAssets = renderList(assets, 'bs-assets-list', 'text-neon-cyan');
    const totalLiabs = renderList(liabs, 'bs-liab-list', 'text-neon-red');
    const totalEquity = renderList(equity, 'bs-equity-list', 'text-neon-green');

    document.getElementById('bs-total-assets').innerText = `$${totalAssets.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('bs-liab-total').innerText = `$${totalLiabs.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('bs-equity-total').innerText = `$${totalEquity.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    
    const liabEqSum = totalLiabs + totalEquity;
    document.getElementById('bs-total-liab-equity').innerText = `$${liabEqSum.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    const variance = totalAssets - liabEqSum;
    document.getElementById('bs-variance').innerText = `Variance: $${Math.abs(variance).toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    
    const statusBadge = document.getElementById('bs-status-badge');
    if (Math.abs(variance) < 0.01) {
        statusBadge.className = "flex items-center gap-2 text-neon-green border border-neon-green px-4 py-1.5 rounded-full inline-flex shadow-[0_0_5px_rgba(0,255,102,0.3)]";
        statusBadge.innerHTML = `<span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">check_circle</span><span class="text-xs font-bold tracking-widest uppercase">Balanced</span>`;
    } else {
        statusBadge.className = "flex items-center gap-2 text-neon-red border border-neon-red px-4 py-1.5 rounded-full inline-flex shadow-[0_0_5px_rgba(255,42,109,0.3)]";
        statusBadge.innerHTML = `<span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">warning</span><span class="text-xs font-bold tracking-widest uppercase">Unbalanced</span>`;
    }
}

function renderCashFlow(op, inv, fin, inTotal, outTotal, cfMonthly) {
    document.getElementById('cf-operating-net').innerText = `${op < 0 ? '(' : ''}$${Math.abs(op).toLocaleString(undefined, {minimumFractionDigits: 2})}${op < 0 ? ')' : ''}`;
    document.getElementById('cf-investing-net').innerText = `${inv < 0 ? '(' : ''}$${Math.abs(inv).toLocaleString(undefined, {minimumFractionDigits: 2})}${inv < 0 ? ')' : ''}`;
    document.getElementById('cf-financing-net').innerText = `${fin < 0 ? '(' : ''}$${Math.abs(fin).toLocaleString(undefined, {minimumFractionDigits: 2})}${fin < 0 ? ')' : ''}`;

    document.getElementById('cf-total-inflows').innerText = `$${inTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}`;
    document.getElementById('cf-total-outflows').innerText = `($${outTotal.toLocaleString(undefined, {minimumFractionDigits: 2})})`;

    const netEnding = op + inv + fin;
    document.getElementById('cf-ending-balance').innerText = `$${netEnding.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

    // Chart SVG Logic
    const pathTarget = document.getElementById('cf-chart-path');
    const labelsContainer = document.getElementById('cf-chart-labels');
    if(!pathTarget || !labelsContainer) return;
    
    const months = Object.keys(cfMonthly).sort();
    if (months.length === 0) {
        pathTarget.setAttribute('d', '');
        return;
    }

    const displayMonths = months.slice(-10);
    const w = 1000;
    const h = 200;
    
    let movingBal = 0;
    const plotData = [];
    displayMonths.forEach(m => {
        movingBal += cfMonthly[m];
        plotData.push({ month: m, val: movingBal });
    });

    let min = Math.min(...plotData.map(p => p.val));
    let max = Math.max(...plotData.map(p => p.val));
    if (min === max) { min -= 100; max += 100; }
    
    const paddingY = 40; 
    
    let d = "";
    let labelsHTML = "";
    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    plotData.forEach((point, i) => {
        const x = (i / Math.max(1, plotData.length - 1)) * w;
        const y = h - paddingY - ((point.val - min) / (max - min)) * (h - (paddingY * 2));
        
        if (i === 0) d += `M${x},${y} `;
        else d += `L${x},${y} `;

        const monthIdx = parseInt(point.month.split('-')[1]) - 1;
        labelsHTML += `<span style="position:absolute; left:${(x/w)*95}%; transform:translateX(-50%);">${monthNames[monthIdx]}</span>`;
    });

    pathTarget.setAttribute('d', d);
    labelsContainer.innerHTML = labelsHTML;
    labelsContainer.classList.remove('hidden');
}

function updateDashboardChart(monthlyData) {
    const container = document.getElementById('dash-chart-bars');
    const labelsContainer = document.getElementById('dash-chart-labels');
    if (!container || !labelsContainer) return;

    container.innerHTML = '';
    labelsContainer.innerHTML = '';

    const months = Object.keys(monthlyData).sort(); 
    if (months.length === 0) {
        container.innerHTML = '<div class="text-text-muted text-xs flex items-center justify-center w-full h-full">No chart data to display</div>';
        return;
    }

    const displayMonths = months.slice(-6);
    let maxVal = 0;
    displayMonths.forEach(m => {
        if (monthlyData[m].rev > maxVal) maxVal = monthlyData[m].rev;
        if (monthlyData[m].exp > maxVal) maxVal = monthlyData[m].exp;
    });

    if (maxVal === 0) maxVal = 1;

    const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

    displayMonths.forEach(m => {
        const revNum = monthlyData[m].rev;
        const expNum = monthlyData[m].exp;
        
        const revPct = Math.max((revNum / maxVal) * 100, 5); 
        const expPct = Math.max((expNum / maxVal) * 100, 5);

        const year = m.split('-')[0];
        const monthIdx = parseInt(m.split('-')[1]) - 1;
        const label = monthNames[monthIdx];

        container.innerHTML += `
            <div class="w-12 flex gap-1 items-end h-[100%]">
                <div class="w-1/2 bg-neon-cyan shadow-[0_0_5px_#00F3FF] rounded-t transition-all duration-500" style="height: ${revPct}%" title="Revenue: $${revNum.toLocaleString()}"></div>
                <div class="w-1/2 bg-neon-red shadow-[0_0_5px_#FF2A6D] rounded-t transition-all duration-500" style="height: ${expPct}%" title="Expense: $${expNum.toLocaleString()}"></div>
            </div>
        `;
        labelsContainer.innerHTML += `<span>${label}</span>`;
    });
}

window.applyLedgerFilters = function() {
    window.ledgerFilters.start = document.getElementById('ledger-filter-start').value;
    window.ledgerFilters.end = document.getElementById('ledger-filter-end').value;
    window.ledgerFilters.account = document.getElementById('ledger-filter-account').value.toLowerCase();
    window.ledgerFilters.type = document.getElementById('ledger-filter-type').value;
    renderLedger();
};

window.clearLedgerFilters = function() {
    document.getElementById('ledger-filter-start').value = '';
    document.getElementById('ledger-filter-end').value = '';
    document.getElementById('ledger-filter-account').value = '';
    document.getElementById('ledger-filter-type').value = 'All';
    window.applyLedgerFilters();
};

function renderLedger() {
    const tbody = document.getElementById('ledger-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    let filtered = fetchedTransactions.filter(tx => {
        if (window.ledgerFilters.start && tx.date < window.ledgerFilters.start) return false;
        if (window.ledgerFilters.end && tx.date > window.ledgerFilters.end) return false;
        if (window.ledgerFilters.account && !tx.account.toLowerCase().includes(window.ledgerFilters.account)) return false;
        if (window.ledgerFilters.type !== 'All' && tx.type !== window.ledgerFilters.type) return false;
        return true;
    });

    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

    let runningBalance = 0;
    const ledgerData = filtered.map(tx => {
        const d = parseFloat(tx.debit) || 0;
        const c = parseFloat(tx.credit) || 0;
        runningBalance = runningBalance + d - c;
        return { ...tx, balance: runningBalance };
    });

    ledgerData.reverse();

    if (ledgerData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-text-muted text-xs">No transactions match the criteria.</td></tr>';
        return;
    }

    ledgerData.forEach(tx => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-panel-border/30 transition-colors";
        
        let debitVal = tx.debit && parseFloat(tx.debit) > 0 ? `$${parseFloat(tx.debit).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-';
        let creditVal = tx.credit && parseFloat(tx.credit) > 0 ? `$${parseFloat(tx.credit).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-';
        let balVal = `$${tx.balance.toLocaleString(undefined, {minimumFractionDigits: 2})}`;

        tr.innerHTML = `
            <td class="px-6 py-4 text-xs text-text-main">${tx.date}</td>
            <td class="px-6 py-4 text-xs text-white font-bold">${tx.account} <span class="ml-2 border border-neon-cyan/30 text-neon-cyan px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest">${tx.type}</span></td>
            <td class="px-6 py-4 text-xs text-text-muted truncate max-w-[200px]">${tx.desc || '-'}</td>
            <td class="px-6 py-4 text-xs text-neon-cyan text-right font-bold">${debitVal}</td>
            <td class="px-6 py-4 text-xs text-neon-pink text-right font-bold">${creditVal}</td>
            <td class="px-6 py-4 text-xs text-white text-right">${balVal}</td>
        `;
        tbody.appendChild(tr);
    });
}

window.handleManualSubmit = async function(e) {
    e.preventDefault();
    const debitStr = document.getElementById('me-debit').value;
    const creditStr = document.getElementById('me-credit').value;
    const d = parseFloat(debitStr);
    const c = parseFloat(creditStr);

    if ((!debitStr && !creditStr) || ((isNaN(d) || d <= 0) && (isNaN(c) || c <= 0))) {
        showStatusMessage("Validation Error: Either Debit or Credit must be provided and greater than 0.", true);
        return;
    }

    const newTx = {
        date: document.getElementById('me-date').value,
        type: document.getElementById('me-type').value,
        account: document.getElementById('me-account').value,
        category: document.getElementById('me-category').value || '',
        debit: debitStr || '0',
        credit: creditStr || '0',
        desc: document.getElementById('me-desc').value,
        ref: document.getElementById('me-ref').value || '',
        createdAt: new Date()
    };

    try {
        await addDoc(collection(db, "transactions"), newTx);
        showStatusMessage("Transaction successfully saved to Firebase.");
        document.getElementById('manual-entry-form').reset();
        const aiField = document.getElementById('ai-prompt-input');
        if(aiField) aiField.value = '';
    } catch (error) {
        console.error("Error adding document: ", error);
        showStatusMessage("Error saving transaction.", true);
    }
};

window.deleteTransaction = async function(id) {
    if (confirm("Are you sure you want to delete this transaction record? This cannot be undone.")) {
        try {
            await deleteDoc(doc(db, "transactions", id));
            showStatusMessage("Transaction successfully deleted from Firebase.");
        } catch (error) {
            console.error("Error deleting document: ", error);
            showStatusMessage("Error deleting transaction.", true);
        }
    }
};

window.openEditModal = function(id) {
    const tx = fetchedTransactions.find(t => t.id === id);
    if(!tx) return;

    document.getElementById('edit-id').value = tx.id;
    document.getElementById('edit-date').value = tx.date;
    document.getElementById('edit-type').value = tx.type;
    document.getElementById('edit-account').value = tx.account;
    document.getElementById('edit-category').value = tx.category || '';
    document.getElementById('edit-debit').value = tx.debit || '';
    document.getElementById('edit-credit').value = tx.credit || '';
    document.getElementById('edit-desc').value = tx.desc || '';

    const modal = document.getElementById('edit-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
};

window.closeEditModal = function() {
    const modal = document.getElementById('edit-modal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.getElementById('edit-entry-form').reset();
};

window.handleEditSubmit = async function(e) {
    e.preventDefault();
    const id = document.getElementById('edit-id').value;
    const debitStr = document.getElementById('edit-debit').value;
    const creditStr = document.getElementById('edit-credit').value;
    
    if (!debitStr && !creditStr) {
        alert("Either Debit or Credit must be provided.");
        return;
    }

    try {
        const txRef = doc(db, "transactions", id);
        await updateDoc(txRef, {
            date: document.getElementById('edit-date').value,
            type: document.getElementById('edit-type').value,
            account: document.getElementById('edit-account').value,
            category: document.getElementById('edit-category').value,
            debit: debitStr || '0',
            credit: creditStr || '0',
            desc: document.getElementById('edit-desc').value
        });
        window.closeEditModal();
        showStatusMessage("Transaction successfully updated in Firebase.");
    } catch (error) {
        console.error("Error updating document: ", error);
        alert("Failed to update transaction.");
    }
};

function renderRecentTransactions() {
    const tbody = document.getElementById('recent-entries-body');
    tbody.innerHTML = '';

    if (fetchedTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-8 text-text-muted text-xs">No transactions found in Firebase.</td></tr>';
        return;
    }

    fetchedTransactions.slice(0, 50).forEach(tx => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-panel-border/30 transition-colors";
        
        let debitVal = tx.debit && parseFloat(tx.debit) > 0 ? `$${parseFloat(tx.debit).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-';
        let creditVal = tx.credit && parseFloat(tx.credit) > 0 ? `$${parseFloat(tx.credit).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-';

        tr.innerHTML = `
            <td class="px-6 py-4 text-xs text-text-main">${tx.date}</td>
            <td class="px-6 py-4"><span class="border border-neon-cyan/30 text-neon-cyan px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">${tx.type}</span></td>
            <td class="px-6 py-4 font-bold text-white text-xs">${tx.account}</td>
            <td class="px-6 py-4 text-xs text-text-muted truncate max-w-[200px]">${tx.desc}</td>
            <td class="px-6 py-4 text-right text-xs text-neon-cyan font-bold">${debitVal}</td>
            <td class="px-6 py-4 text-right text-xs text-neon-pink font-bold">${creditVal}</td>
            <td class="px-6 py-4 text-center">
                <div class="flex items-center justify-center gap-2">
                    <button onclick="window.openEditModal('${tx.id}')" class="text-text-muted hover:text-neon-cyan transition-colors" title="Edit">
                        <span class="material-symbols-outlined text-[18px]">edit</span>
                    </button>
                    <button onclick="window.deleteTransaction('${tx.id}')" class="text-text-muted hover:text-neon-red transition-colors" title="Delete">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}
        
window.downloadExcelTemplate = function() {
    const headers = "Date,Account Name,Description,Type,Debit,Credit,Category,Reference\n2024-01-01,Office Supplies,Pens and Paper,Expense,0,50.00,Stationery,INV-001";
    const blob = new Blob([headers], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transaction_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
};

window.handleFileUpload = function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, {raw: false});
        validateExcelData(json);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = ""; 
};

function validateExcelData(data) {
    const errorsPanel = document.getElementById('import-errors-panel');
    const errorsList = document.getElementById('import-errors-list');
    const previewPanel = document.getElementById('import-preview-panel');
    
    errorsList.innerHTML = '';
    errorsPanel.classList.add('hidden');
    previewPanel.classList.add('hidden');
    globalValidExcelData = [];

    const allowedTypes = ['Income', 'Expense', 'Asset', 'Liability', 'Equity'];
    let errors = [];

    if (data.length === 0) errors.push("The uploaded file is empty or missing headers.");

    data.forEach((row, index) => {
        let rowNum = index + 2; 
        let rowErrors = [];
        
        if (!row['Date'] || !row['Account Name'] || !row['Type']) {
            rowErrors.push("Missing required columns (Date, Account Name, Type).");
        } else {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(row['Date'])) rowErrors.push("Date must follow YYYY-MM-DD format.");
            if (!allowedTypes.includes(row['Type'])) rowErrors.push(`Type must be one of: ${allowedTypes.join(', ')}.`);

            let dStr = row['Debit'] || "";
            let cStr = row['Credit'] || "";
            let d = parseFloat(dStr.toString().replace(/,/g, ''));
            let c = parseFloat(cStr.toString().replace(/,/g, ''));
            
            let dProvided = dStr !== "" && !isNaN(d);
            let cProvided = cStr !== "" && !isNaN(c);

            if (!dProvided && !cProvided) {
                rowErrors.push("Debit or Credit value must be provided.");
            } else {
                if (dStr !== "" && (isNaN(d) || d < 0)) rowErrors.push("Debit must be numeric and non-negative.");
                if (cStr !== "" && (isNaN(c) || c < 0)) rowErrors.push("Credit must be numeric and non-negative.");
            }
        }

        if (rowErrors.length > 0) errors.push(`Row ${rowNum}: ${rowErrors.join(' | ')}`);
        else globalValidExcelData.push(row);
    });

    if (errors.length > 0) {
        errorsPanel.classList.remove('hidden');
        errors.forEach(err => {
            const li = document.createElement('li');
            li.textContent = err;
            errorsList.appendChild(li);
        });
    }

    if (globalValidExcelData.length > 0) renderPreviewTable();
}

function renderPreviewTable() {
    const previewPanel = document.getElementById('import-preview-panel');
    const tbody = document.getElementById('import-preview-body');
    const countLabel = document.getElementById('preview-count');
    
    tbody.innerHTML = '';
    countLabel.textContent = globalValidExcelData.length;

    globalValidExcelData.forEach(row => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-panel-border/30 transition-colors";
        
        let debitVal = row['Debit'] && row['Debit'] !== "0" ? `$${parseFloat(row['Debit']).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-';
        let creditVal = row['Credit'] && row['Credit'] !== "0" ? `$${parseFloat(row['Credit']).toLocaleString(undefined, {minimumFractionDigits: 2})}` : '-';

        tr.innerHTML = `
            <td class="px-4 py-3 text-text-main">${row['Date']}</td>
            <td class="px-4 py-3"><span class="border border-neon-cyan/30 text-neon-cyan px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest">${row['Type']}</span></td>
            <td class="px-4 py-3 font-bold text-white">${row['Account Name']}</td>
            <td class="px-4 py-3 text-text-muted truncate max-w-[150px]">${row['Description'] || '-'}</td>
            <td class="px-4 py-3 text-right text-neon-cyan font-bold">${debitVal}</td>
            <td class="px-4 py-3 text-right text-neon-pink font-bold">${creditVal}</td>
        `;
        tbody.appendChild(tr);
    });

    previewPanel.classList.remove('hidden');
}

window.commitImportedData = async function() {
    if (globalValidExcelData.length === 0) return;
    
    try {
        const batch = writeBatch(db);
        globalValidExcelData.forEach(row => {
            const newRef = doc(collection(db, "transactions"));
            batch.set(newRef, {
                date: row['Date'],
                type: row['Type'],
                account: row['Account Name'],
                category: row['Category'] || '',
                debit: row['Debit'] || '0',
                credit: row['Credit'] || '0',
                desc: row['Description'] || '',
                ref: row['Reference'] || '',
                createdAt: new Date()
            });
        });
        await batch.commit();

        showStatusMessage(`${globalValidExcelData.length} records successfully committed to Firebase.`);
        document.getElementById('import-preview-panel').classList.add('hidden');
        document.getElementById('import-errors-panel').classList.add('hidden');
        globalValidExcelData = [];
    } catch (error) {
        console.error("Error bulk adding documents: ", error);
        showStatusMessage("Failed to commit imported data to Firebase.", true);
    }
};