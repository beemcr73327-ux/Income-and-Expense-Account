document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    lucide.createIcons();

    // App State
    const state = {
        currentYear: 2026,
        currentMonth: 6,
        currentDay: new Date().toISOString().split('T')[0],
        chartView: 'year',
        txType: 'expense',
        historyFilter: 'all',
        summaryData: null,
        transactionsData: null,
        budgetConfig: {},
        categories: {
            income: ["เงินเดือน", "สปีเก็ตต้า", "Giftgy", "Part time", "ปันผลหุ้น", "รายได้เสริม", "อื่นๆ"],
            expense: ["อาหาร", "ของใช้ส่วนตัว", "วัตถุดิบอาหาร", "7-ELEVEN", "เดินทาง", "เครื่องดื่ม", "ของใช้", "เปย์ตัวเอง", "Enjoy", "อื่นๆ", "ท่องเที่ยว", "Instellment", "Gift"],
            saving_groups: ["หุ้น", "Saving", "Self invesment", "เจ็บป่วย", "ETF", "Crypto", "กองทุนลดหย่อนภาษี", "Cash Invesment", "Gold"],
            saving_types: ["ออม", "ซื้อ", "ขาย", "Spend"]
        },
        chartInstance: null
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
        badgeConn: document.getElementById('connection-badge'),
        connText: document.getElementById('conn-text'),
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
        statusBox: document.getElementById('status-box'),
        budgetForm: document.getElementById('budget-form'),
        btnSaveBudget: document.getElementById('btn-save-budget'),
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
            if (data.configured) {
                elements.badgeConn.className = "badge badge-success";
                elements.connText.textContent = "Google Sheets Connected";
            } else {
                elements.badgeConn.className = "badge badge-warning";
                elements.connText.textContent = "Mock Mode";
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function loadCategories() {
        try {
            const res = await fetch('/api/categories');
            const data = await res.json();
            if (data.expense_categories) state.categories.expense = data.expense_categories;
            if (data.income_categories) state.categories.income = data.income_categories;
            if (data.saving_groups) state.categories.saving_groups = data.saving_groups;
            if (data.saving_types) state.categories.saving_types = data.saving_types;
            updateFormFields();
        } catch (e) {
            console.error(e);
        }
    }

    async function loadSummary() {
        try {
            const url = `/api/summary?year=${state.currentYear}&month=${state.currentMonth}`;
            const res = await fetch(url);
            const data = await res.json();
            state.summaryData = data;

            elements.kpiIncome.textContent = formatTHB(data.income_total);
            elements.kpiExpense.textContent = formatTHB(data.expense_total);
            elements.kpiSaving.textContent = formatTHB(data.saving_total);
            elements.kpiBalance.textContent = formatTHB(data.balance);

            renderChart();
            renderBudgetProgress();
        } catch (e) {
            console.error("Error loading summary:", e);
        }
    }

    async function loadBudgetConfig() {
        try {
            const res = await fetch(`/api/budget?year=${state.currentYear}&month=${state.currentMonth}`);
            state.budgetConfig = await res.json();
            renderBudgetProgress();
        } catch (e) {
            console.error(e);
        }
    }

    function renderChart() {
        if (!state.summaryData) return;
        
        const catData = state.summaryData.expense_by_category || {};
        let labels = Object.keys(catData);
        let values = Object.values(catData);
        let colors = [];

        if (labels.length === 0) {
            labels = ["ยังไม่มีรายการ"];
            values = [1];
            colors = ["#e2e8f0"];
        } else {
            colors = labels.map(l => CATEGORY_COLORS[l] || "#94a3b8");
        }

        const totalExpense = values.reduce((a, b) => a + b, 0);
        elements.chartTotalVal.textContent = labels[0] === "ยังไม่มีรายการ" ? "฿0" : formatTHB(totalExpense);

        const ctx = document.getElementById('expenseChart').getContext('2d');
        if (state.chartInstance) state.chartInstance.destroy();

        state.chartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 3,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: '#475569',
                            font: { family: 'Prompt', size: 11, weight: '600' },
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (context.label === "ยังไม่มีรายการ") return " ไม่มีข้อมูล";
                                const val = context.raw;
                                const pct = totalExpense > 0 ? ((val / totalExpense) * 100).toFixed(1) : 0;
                                return ` ${context.label}: ฿${val.toLocaleString()} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    function renderBudgetProgress() {
        if (!state.summaryData || !state.budgetConfig) return;
        const actuals = state.summaryData.expense_by_category || {};
        const container = elements.budgetProgressList;
        container.innerHTML = '';

        state.categories.expense.forEach(cat => {
            const actual = actuals[cat] || 0;
            const budget = state.budgetConfig[cat] || 0;
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

    elements.monthSelect.addEventListener('change', (e) => {
        state.currentMonth = parseInt(e.target.value);
        loadSummary();
        loadBudgetConfig();
    });

    elements.dayPicker.addEventListener('change', (e) => {
        state.currentDay = e.target.value;
        loadSummary();
    });

    function updateFormFields() {
        const type = state.txType;
        elements.txNameContainer.innerHTML = '';

        if (type === 'expense') {
            let optionsHtml = state.categories.expense.map(c => `<option value="${c}">${c}</option>`).join('');
            elements.txNameContainer.innerHTML = `<select id="tx-name" class="form-select" required>${optionsHtml}</select>`;
            elements.savingFields.style.display = 'none';
        } else if (type === 'income') {
            let optionsHtml = state.categories.income.map(c => `<option value="${c}">${c}</option>`).join('');
            elements.txNameContainer.innerHTML = `<select id="tx-name" class="form-select" required>${optionsHtml}</select>`;
            elements.savingFields.style.display = 'none';
        } else if (type === 'saving') {
            elements.txNameContainer.innerHTML = `<input type="text" id="tx-name" class="form-input" placeholder="เช่น Make, KS, InnovestX" required>`;
            elements.savingFields.style.display = 'block';

            elements.txSavingType.innerHTML = state.categories.saving_types.map(t => `<option value="${t}">${t}</option>`).join('');
            elements.txSavingGroup.innerHTML = state.categories.saving_groups.map(g => `<option value="${g}">${g}</option>`).join('');
        }
    }

    elements.typeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            elements.typeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            state.txType = tab.getAttribute('data-type');
            elements.txTypeInput.value = state.txType;
            updateFormFields();
        });
    });

    elements.txForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const saveBtn = document.getElementById('btn-save-tx');
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i data-lucide="loader-2"></i> กำลังบันทึก...`;
        lucide.createIcons();

        const nameInput = document.getElementById('tx-name');
        const payload = {
            type: state.txType,
            date: elements.txDateInput.value,
            name: nameInput ? nameInput.value : '',
            amount: parseFloat(elements.txAmountInput.value),
            note: elements.txNoteInput.value,
            saving_type: state.txType === 'saving' ? elements.txSavingType.value : '',
            saving_group: state.txType === 'saving' ? elements.txSavingGroup.value : ''
        };

        try {
            const res = await fetch('/api/transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success) {
                showToast("✨ บันทึกเรียบร้อยแล้ว!");
                elements.txAmountInput.value = '';
                elements.txNoteInput.value = '';
                loadSummary();
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

    async function loadTransactions() {
        try {
            const url = `/api/transactions?year=${state.currentYear}&month=${state.currentMonth}`;
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
        container.innerHTML = '';

        let txs = state.transactionsData.transactions || [];
        if (state.historyFilter !== 'all') {
            txs = txs.filter(t => t.type === state.historyFilter);
        }

        if (txs.length === 0) {
            container.innerHTML = `<div style="text-align: center; color: #94a3b8; padding: 20px; font-weight: 500;">ไม่มีรายการบันทึกในเดือนนี้</div>`;
            return;
        }

        txs.forEach(t => {
            let iconName = 'arrow-down-right';
            let sign = '-';
            if (t.type === 'income') { iconName = 'arrow-up-right'; sign = '+'; }
            if (t.type === 'saving') { iconName = 'piggy-bank'; sign = ''; }

            const itemHtml = `
                <div class="tx-item tx-${t.type}">
                    <div class="tx-left">
                        <div class="tx-icon"><i data-lucide="${iconName}"></i></div>
                        <div class="tx-details">
                            <span class="tx-title">${t.name}</span>
                            <span class="tx-sub">${t.date} ${t.note ? '• ' + t.note : ''}</span>
                        </div>
                    </div>
                    <span class="tx-amount">${sign}฿${t.amount.toLocaleString()}</span>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', itemHtml);
        });
        lucide.createIcons();
    }

    elements.historyFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.historyFilterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.historyFilter = btn.getAttribute('data-filter');
            renderTransactionHistory();
        });
    });

    async function loadConfigAndBudget() {
        const statusRes = await fetch('/api/config');
        const status = await statusRes.json();
        elements.statusBox.innerHTML = `
            <p><strong>สถานะการเชื่อมต่อ:</strong> ${status.configured ? '<span style="color: #10b981;">Connected (เชื่อมต่อแล้ว)</span>' : '<span style="color: #d97706;">Mock Mode (ยังไม่ได้ใส่ Credentials)</span>'}</p>
            <p style="margin-top: 4px;"><strong>Google Sheet ID:</strong> ${status.spreadsheet_id || 'ยังไม่ได้กำหนด'}</p>
        `;

        const budgetRes = await fetch(`/api/budget?year=${state.currentYear}&month=${state.currentMonth}`);
        const budget = await budgetRes.json();
        const container = document.getElementById('budget-overview-list');
        if (container) {
            container.innerHTML = '';
            state.categories.expense.forEach(cat => {
                const val = budget[cat] || 0;
                const cardHtml = `
                    <div class="budget-overview-card">
                        <span class="budget-ov-cat">${cat}</span>
                        <span class="budget-ov-val">฿${val.toLocaleString()}</span>
                    </div>
                `;
                container.insertAdjacentHTML('beforeend', cardHtml);
            });
        }
    }

    // Initialize Application
    checkConfig();
    loadCategories();
    loadBudgetConfig();
    loadSummary();
});
