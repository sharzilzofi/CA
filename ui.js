function switchTab(tabId) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => tab.classList.remove('active'));
    const selectedTab = document.getElementById(tabId);
    if (selectedTab) selectedTab.classList.add('active');

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    const clickedItem = Array.from(navItems).find(item => item.getAttribute('onclick') === `switchTab('${tabId}')`);
    if (clickedItem) clickedItem.classList.add('active');
}

function switchIncomeStatement(format) {
    const tradView = document.getElementById('is-traditional-view');
    const contView = document.getElementById('is-contribution-view');
    const btnTrad = document.getElementById('btn-traditional');
    const btnCont = document.getElementById('btn-contribution');

    const activeClass = "px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors bg-neon-cyan text-base-bg shadow-[0_0_10px_rgba(0,243,255,0.3)]";
    const inactiveClass = "px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors text-text-muted hover:text-neon-cyan";

    if (format === 'traditional') {
        tradView.classList.remove('hidden');
        tradView.classList.add('block');
        contView.classList.remove('block');
        contView.classList.add('hidden');
        btnTrad.className = activeClass;
        btnCont.className = inactiveClass;
    } else {
        contView.classList.remove('hidden');
        contView.classList.add('block');
        tradView.classList.remove('block');
        tradView.classList.add('hidden');
        btnCont.className = activeClass;
        btnTrad.className = inactiveClass;
    }
}

function switchDataEntryTab(tab) {
    const manualView = document.getElementById('de-manual-view');
    const importView = document.getElementById('de-import-view');
    const btnManual = document.getElementById('btn-de-manual');
    const btnImport = document.getElementById('btn-de-import');
    const statusMsg = document.getElementById('de-status-message');
    
    statusMsg.classList.add('hidden');

    const activeClass = "px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors bg-neon-cyan text-base-bg shadow-[0_0_10px_rgba(0,243,255,0.3)]";
    const inactiveClass = "px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors text-text-muted hover:text-neon-cyan";

    if (tab === 'manual') {
        manualView.classList.remove('hidden');
        manualView.classList.add('block');
        importView.classList.remove('block');
        importView.classList.add('hidden');
        btnManual.className = activeClass;
        btnImport.className = inactiveClass;
    } else {
        importView.classList.remove('hidden');
        importView.classList.add('block');
        manualView.classList.remove('block');
        manualView.classList.add('hidden');
        btnImport.className = activeClass;
        btnManual.className = inactiveClass;
    }
}