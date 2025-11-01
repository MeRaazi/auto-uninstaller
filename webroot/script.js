window.addEventListener('DOMContentLoaded', () => {
    const API_HANDLER_PATH = "/data/adb/modules/auto-uninstaller/api_handler.sh";
    const CONF_DIR = "/data/adb/modules/AIB";
    const loadingOverlay = document.getElementById('loading-overlay');
    const mainContainer = document.querySelector('.container');
    const UI = {
        blacklist: document.getElementById('blacklist'),
        whitelist: document.getElementById('whitelist'),
        pkgInput: document.getElementById('package-input'),
        pkgInputWhitelist: document.getElementById('package-input-whitelist'),
        addBtn: document.getElementById('add-btn'),
        addWhitelistBtn: document.getElementById('add-whitelist-btn'),
        selectAllCheckbox: document.getElementById('select-all-checkbox'),
        selectAllWhitelistCheckbox: document.getElementById('select-all-whitelist-checkbox'),
        removeSelectedBtn: document.getElementById('remove-selected-btn'),
        removeSelectedWhitelistBtn: document.getElementById('remove-selected-whitelist-btn'),
        executionLogs: document.getElementById('execution-logs'),
        clearLogsBtn: document.getElementById('clear-logs-btn'),
        copyLogsBtn: document.getElementById('copy-logs-btn'),
        exportLogsBtn: document.getElementById('export-logs-btn'),
        aboutBtn: document.getElementById('about-btn'),
        reportBugBtn: document.getElementById('report-bug-btn'),
        aboutModal: document.getElementById('about-modal'),
        exportBlacklistBtn: document.getElementById('export-blacklist-btn'),
        exportWhitelistBtn: document.getElementById('export-whitelist-btn'),
        aggressiveModeToggle: document.getElementById('aggressive-mode-toggle-checkbox'),        
        serviceToggleBtn: document.getElementById('service-toggle-btn'),
        themeOptionsContainer: document.getElementById('theme-options-container'),
        openThemeModalBtn: document.getElementById('open-theme-modal-btn'),
        themeModal: document.getElementById('theme-modal'),
        closeThemeModalBtn: document.getElementById('close-theme-modal-btn'),
        topBar: document.querySelector('.top-bar'),
        bottomNav: document.querySelector('.bottom-nav'),
        viewInstalledAppsBtn: document.getElementById('view-installed-apps-btn'),
        installedAppsModal: document.getElementById('installed-apps-modal'),
        closeInstalledAppsModalBtn: document.getElementById('close-installed-apps-modal-btn'),
        installedAppsListContainer: document.getElementById('installed-apps-list-container'),
        nav: {
            home: document.getElementById('nav-home'),
            blacklist: document.getElementById('nav-blacklist'),
            whitelist: document.getElementById('nav-whitelist'),
            settings: document.getElementById('nav-settings'),
        },
        stats: {
            installed: document.getElementById('installed-apps-count'),
            blocklist: document.getElementById('blocklist-count'),
            whitelist: document.getElementById('whitelist-count'),
            serviceStatusIndicator: document.getElementById('service-status-indicator'),
            serviceStatusValue: document.getElementById('service-status-value'),
        },
    };

    let isServiceEnabled = false;

    const showToast = (message, isError = false, duration = 4000) => {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            document.querySelector('.container').appendChild(container);
        }

        const toast = document.createElement('div');
        const iconType = isError ? 'error' : 'success';
        toast.className = `toast ${iconType}`;
        
        toast.innerHTML = `
            <img src="assets/${iconType}.svg" alt="${iconType}" class="toast-icon icon-svg">
            <span>${message}</span>`;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 100);

        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => {
                toast.remove();
            });
        }, duration);
    };

    const addLogEntry = (message, type = 'info') => {
        if (!UI.executionLogs) return;

        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${type}`;

        const timestamp = new Date().toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        logEntry.innerHTML = `
            <span class="log-time">[${timestamp}]</span>
            <span class="log-message">${message}</span>
        `;

        UI.executionLogs.appendChild(logEntry);
        UI.executionLogs.scrollTop = UI.executionLogs.scrollHeight;
    };

    const clearLogs = () => {
        if (UI.executionLogs) {
            UI.executionLogs.innerHTML = '';
            addLogEntry('Logs cleared', 'info');
        }
    };

    const copyLogs = () => {
        if (UI.executionLogs) {
            navigator.clipboard.writeText(UI.executionLogs.innerText)
                .then(() => showToast('Logs copied to clipboard.', false))
                .catch(err => showToast('Failed to copy logs.', true));
        }
    };

    const isKSU = typeof ksu !== 'undefined' && ksu.exec;

    const runCommand = async (command) => {
        try {
            addLogEntry(`Executing: ${command}`, 'info');
            let result;
            if (isKSU) {
                result = await ksu.exec(command);
            } else {
                // Fallback for Magisk using su
                const suCommand = `su -c "${command.replace(/"/g, '\\"')}"`;
                const response = await fetch('/execute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `command=${encodeURIComponent(suCommand)}`
                });
                result = await response.text();
            }
            result = result || '';
            addLogEntry(`Command completed successfully`, 'success');
            if (result && result.trim()) {
                addLogEntry(`Output: ${result.trim()}`, 'info');
            }
            return { stdout: result, errno: 0, stderr: '' };
        } catch (error) {
            const errorMessage = (error && error.message) ? error.message : "An unknown error occurred during command execution.";
            addLogEntry(`Error: ${errorMessage}`, 'error');
            showToast(errorMessage, true);
            throw new Error(errorMessage);
        }
    };

    const fetchApiLogs = async () => {
        try {
            const result = await ksu.exec(`cat ${CONF_DIR}/auto-uninstaller-api.log 2>/dev/null || echo ""`);
            if (result && result.trim()) {
                const lines = result.trim().split('\n').slice(-10);
                lines.forEach(line => {
                    if (line.trim()) {
                        addLogEntry(`[API] ${line}`, 'info');
                    }
                });
            }
        } catch (error) {}
    };

    const updateUiState = (listType = 'blocklist') => {
        const listEl = listType === 'blocklist' ? UI.blacklist : UI.whitelist;
        const removeBtn = listType === 'blocklist' ? UI.removeSelectedBtn : UI.removeSelectedWhitelistBtn;
        const selectAllCheckbox = listType === 'blocklist' ? UI.selectAllCheckbox : UI.selectAllWhitelistCheckbox;

        const checkboxes = listEl.querySelectorAll('input[type="checkbox"]');
        const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
        const totalCount = checkboxes.length;

        removeBtn.style.display = totalCount > 0 ? 'flex' : 'none';
        removeBtn.disabled = checkedCount === 0;

        const removeSpan = removeBtn.querySelector('span');
        if (removeSpan) {
            removeSpan.textContent = checkedCount > 0 ? `Remove Selected (${checkedCount})` : `Remove`;
        }

        const selectAllContainer = selectAllCheckbox.closest('.select-all-container');
        if (selectAllContainer) {
            selectAllContainer.style.display = totalCount > 0 ? 'flex' : 'none';
        }
        
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = (checkedCount === totalCount && totalCount > 0);
        }
    };    

    const updateServiceStatus = async () => {
        const blocklistCount = parseInt(UI.stats.blocklist.textContent, 10) || 0;
        const isAggressiveModeActive = UI.aggressiveModeToggle.checked;

        let statusText = 'Idle';
        let statusColor = 'var(--color-danger)';

        if (!isServiceEnabled) {
            statusText = 'Disabled';
        } else {
            if (isAggressiveModeActive) {
                statusText = 'Aggressive';
            } else if (blocklistCount > 0) {
                statusText = 'Blacklist';
            }
            statusColor = 'var(--color-success)';
        }

        if (UI.stats.serviceStatusValue) {
            UI.stats.serviceStatusValue.textContent = statusText;
        }

        if (UI.stats.serviceStatusIndicator) {
            UI.stats.serviceStatusIndicator.style.backgroundColor = statusColor;
        }

        if (UI.serviceToggleBtn) {
            isServiceEnabled
                ? UI.serviceToggleBtn.classList.add('active')
                : UI.serviceToggleBtn.classList.remove('active');
        }
    };

    const fetchBlocklist = async () => {
        UI.blacklist.innerHTML = '<li><span style="color: var(--color-text-secondary);">Connecting...</span></li>';
        addLogEntry('Loading blocklist...', 'info');
        try {
            const { stdout } = await runCommand(`sh ${API_HANDLER_PATH} get`);
            const packages = stdout
                .split(',')
                .map(p => p.trim())
                .filter(p => p.length > 0)
                .sort();
            UI.blacklist.innerHTML = '';
            if (packages.length === 0) {
                UI.blacklist.innerHTML = '<li><span style="color: var(--color-text-secondary);">Blocklist is empty.</span></li>';
            } else {
                packages.forEach(pkg => {
                    const li = document.createElement('li');
                    const cleanPkg = pkg.replace(/"/g, '&quot;');
                    li.innerHTML = `
                        <label class="custom-checkbox">
                            <input type="checkbox" class="pkg-checkbox" data-pkg-name="${cleanPkg}" title="Select ${cleanPkg}">
                            <img src="assets/untick.svg" alt="Untick" class="icon-untick icon-svg">
                            <img src="assets/tick.svg" alt="Tick" class="icon-tick icon-svg">
                        </label>
                        <span class="pkg-name">${cleanPkg}</span>
                    `;
                    li.querySelector('input').addEventListener('change', () => updateUiState('blocklist'));
                    UI.blacklist.appendChild(li);
                });
            }
            addLogEntry(`Blocklist loaded: ${packages.length} package(s)`, 'success');
            if (UI.stats.blocklist) UI.stats.blocklist.textContent = packages.length;
            await updateServiceStatus();
        } catch (error) {
            showToast(error.message || "Could not load blocklist.", true);
            UI.blacklist.innerHTML = `<li><span style="color: var(--color-error);">Could not load blocklist. Check logs.</span></li>`;
            addLogEntry(`Failed to load blocklist: ${error.message}`, 'error');
        }

        updateUiState('blocklist');
    };

    const fetchWhitelist = async () => {
        UI.whitelist.innerHTML = '<li><span style="color: var(--color-text-secondary);">Connecting...</span></li>';
        addLogEntry('Loading whitelist...', 'info');
        try {
            const { stdout } = await runCommand(`sh ${API_HANDLER_PATH} get_whitelist`);
            const packages = stdout
                .split(',')
                .map(p => p.trim())
                .filter(p => p.length > 0)
                .sort();
            UI.whitelist.innerHTML = '';
            if (packages.length === 0) {
                UI.whitelist.innerHTML = '<li><span style="color: var(--color-text-secondary);">Whitelist is empty.</span></li>';
            } else {
                packages.forEach(pkg => {
                    const li = document.createElement('li');
                    const cleanPkg = pkg.replace(/"/g, '&quot;');
                    li.innerHTML = `
                        <label class="custom-checkbox">
                            <input type="checkbox" class="pkg-checkbox" data-pkg-name="${cleanPkg}" title="Select ${cleanPkg}">
                            <img src="assets/untick.svg" alt="Untick" class="icon-untick icon-svg">
                            <img src="assets/tick.svg" alt="Tick" class="icon-tick icon-svg">
                        </label>
                        <span class="pkg-name">${cleanPkg}</span>
                    `;
                    li.querySelector('input').addEventListener('change', () => updateUiState('whitelist'));
                    UI.whitelist.appendChild(li);
                });
            }
            addLogEntry(`Whitelist loaded: ${packages.length} package(s)`, 'success');
            if (UI.stats.whitelist) UI.stats.whitelist.textContent = packages.length;
        } catch (error) {
            showToast(error.message || "Could not load whitelist.", true);
            UI.whitelist.innerHTML = `<li><span style="color: var(--color-error);">Could not load whitelist. Check logs.</span></li>`;
            addLogEntry(`Failed to load whitelist: ${error.message}`, 'error');
        }
        updateUiState('whitelist');
    };

    const fetchInstalledAppsCount = async () => {
        if (!UI.stats.installed) return;
        UI.stats.installed.textContent = '...';
        try {
            const { stdout } = await runCommand(`pm list packages -3 | wc -l`);
            const count = parseInt(stdout.trim(), 10);
            UI.stats.installed.textContent = isNaN(count) ? 'N/A' : count;
        } catch (error) {
            UI.stats.installed.textContent = 'N/A';
        }
    };


    const addPackage = async () => {
        const pkg = UI.pkgInput.value.trim().toLowerCase();
        UI.pkgInput.value = pkg;
        if (!pkg) {
            return showToast("Package name cannot be empty.", true);
        }
        if (!/^[a-z]+(\.[a-z0-9_]+)+$/i.test(pkg)) {
            return showToast("Invalid package name format.", true);
        }
        const currentPackages = Array.from(UI.blacklist.querySelectorAll('.pkg-checkbox')).map(cb => cb.dataset.pkgName);
        if (currentPackages.includes(pkg)) {
            return showToast(`Package is already in the blocklist.`, true);
        }

        const whitelistPackages = Array.from(UI.whitelist.querySelectorAll('.pkg-checkbox')).map(cb => cb.dataset.pkgName);

        UI.addBtn.disabled = true;
        UI.addBtn.querySelector('span').textContent = 'Adding...';
        addLogEntry(`Adding package: ${pkg}`, 'info');
        try {
            if (whitelistPackages.includes(pkg)) {
                await runCommand(`sh ${API_HANDLER_PATH} remove_whitelist "${pkg}"`);
                addLogEntry(`Removed "${pkg}" from whitelist`, 'info');
                await fetchWhitelist();
            }

            await runCommand(`sh ${API_HANDLER_PATH} add "${pkg}"`);
            showToast(`Package added to blocklist.`, false);
            addLogEntry(`Package "${pkg}" added to blocklist successfully`, 'success');
            await fetchBlocklist();

            UI.pkgInput.value = '';
        } catch (error) {
            showToast(error.message, true);
            addLogEntry(`Failed to add package: ${error.message}`, 'error');
        } finally {
            UI.addBtn.disabled = false;
            UI.addBtn.querySelector('span').textContent = 'Add';
        }
    };

    const addWhitelistPackage = async () => {
        const pkg = UI.pkgInputWhitelist.value.trim().toLowerCase();
        UI.pkgInputWhitelist.value = pkg;
        if (!pkg) return showToast("Package name cannot be empty.", true);
        if (!/^[a-z]+(\.[a-z0-9_]+)+$/i.test(pkg)) return showToast("Invalid package name format.", true);

        const currentPackages = Array.from(UI.whitelist.querySelectorAll('.pkg-checkbox')).map(cb => cb.dataset.pkgName);
        if (currentPackages.includes(pkg)) return showToast(`Package is already in the whitelist.`, true);

        const blocklistPackages = Array.from(UI.blacklist.querySelectorAll('.pkg-checkbox')).map(cb => cb.dataset.pkgName);

        UI.addWhitelistBtn.disabled = true;
        UI.addWhitelistBtn.querySelector('span').textContent = 'Adding...';
        addLogEntry(`Adding package to whitelist: ${pkg}`, 'info');

        try {
            if (blocklistPackages.includes(pkg)) {
                await runCommand(`sh ${API_HANDLER_PATH} remove "${pkg}"`);
                addLogEntry(`Removed "${pkg}" from blocklist`, 'info');
                await fetchBlocklist();
            }

            await runCommand(`sh ${API_HANDLER_PATH} add_whitelist "${pkg}"`);
            showToast(`Package added to whitelist.`, false);
            addLogEntry(`Package "${pkg}" added to whitelist successfully`, 'success');
            await fetchWhitelist();

            UI.pkgInputWhitelist.value = '';
        } catch (error) {
            showToast(error.message, true);
            addLogEntry(`Failed to add package to whitelist: ${error.message}`, 'error');
        } finally {
            UI.addWhitelistBtn.disabled = false;
            UI.addWhitelistBtn.querySelector('span').textContent = 'Add';
        }
    };

    const fetchAggressiveModeStatus = async () => {
        try {
            const { stdout } = await runCommand(`sh ${API_HANDLER_PATH} get_aggressive_mode_status`);
            const isEnabled = stdout.trim() === 'true';
            UI.aggressiveModeToggle.checked = isEnabled;
            addLogEntry(`Aggressive Mode is ${isEnabled ? 'enabled' : 'disabled'}.`, 'info');
            await updateServiceStatus();
        } catch (error) {
            showToast("Could not fetch Aggressive Mode status.", true);
            addLogEntry(`Failed to get Aggressive Mode status: ${error.message}`, 'error');
        }
    };

    const setAggressiveModeStatus = async (isEnabled) => {
        try {
            await runCommand(`sh ${API_HANDLER_PATH} set_aggressive_mode_status ${isEnabled}`);
            const status = isEnabled ? 'enabled' : 'disabled';
            showToast(`Aggressive Mode has been ${status}.`, false);
            addLogEntry(`Aggressive Mode ${status}.`, 'success');
            await updateServiceStatus();
        } catch (error) {
            showToast("Failed to update Aggressive Mode status.", true);
            addLogEntry(`Failed to set Aggressive Mode status: ${error.message}`, 'error');
            UI.aggressiveModeToggle.checked = !isEnabled;
        }
    };

    const fetchServiceStatus = async () => {
        try {
            const { stdout } = await runCommand(`sh ${API_HANDLER_PATH} get_service_status`);
            isServiceEnabled = stdout.trim() === 'true';
            addLogEntry(`Auto-Uninstaller service is ${isServiceEnabled ? 'enabled' : 'disabled'}.`, 'info');
            await updateServiceStatus();
        } catch (error) {
            showToast("Could not fetch service status.", true);
            addLogEntry(`Failed to get service status: ${error.message}`, 'error');
        }
    };

    const toggleServiceStatus = async () => {
        const newStatus = !isServiceEnabled;
        try {
            await runCommand(`sh ${API_HANDLER_PATH} set_service_status ${newStatus}`);
            const status = newStatus ? 'enabled' : 'disabled';
            showToast(`Auto-Uninstaller service has been ${status}.`, false);
            addLogEntry(`Service ${status}.`, 'success');
            isServiceEnabled = newStatus;
            await updateServiceStatus();
        } catch (error) {
            showToast("Failed to update service status.", true);
            addLogEntry(`Failed to set service status: ${error.message}`, 'error');
        }
    };

    const removeSelectedPackages = async () => {
        const removeBtn = UI.removeSelectedBtn;
        const checkboxes = Array.from(UI.blacklist.querySelectorAll('.pkg-checkbox:checked'));
        const packagesToRemove = checkboxes.map(cb => cb.dataset.pkgName);
        if (packagesToRemove.length === 0) {
            return showToast("No packages selected.", true);
        }
        if (removeBtn) {
            removeBtn.disabled = true;
            removeBtn.querySelector('span').textContent = 'Removing...';
        }
        addLogEntry(`Removing ${packagesToRemove.length} package(s)...`, 'info');
        try {
            const packageArgs = packagesToRemove.join(' ');
            const command = `sh ${API_HANDLER_PATH} remove ${packageArgs}`;
            await runCommand(command);
            showToast(`${packagesToRemove.length} package(s) removed.`, false);
            addLogEntry(`${packagesToRemove.length} package(s) removed successfully`, 'success');
            await fetchBlocklist(); // This will call updateServiceStatus
            updateServiceStatus();
        } catch (error) {
            showToast(error.message || "An error occurred during removal.", true);
            addLogEntry(`Failed to remove packages: ${error.message}`, 'error');
        } finally {
            if (removeBtn) {
                removeBtn.disabled = false;
                removeBtn.querySelector('span').textContent = 'Remove Selected';
            }
            updateUiState('blocklist');
        }
    };

    const removeSelectedWhitelistPackages = async () => {
        const removeBtn = UI.removeSelectedWhitelistBtn;
        const checkboxes = Array.from(UI.whitelist.querySelectorAll('.pkg-checkbox:checked'));
        const packagesToRemove = checkboxes.map(cb => cb.dataset.pkgName);
        if (packagesToRemove.length === 0) {
            return showToast("No packages selected from whitelist.", true);
        }
        if (removeBtn) {
            removeBtn.disabled = true;
            removeBtn.querySelector('span').textContent = 'Removing...';
        }
        addLogEntry(`Removing ${packagesToRemove.length} package(s) from whitelist...`, 'info');
        try {
            const packageArgs = packagesToRemove.join(' ');
            const command = `sh ${API_HANDLER_PATH} remove_whitelist ${packageArgs}`;
            await runCommand(command);
            showToast(`${packagesToRemove.length} package(s) removed from whitelist.`, false);
            addLogEntry(`${packagesToRemove.length} package(s) removed from whitelist successfully`, 'success');
            await fetchWhitelist();
        } catch (error) {
            showToast(error.message || "An error occurred during removal.", true);
            addLogEntry(`Failed to remove packages from whitelist: ${error.message}`, 'error');
        } finally {
            if (removeBtn) {
                removeBtn.disabled = false;
                removeBtn.querySelector('span').textContent = 'Remove Selected';
            }
            updateUiState('whitelist');
        }
    };

    const exportLogs = async () => {
        const sourceLogPath = `${CONF_DIR}/auto-uninstaller-api.log`;
        const destDir = "/sdcard/Download";
        const destLogPath = `${destDir}/Auto-Uninstaller.log`;

        if (UI.exportLogsBtn) UI.exportLogsBtn.disabled = true;
        UI.exportLogsBtn.querySelector('span').textContent = 'Exporting...';
        addLogEntry(`Attempting to export logs to ${destLogPath}`, 'info');

        try {
            const command = `mkdir -p ${destDir} && cp ${sourceLogPath} ${destLogPath}`;
            await runCommand(command);

            showToast(`Logs exported to Downloads folder.`, false);
            addLogEntry(`Logs exported to Downloads folder.`, 'success');
        } catch (error) {
            const errorMessage = error.message || "Failed to export logs. The log file may not exist yet.";
            showToast(errorMessage, true);
            addLogEntry(`Log export failed: ${errorMessage}`, 'error');
        } finally {
            if (UI.exportLogsBtn) UI.exportLogsBtn.disabled = false;
            UI.exportLogsBtn.querySelector('span').textContent = 'Export Logs';
        }
    };

    const exportList = async (listType) => {
        const listEl = listType === 'blocklist' ? UI.blacklist : UI.whitelist;
        const packages = Array.from(listEl.querySelectorAll('.pkg-checkbox')).map(cb => cb.dataset.pkgName);

        if (packages.length === 0) {
            return showToast(`The ${listType} is empty. Nothing to export.`, true);
        }

        const exportBtn = listType === 'blocklist' ? UI.exportBlacklistBtn : UI.exportWhitelistBtn;
        exportBtn.disabled = true;

        const content = packages.join('\n');
        const destDir = "/sdcard/Download";
        const destFile = `${destDir}/app-${listType}-export.txt`;

        addLogEntry(`Exporting ${listType} to ${destFile}`, 'info');

        try {
            const command = `mkdir -p ${destDir} && cat > ${destFile} << EOF\n${content}\nEOF`;
            await runCommand(command);

            const capitalized_tst = listType.charAt(0).toUpperCase() + listType.slice(1);
            showToast(`${capitalized_tst} exported to Downloads folder.`, false);
            addLogEntry(`${listType} exported successfully.`, 'success');
        } catch (error) {
            const errorMessage = error.message || `Failed to export ${listType}.`;
            showToast(errorMessage, true);
            addLogEntry(`Export failed: ${errorMessage}`, 'error');
        } finally {
            exportBtn.disabled = false;
        }
    };

    const openInstalledAppsModal = async () => {
        UI.installedAppsModal.style.display = 'flex';
        UI.installedAppsListContainer.innerHTML = '<p>Loading installed apps...</p>';

        try {
            const { stdout: installedAppsCsv } = await runCommand(`sh ${API_HANDLER_PATH} get_installed_apps`);
            const installedApps = installedAppsCsv.split(',').filter(p => p.trim());

            const { stdout: whitelistCsv } = await runCommand(`sh ${API_HANDLER_PATH} get_whitelist`);
            const whitelistApps = new Set(whitelistCsv.split(',').filter(p => p.trim()));

            const { stdout: blocklistCsv } = await runCommand(`sh ${API_HANDLER_PATH} get`);
            const blocklistApps = new Set(blocklistCsv.split(',').filter(p => p.trim()));

            UI.installedAppsListContainer.innerHTML = '';

            if (installedApps.length === 0) {
                UI.installedAppsListContainer.innerHTML = '<p>No third-party apps found.</p>';
                return;
            }

            installedApps.forEach(pkg => {
                const isWhitelisted = whitelistApps.has(pkg);
                const isBlocklisted = blocklistApps.has(pkg);
                const itemDiv = document.createElement('div');
                itemDiv.className = 'installed-app-item';
                itemDiv.dataset.pkgName = pkg;

                let statusHtml = '';
                if (isWhitelisted) {
                    statusHtml = '<span class="pkg-status whitelisted">Whitelisted</span>';
                } else if (isBlocklisted) {
                    statusHtml = '<span class="pkg-status blocklisted">On Blacklist</span>';
                }

                itemDiv.innerHTML = `
                    <div class="installed-app-info">
                        <span class="pkg-name">${pkg}</span>
                        ${statusHtml}
                    </div>
                    <button class="add-app-btn" ${isWhitelisted ? 'disabled' : ''}>${isWhitelisted ? 'Added' : 'Add'}</button>
                `;
                UI.installedAppsListContainer.appendChild(itemDiv);
            });

        } catch (error) {
            UI.installedAppsListContainer.innerHTML = `<p style="color: var(--color-error);">Failed to load apps: ${error.message}</p>`;
        }
    };

    const addSingleAppToWhitelist = async (e) => {
        if (!e.target.classList.contains('add-app-btn')) return;

        const button = e.target;
        const itemDiv = button.closest('.installed-app-item');
        const pkg = itemDiv.dataset.pkgName;

        button.disabled = true;
        button.textContent = 'Adding...';

        try {
            await runCommand(`sh ${API_HANDLER_PATH} remove "${pkg}"`);
            await runCommand(`sh ${API_HANDLER_PATH} add_whitelist "${pkg}"`);

            showToast(`Added ${pkg} to whitelist.`, false);
            button.textContent = 'Added';

            const infoDiv = itemDiv.querySelector('.installed-app-info');
            infoDiv.querySelector('.pkg-status')?.remove();
            infoDiv.insertAdjacentHTML('beforeend', '<span class="pkg-status whitelisted">Whitelisted</span>');
            await fetchWhitelist();
            await fetchBlocklist();
        } catch (error) {
            showToast(`Failed to add ${pkg}: ${error.message}`, true);
            button.disabled = false;
            button.textContent = 'Add';
        }
    };
    
    const navigateTo = (pageId) => {
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        const targetPage = document.getElementById(pageId);
        if (targetPage) {
            targetPage.classList.add('active');
        }

        Object.values(UI.nav).forEach(btn => {
            btn.classList.remove('active');
        });

        const navId = pageId.replace('-page', '');
        const activeBtnId = `nav-${navId}`;

        const activeBtn = document.getElementById(activeBtnId);
        if (activeBtn) {
            activeBtn.classList.add('active');
        }
    };

    UI.addBtn.addEventListener('click', addPackage);
    UI.pkgInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') addPackage(); });
    UI.addWhitelistBtn.addEventListener('click', addWhitelistPackage);
    UI.pkgInputWhitelist.addEventListener('keypress', (e) => { if (e.key === 'Enter') addWhitelistPackage(); });
    UI.removeSelectedBtn.addEventListener('click', removeSelectedPackages);
    UI.removeSelectedWhitelistBtn.addEventListener('click', removeSelectedWhitelistPackages);

    UI.exportBlacklistBtn.addEventListener('click', () => exportList('blocklist'));
    UI.exportWhitelistBtn.addEventListener('click', () => exportList('whitelist'));


    if (UI.selectAllCheckbox) {
        UI.selectAllCheckbox.addEventListener('change', (e) => {
            UI.blacklist.querySelectorAll('.pkg-checkbox').forEach(cb => { cb.checked = e.target.checked; });
            updateUiState('blocklist');
        });
    }

    if (UI.selectAllWhitelistCheckbox) {
        UI.selectAllWhitelistCheckbox.addEventListener('change', (e) => {
            UI.whitelist.querySelectorAll('.pkg-checkbox').forEach(cb => { cb.checked = e.target.checked; });
            updateUiState('whitelist');
        });
    }

    if (UI.clearLogsBtn) {
        UI.clearLogsBtn.addEventListener('click', clearLogs);
    }

    if (UI.copyLogsBtn) {
        UI.copyLogsBtn.addEventListener('click', copyLogs);
    }

    if (UI.exportLogsBtn) {
        UI.exportLogsBtn.addEventListener('click', exportLogs);
    }

    if (UI.reportBugBtn) {
        UI.reportBugBtn.addEventListener('click', () => {
            window.open('https://github.com/meerazi/auto-uninstaller/issues', '_blank');
        });
    }

    if (UI.aboutBtn && UI.aboutModal) {
        UI.aboutBtn.addEventListener('click', () => {
            UI.aboutModal.style.display = 'flex';
        });

        UI.aboutModal.addEventListener('click', (e) => {
            if (e.target === UI.aboutModal) UI.aboutModal.style.display = 'none';
        });

        UI.aboutModal.querySelector('.close-btn').addEventListener('click', () => UI.aboutModal.style.display = 'none'); // This still works as we have a .close-btn
    }

    if (UI.viewInstalledAppsBtn) {
        UI.viewInstalledAppsBtn.addEventListener('click', openInstalledAppsModal);
        UI.closeInstalledAppsModalBtn.addEventListener('click', () => UI.installedAppsModal.style.display = 'none');
        UI.installedAppsModal.addEventListener('click', (e) => {
            if (e.target === UI.installedAppsModal) UI.installedAppsModal.style.display = 'none';
        });
        UI.installedAppsListContainer.addEventListener('click', addSingleAppToWhitelist);

        const installedAppsFilter = document.getElementById('installed-apps-filter');
        installedAppsFilter.addEventListener('input', (e) => {
            const filterText = e.target.value.toLowerCase();
            const appItems = UI.installedAppsListContainer.querySelectorAll('.installed-app-item');
            appItems.forEach(item => {
                const pkgName = item.dataset.pkgName.toLowerCase();
                if (pkgName.includes(filterText)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }

    UI.nav.home.addEventListener('click', () => navigateTo('home-page'));
    UI.nav.blacklist.addEventListener('click', () => navigateTo('blacklist-page'));
    UI.nav.whitelist.addEventListener('click', () => navigateTo('whitelist-page'));
    UI.nav.settings.addEventListener('click', () => navigateTo('settings-page'));


    if (UI.aggressiveModeToggle) {
        UI.aggressiveModeToggle.addEventListener('change', (e) => setAggressiveModeStatus(e.target.checked));
    }

    if (UI.serviceToggleBtn) {
        UI.serviceToggleBtn.addEventListener('click', toggleServiceStatus);
    }

    const setTheme = (theme) => {
        if (theme === 'system') {
            const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
        localStorage.setItem('app-theme', theme);
    };

    const initializeApp = async () => {
        const savedTheme = localStorage.getItem('app-theme') || 'system';
        setTheme(savedTheme);

        if (UI.openThemeModalBtn && UI.themeModal && UI.closeThemeModalBtn) {
            UI.openThemeModalBtn.addEventListener('click', () => {
                UI.themeModal.style.display = 'flex';
                const currentTheme = localStorage.getItem('app-theme') || 'system';
                UI.themeOptionsContainer.querySelectorAll('.theme-option').forEach(option => {
                    option.classList.remove('active');
                    if (option.dataset.theme === currentTheme) {
                        option.classList.add('active');
                    }
                });
            });

            UI.closeThemeModalBtn.addEventListener('click', () => {
                UI.themeModal.style.display = 'none';
            });

            UI.themeModal.addEventListener('click', (e) => {
                if (e.target === UI.themeModal) UI.themeModal.style.display = 'none';
            });
        }

        UI.themeOptionsContainer.addEventListener('click', (e) => {
            const targetOption = e.target.closest('.theme-option');
            if (targetOption) {
                setTheme(targetOption.dataset.theme);
                UI.themeOptionsContainer.querySelectorAll('.theme-option').forEach(option => {
                    option.classList.remove('active');
                });
                targetOption.classList.add('active');
            }
        });

        addLogEntry('WebUI initialized', 'success');

        await Promise.all([
            fetchBlocklist(),
            fetchWhitelist(),
            fetchInstalledAppsCount(),
            fetchAggressiveModeStatus(),
            fetchServiceStatus()
        ]);

        await fetchApiLogs();

        mainContainer.style.display = 'block';
        UI.topBar.style.display = 'block';
        UI.bottomNav.style.display = 'flex';
        loadingOverlay.style.opacity = '0';
        loadingOverlay.addEventListener('transitionend', () => {
            loadingOverlay.style.display = 'none';
        });

        navigateTo('home-page');
    };

    initializeApp();
});