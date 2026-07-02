document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    lucide.createIcons();

    // App State
    const state = {
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth() + 1,
        currentDay: new Date().toISOString().split('T')[0],
        chartView: 'year',
        txType: 'รายจ่าย', // Default changed to match DB types
        historyFilter: 'all',
        summaryData: null,
        transactionsData: null,
        budgetConfig: [],
        categories: {
            income: ["เงินเดือน", "อื่นๆ"],
            expense: ["อาหาร", "เดินทาง", "ของใช้ส่วนตัว"],
            saving_groups: ["หุ้น", "กองทุน"],
            saving_types: ["ซื้อ", "ขาย", "ออม", "spend"]
        },
        chartInstance: null,
        incomeChartInstance: null
    };

    const CATEGORY_COLORS = {
        "อาหาร": "#f43f5e",
        "ของใช้ส่วนตัว": "#ec4899",
        "วัตถุดิบอาหาร": "#fb923c",
        "7-ELEVEN": "#10b981",
        "เดินทาง": "#3b82f6",
        "เครื่องดื่ม": "#06b6d4",
        "ของใช้": "#eab308",
        "เปย์ตัวเอง": "#a855f7",
        "Enjoy": "#8b5cf6",
        "อื่นๆ": "#64748b",
        "ท่องเที่ยว": "#14b8a6",
        "Instellment": "#f59e0b",
        "Gift": "#f472b6"
    };

    // DOM Elements
    const elements = {
        navItems: document.querySelectorAll('.nav-item'),
        pageViews: document.querySelectorAll('.page-view'),
        badgeConn: document.getElementById('badge-conn'),
        btnSync: document.getElementById('btn-sync'),
        kpiIncome: document.getElementById('kpi-income'),
        kpiExpense: document.getElementById('kpi-expense'),
        kpiSaving: document.getElementById('kpi-saving'),
        kpiBalance: document.getElementById('kpi-balance'),
        chartViewBtns: document.querySelectorAll('.toggle-view .segmented-btn'),
        monthFilterGroup: document.getElementById('month-filter-group'),
        dayFilterGroup: document.getElementById('day-filter-group'),
        monthSelect: document.getElementById('month-select'),
        dayPicker: document.getElementById('day-picker'),
        chartTotalVal: document.getElementById('chart-total-val'),
        budgetProgressList: document.getElementById('budget-progress-list'),
        typeTabs: document.querySelectorAll('.type-tab'),
        txTypeInput: document.getElementById('tx-type'),
        txIdInput: document.getElementById('tx-id'),
        txForm: document.getElementById('tx-form'),
        txDateInput: document.getElementById('tx-date'),
        txNameContainer: document.getElementById('tx-name-container'),
        txAmountInput: document.getElementById('tx-amount'),
        savingFields: document.getElementById('saving-fields'),
        txSavingType: document.getElementById('tx-saving-type'),
        txSavingGroup: document.getElementById('tx-saving-group'),
        txNoteInput: document.getElementById('tx-note'),
        txForm: document.getElementById('tx-form'),
        historyFilterBtns: document.querySelectorAll('.history-tabs .segmented-btn'),
        historyList: document.getElementById('history-list'),
        toast: document.getElementById('toast')
    };

    // Set Default Dates
    const todayStr = new Date().toISOString().split('T')[0];
    elements.txDateInput.value = todayStr;
    elements.dayPicker.value = todayStr;

    // Navigation Handler
    elements.navItems.forEach(item => {
        item.addEventListener('click', () => {
            elements.navItems.forEach(n => n.classList.remove('active'));
            elements.pageViews.forEach(p => p.classList.remove('active'));
            
            item.classList.add('active');
            const targetPage = item.getAttribute('data-page');
            document.getElementById(targetPage).classList.add('active');

            if (targetPage === 'page-history') loadTransactions();
        });
    });

    function showToast(message, duration = 3000) {
        if (!elements.toast) return;
        elements.toast.textContent = message;
        elements.toast.classList.add('show');
        setTimeout(() => elements.toast.classList.remove('show'), duration);
    }

    function formatTHB(amount) {
        return '฿' + (amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }

    async function checkConfig() {
        try {
            const res = await fetch('/api/config');
            const data = await res.json();
            const badge = elements.badgeConn;
            const btnSync = document.getElementById('btn-sync');
            if (data.status === "success") {
                if (badge) {
                    badge.className = "badge badge-success";
                    badge.textContent = "Connected";
                }
                if (btnSync) {
                    btnSync.style.color = "#10b981";
                    btnSync.style.background = "rgba(16, 185, 129, 0.1)";
                    btnSync.innerHTML = '<i data-lucide="refresh-cw"></i>';
                }
            } else {
                if (badge) {
                    badge.className = "badge badge-warning";
                    badge.textContent = "Mock Mode";
                }
                if (btnSync) {
                    btnSync.style.color = "#ef4444";
                    btnSync.style.background = "rgba(239, 68, 68, 0.1)";
                    btnSync.innerHTML = '<i data-lucide="refresh-cw"></i>';
                }
            }
        } catch (e) {
            console.error(e);
            const badge = elements.badgeConn;
            const btnSync = document.getElementById('btn-sync');
            if (badge) {
                badge.className = "badge badge-error";
                badge.textContent = "Disconnected";
            }
            if (btnSync) {
                btnSync.style.color = "#ef4444";
                btnSync.style.background = "rgba(239, 68, 68, 0.1)";
                btnSync.innerHTML = '<i data-lucide="refresh-cw"></i>';
            }
        } finally {
            if (document.getElementById('btn-sync')) {
                lucide.createIcons();
            }
        }
    }

    if (elements.btnSync) {
        elements.btnSync.addEventListener('click', async () => {
            const originalHtml = elements.btnSync.innerHTML;
            elements.btnSync.innerHTML = '<i data-lucide="loader-2" class="spin"></i>';
            elements.btnSync.disabled = true;
            lucide.createIcons();
            
            try {
                const res = await fetch('/api/sync', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    showToast("ดึงข้อมูลจาก Google Sheets สำเร็จ!");
                    await loadCategories();
                    await loadBudgetConfig();
                } else {
                    showToast("เกิดข้อผิดพลาดในการ Sync");
                }
            } catch (err) {
                showToast("ไม่สามารถติดต่อ Server ได้");
            } finally {
                elements.btnSync.innerHTML = originalHtml;
                elements.btnSync.disabled = false;
                lucide.createIcons();
            }
        });
    }

    async function loadCategories() {
        try {
            const res = await fetch('/api/categories');
            const data = await res.json();
            if (data["รายจ่าย"]) state.categories.expense = data["รายจ่าย"];
            if (data["รายรับ"]) state.categories.income = data["รายรับ"];
            if (data["saving_groups"]) state.categories.saving_groups = data["saving_groups"];
            if (data["saving_types"]) state.categories.saving_types = data["saving_types"];
            updateFormFields();
        } catch (e) {
            console.error(e);
        }
    }

    async function loadSummary() {
        try {
            let url = `/api/summary?year=${state.currentYear}`;
            if (state.chartView === 'month') {
                url += `&month=${state.currentMonth}`;
            } else if (state.chartView === 'day') {
                url += `&date=${state.currentDay}`;
            }
            
            const res = await fetch(url);
            const data = await res.json();
            state.summaryData = data;

            if (elements.kpiIncome) elements.kpiIncome.textContent = formatTHB(data["รายรับ"]);
            if (elements.kpiExpense) elements.kpiExpense.textContent = formatTHB(data["รายจ่าย"]);
            if (elements.kpiSaving) elements.kpiSaving.textContent = formatTHB(data["เงินออม/ลงทุน"]);
            if (elements.kpiBalance) elements.kpiBalance.textContent = formatTHB(data["ยอดคงเหลือ"]);

            await loadTransactions();
            renderChart();
        } catch (e) {
            console.error("Error loading summary:", e);
        }
    }

    async function loadBudgetConfig() {
        try {
            let url = `/api/budget?year=${state.currentYear}`;
            if (state.chartView === 'month') {
                url += `&month=${state.currentMonth}`;
            } else if (state.chartView === 'day') {
                url += `&date=${state.currentDay}`;
            }
            
            const res = await fetch(url);
            state.budgetConfig = await res.json();
            renderBudgetProgress();
        } catch (e) {
            console.error(e);
        }
    }

    function renderChart() {
        if (!state.summaryData) return;
        
        // --- 1. Expense Chart ---
        if (state.budgetConfig && state.budgetConfig.length > 0) {
            const usedItems = state.budgetConfig.filter(i => i.used > 0);
            let labels = usedItems.map(i => i.category);
            let values = usedItems.map(i => i.used);
            let colors = [];

            if (labels.length === 0) {
                labels = ["ยังไม่มีรายการ"];
                values = [1];
                colors = ["#e2e8f0"];
            } else {
                colors = labels.map(l => CATEGORY_COLORS[l] || "#94a3b8");
            }

            const totalExpense = state.summaryData["รายจ่าย"] || 0;
            if (elements.chartTotalVal) {
                elements.chartTotalVal.textContent = labels[0] === "ยังไม่มีรายการ" ? "฿0" : formatTHB(totalExpense);
            }

            const ctxElem = document.getElementById('expenseChart');
            if (ctxElem) {
                const ctx = ctxElem.getContext('2d');
                if (state.chartInstance) state.chartInstance.destroy();

                state.chartInstance = new Chart(ctx, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{ data: values, backgroundColor: colors, borderWidth: 3, borderColor: '#ffffff' }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '75%',
                        plugins: {
                            legend: { position: 'bottom', labels: { color: '#475569', font: { family: 'Prompt', size: 11, weight: '600' }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
                            tooltip: { callbacks: { label: function(context) {
                                if (context.label === "ยังไม่มีรายการ") return " ไม่มีข้อมูล";
                                const val = context.raw;
                                const pct = totalExpense > 0 ? ((val / totalExpense) * 100).toFixed(1) : 0;
                                return ` ${context.label}: ฿${val.toLocaleString()} (${pct}%)`;
                            }}}
                        }
                    }
                });
            }
        }

        // --- 2. Income Chart ---
        if (state.transactionsData) {
            const incomes = state.transactionsData.filter(t => t.type === 'รายรับ');
            const grouped = {};
            let totalIncome = 0;
            incomes.forEach(t => {
                grouped[t.category] = (grouped[t.category] || 0) + t.amount;
                totalIncome += t.amount;
            });
            
            let incLabels = Object.keys(grouped);
            let incValues = Object.values(grouped);
            let incColors = [];

            if (incLabels.length === 0) {
                incLabels = ["ยังไม่มีรายการ"];
                incValues = [1];
                incColors = ["#e2e8f0"];
            } else {
                incColors = incLabels.map(l => CATEGORY_COLORS[l] || "#3b82f6");
            }

            const chartIncomeVal = document.getElementById('chart-income-val');
            if (chartIncomeVal) {
                chartIncomeVal.textContent = incLabels[0] === "ยังไม่มีรายการ" ? "฿0" : formatTHB(totalIncome);
            }

            const ctxIncElem = document.getElementById('incomeChart');
            if (ctxIncElem) {
                const ctxInc = ctxIncElem.getContext('2d');
                if (state.incomeChartInstance) state.incomeChartInstance.destroy();

                state.incomeChartInstance = new Chart(ctxInc, {
                    type: 'doughnut',
                    data: {
                        labels: incLabels,
                        datasets: [{ data: incValues, backgroundColor: incColors, borderWidth: 3, borderColor: '#ffffff' }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '75%',
                        plugins: {
                            legend: { position: 'bottom', labels: { color: '#475569', font: { family: 'Prompt', size: 11, weight: '600' }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
                            tooltip: { callbacks: { label: function(context) {
                                if (context.label === "ยังไม่มีรายการ") return " ไม่มีข้อมูล";
                                const val = context.raw;
                                const pct = totalIncome > 0 ? ((val / totalIncome) * 100).toFixed(1) : 0;
                                return ` ${context.label}: ฿${val.toLocaleString()} (${pct}%)`;
                            }}}
                        }
                    }
                });
            }
        }
    }

    function renderBudgetProgress() {
        if (!state.budgetConfig || !Array.isArray(state.budgetConfig)) return;
        const container = elements.budgetProgressList;
        if (!container) return;
        container.innerHTML = '';

        state.budgetConfig.forEach(item => {
            const cat = item.category;
            const budget = item.limit || 0;
            const actual = item.used || 0;
            
            if (budget === 0 && actual === 0) return;

            const pct = budget > 0 ? Math.min(Math.round((actual / budget) * 100), 100) : (actual > 0 ? 100 : 0);
            let color = "#10b981"; // soft green
            if (pct > 80) color = "#f59e0b"; // warm yellow
            if (pct >= 100) color = "#f43f5e"; // soft red

            const itemHtml = `
                <div class="budget-item">
                    <div class="budget-info">
                        <span class="budget-cat">${cat} (${pct}%)</span>
                        <span class="budget-amounts">฿${actual.toLocaleString()} / ฿${budget.toLocaleString()}</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style="width: ${pct}%; background-color: ${color};"></div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', itemHtml);
        });
    }

    elements.chartViewBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.chartViewBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.chartView = btn.getAttribute('data-view');

            elements.monthFilterGroup.style.display = (state.chartView === 'month') ? 'flex' : 'none';
            elements.dayFilterGroup.style.display = (state.chartView === 'day') ? 'flex' : 'none';

            loadSummary();
        });
    });

    if (elements.monthSelect) {
        elements.monthSelect.addEventListener('change', (e) => {
            state.currentMonth = parseInt(e.target.value);
            loadSummary();
            loadBudgetConfig();
        });
    }

    if (elements.dayPicker) {
        elements.dayPicker.addEventListener('change', (e) => {
            state.currentDay = e.target.value;
            loadSummary();
        });
    }

    function updateFormFields() {
        const type = state.txType;
        if (!elements.txNameContainer) return;
        elements.txNameContainer.innerHTML = '';

        if (type === 'รายจ่าย' || type === 'expense') {
            let optionsHtml = state.categories.expense.map(c => `<option value="${c}">${c}</option>`).join('');
            elements.txNameContainer.innerHTML = `<select id="tx-name" class="form-input" required>${optionsHtml}</select>`;
            elements.savingFields.style.display = 'none';
        } else if (type === 'รายรับ' || type === 'income') {
            let optionsHtml = state.categories.income.map(c => `<option value="${c}">${c}</option>`).join('');
            elements.txNameContainer.innerHTML = `<select id="tx-name" class="form-input" required>${optionsHtml}</select>`;
            elements.savingFields.style.display = 'none';
        } else if (type === 'เงินออม/ลงทุน' || type === 'saving') {
            elements.txNameContainer.innerHTML = `<input type="text" id="tx-name" class="form-input" placeholder="เช่น Make, KS, InnovestX" required>`;
            elements.savingFields.style.display = 'block';

            if (elements.txSavingType) {
                elements.txSavingType.innerHTML = `<option value="" disabled selected>เลือกประเภท...</option>` + state.categories.saving_types.map(t => `<option value="${t}">${t}</option>`).join('');
            }
            if (elements.txSavingGroup) {
                elements.txSavingGroup.innerHTML = `<option value="" disabled selected>เลือกกลุ่ม...</option>` + state.categories.saving_groups.map(g => `<option value="${g}">${g}</option>`).join('');
            }
        }
    }

    elements.typeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            elements.typeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            let typeCode = tab.getAttribute('data-type');
            if (typeCode === 'expense') state.txType = 'รายจ่าย';
            if (typeCode === 'income') state.txType = 'รายรับ';
            if (typeCode === 'saving') state.txType = 'เงินออม/ลงทุน';
            
            elements.txTypeInput.value = state.txType;
            updateFormFields();
        });
    });

    if (elements.txForm) {
        elements.txForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const saveBtn = document.getElementById('btn-save-tx');
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> กำลังบันทึก...`;
            lucide.createIcons();

            const nameInput = document.getElementById('tx-name');
            const payload = {
                type: state.txType,
                date: elements.txDateInput.value,
                category: nameInput ? nameInput.value : '',
                amount: parseFloat(elements.txAmountInput.value),
                note: elements.txNoteInput.value,
                saving_type: state.txType === 'เงินออม/ลงทุน' ? (elements.txSavingType ? elements.txSavingType.value : '') : '',
                saving_group: state.txType === 'เงินออม/ลงทุน' ? (elements.txSavingGroup ? elements.txSavingGroup.value : '') : ''
            };

            let method = 'POST';
            if (elements.txIdInput && elements.txIdInput.value) {
                payload.id = elements.txIdInput.value;
                method = 'PUT';
            }

            try {
                const res = await fetch('/api/transaction', {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();

                if (data.success) {
                    showToast(method === 'PUT' ? "✨ แก้ไขเรียบร้อยแล้ว!" : "✨ บันทึกเรียบร้อยแล้ว!");
                    elements.txAmountInput.value = '';
                    elements.txNoteInput.value = '';
                    if (elements.txIdInput) elements.txIdInput.value = '';
                    loadSummary();
                    loadBudgetConfig();
                } else {
                    showToast("❌ เกิดข้อผิดพลาด: " + (data.error || "ไม่สามารถบันทึกได้"));
                }
            } catch (err) {
                showToast("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = `<i data-lucide="save"></i> บันทึกข้อมูลลง Google Sheets`;
                lucide.createIcons();
            }
        });
    }

    async function loadTransactions() {
        try {
            let url = `/api/transactions?year=${state.currentYear}`;
            if (state.chartView === 'month') {
                url += `&month=${state.currentMonth}`;
            } else if (state.chartView === 'day') {
                url += `&date=${state.currentDay}`;
            }
            
            const res = await fetch(url);
            const data = await res.json();
            state.transactionsData = data;
            renderTransactionHistory();
        } catch (e) {
            console.error(e);
        }
    }

    function renderTransactionHistory() {
        if (!state.transactionsData) return;
        const container = elements.historyList;
        if (!container) return;
        container.innerHTML = '';

        let txs = state.transactionsData || [];
        if (state.historyFilter !== 'all') {
            let filterType = state.historyFilter === 'expense' ? 'รายจ่าย' : (state.historyFilter === 'income' ? 'รายรับ' : 'เงินออม/ลงทุน');
            txs = txs.filter(t => t.type === filterType);
        }

        if (txs.length === 0) {
            container.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px; font-weight: 500;">ไม่มีรายการบันทึกในเดือนนี้</div>`;
            return;
        }

        txs.forEach(t => {
            let iconName = 'arrow-down-right';
            let sign = '-';
            let typeClass = 'expense';
            if (t.type === 'รายรับ') { iconName = 'arrow-up-right'; sign = '+'; typeClass = 'income'; }
            if (t.type === 'เงินออม/ลงทุน') { iconName = 'piggy-bank'; sign = ''; typeClass = 'saving'; }

            const itemHtml = `
                <div class="tx-item tx-${typeClass}">
                    <div class="tx-left">
                        <div class="tx-icon"><i data-lucide="${iconName}"></i></div>
                        <div class="tx-details">
                            <span class="tx-title">${t.category}</span>
                            <span class="tx-sub">${t.date} ${t.note ? '• ' + t.note : ''}</span>
                        </div>
                    </div>
                    <div class="tx-right" style="display: flex; align-items: center; gap: 10px;">
                        <span class="tx-amount">${sign}฿${t.amount.toLocaleString()}</span>
                        <div class="tx-actions" style="display: flex; gap: 5px;">
                            <button class="btn-icon btn-edit" data-id="${t.id}" style="width: 28px; height: 28px; padding: 0; background: rgba(59, 130, 246, 0.1); color: #3b82f6; border-radius: 6px; border: none; cursor: pointer;"><i data-lucide="edit-2" style="width: 14px; height: 14px;"></i></button>
                            <button class="btn-icon btn-delete" data-id="${t.id}" style="width: 28px; height: 28px; padding: 0; background: rgba(239, 68, 68, 0.1); color: #ef4444; border-radius: 6px; border: none; cursor: pointer;"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
                        </div>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', itemHtml);
        });
        lucide.createIcons();

        // Attach event listeners for edit and delete
        document.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const t = txs.find(x => x.id == id);
                if (t) {
                    let typeClass = 'tab-expense';
                    if (t.type === 'รายรับ') typeClass = 'tab-income';
                    if (t.type === 'เงินออม/ลงทุน') typeClass = 'tab-saving';
                    document.querySelector(`.${typeClass}`).click();
                    
                    elements.txDateInput.value = t.date;
                    elements.txAmountInput.value = t.amount;
                    elements.txNoteInput.value = t.note || '';
                    if (elements.txIdInput) elements.txIdInput.value = t.id;
                    
                    setTimeout(() => {
                        const nameInput = document.getElementById('tx-name');
                        if (nameInput) nameInput.value = t.category;
                        if (t.type === 'เงินออม/ลงทุน') {
                            if (elements.txSavingType) elements.txSavingType.value = t.saving_type || '';
                            if (elements.txSavingGroup) elements.txSavingGroup.value = t.saving_group || '';
                        }
                    }, 50);
                    
                    const tabBtn = document.querySelector('.tab-nav button[data-target="page-add"]');
                    if(tabBtn) tabBtn.click();
                    window.scrollTo(0,0);
                }
            });
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('คุณต้องการลบรายการนี้ใช่หรือไม่? (ลบเฉพาะในเว็บแอป ไม่กระทบ Google Sheet)')) {
                    const id = btn.getAttribute('data-id');
                    try {
                        const res = await fetch(`/api/transaction?id=${id}`, { method: 'DELETE' });
                        const data = await res.json();
                        if (data.success) {
                            showToast("🗑️ ลบรายการแล้ว");
                            loadSummary();
                            loadBudgetConfig();
                        } else {
                            showToast("❌ ลบไม่สำเร็จ");
                        }
                    } catch (e) {
                        showToast("❌ เกิดข้อผิดพลาด");
                    }
                }
            });
        });
    }

    elements.historyFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.historyFilterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.historyFilter = btn.getAttribute('data-filter');
            renderTransactionHistory();
        });
    });

    // Initialize Application
    if (elements.monthSelect) {
        elements.monthSelect.value = state.currentMonth;
    }
    checkConfig();
    loadCategories().then(() => {
        // Trigger initial type mapping
        const activeTab = document.querySelector('.type-tab.active');
        if(activeTab) activeTab.click();
    });
    loadBudgetConfig();
    loadSummary();
});
