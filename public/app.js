document.addEventListener('DOMContentLoaded', () => {
    // Initialize Lucide icons
    lucide.createIcons();

    // App State
    const state = {
        currentYear: new Date().getFullYear(),
        currentMonth: new Date().getMonth() + 1,
        currentDay: new Date().toISOString().split('T')[0],
        chartView: 'day',
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

    // Custom Chart.js Plugin to draw center label directly inside doughnut ring's center
    const centerTextPlugin = {
        id: 'centerTextPlugin',
        afterDraw(chart) {
            if (!chart.config.options.plugins.centerText) return;
            const { label, value, color } = chart.config.options.plugins.centerText;
            if (!label && !value) return;

            const { ctx, chartArea } = chart;
            const meta = chart.getDatasetMeta(0);
            if (meta && meta.data && meta.data.length > 0) {
                // Apply a -7px optical offset to nudge the text slightly to the left (towards the yellow segment) to center it perfectly on mobile screens
                const x = (chartArea ? (chartArea.left + chartArea.right) / 2 : meta.data[0].x) - 17;
                const y = chartArea ? (chartArea.top + chartArea.bottom) / 2 : meta.data[0].y;

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                // Subtitle Label (e.g. "รวมรายจ่าย" or "รวมรายรับ")
                ctx.font = '500 12px Prompt, Kanit, sans-serif';
                ctx.fillStyle = '#64748b';
                ctx.fillText(label || '', x, y - 10);

                // Value Text (e.g. "฿9,563")
                ctx.font = '700 18px Prompt, Kanit, sans-serif';
                ctx.fillStyle = color || '#0f172a';
                ctx.fillText(value || '', x, y + 10);

                ctx.restore();
            }
        }
    };
    if (window.Chart) {
        Chart.register(centerTextPlugin);
    }

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
        updateKpiCards();
        try {
            // Always fetch month summary for stable monthly balance and income pie charts
            let url = `/api/summary?year=${state.currentYear}&month=${state.currentMonth}`;
            
            const res = await fetch(url);
            if (!res.ok) throw new Error("API network error or static demo server");
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
            // Fallback for static demo preview
            if (!state.summaryData) {
                state.summaryData = { "รายรับ": 15000, "รายจ่าย": 9563, "เงินออม/ลงทุน": 2000, "ยอดคงเหลือ": 3437 };
            }
            if (elements.kpiIncome) elements.kpiIncome.textContent = formatTHB(state.summaryData["รายรับ"]);
            if (elements.kpiExpense) elements.kpiExpense.textContent = formatTHB(state.summaryData["รายจ่าย"]);
            if (elements.kpiSaving) elements.kpiSaving.textContent = formatTHB(state.summaryData["เงินออม/ลงทุน"]);
            if (elements.kpiBalance) elements.kpiBalance.textContent = formatTHB(state.summaryData["ยอดคงเหลือ"]);
            renderChart();
        }
    }

    function updateKpiCards() {
        const kpiGrid = document.querySelector('.kpi-grid');
        const cardIncome = document.querySelector('.card-income');
        const cardExpense = document.querySelector('.card-expense');
        const cardSaving = document.querySelector('.card-saving');
        const cardBalance = document.querySelector('.card-balance');

        if (kpiGrid) {
            kpiGrid.classList.remove('view-day', 'view-month', 'view-year');
            kpiGrid.classList.add(`view-${state.chartView}`);
        }

        if (state.chartView === 'day') {
            if (cardIncome) cardIncome.style.display = 'none';
            if (cardExpense) cardExpense.style.display = 'none';
            if (cardSaving) cardSaving.style.display = 'none';
            if (cardBalance) {
                cardBalance.style.display = 'flex';
                const label = cardBalance.querySelector('.kpi-label');
                if (label) label.textContent = 'คงเหลือ (รายรับ-รายจ่าย)';
            }
        } else if (state.chartView === 'month') {
            if (cardIncome) {
                cardIncome.style.display = 'flex';
                const label = cardIncome.querySelector('.kpi-label');
                if (label) label.textContent = 'รายรับเดือนนี้';
            }
            if (cardExpense) {
                cardExpense.style.display = 'flex';
                const label = cardExpense.querySelector('.kpi-label');
                if (label) label.textContent = 'รายจ่ายเดือนนี้';
            }
            if (cardSaving) {
                cardSaving.style.display = 'flex';
                const label = cardSaving.querySelector('.kpi-label');
                if (label) label.textContent = 'ออม+ลงทุนเดือนนี้';
            }
            if (cardBalance) {
                cardBalance.style.display = 'flex';
                const label = cardBalance.querySelector('.kpi-label');
                if (label) label.textContent = 'คงเหลือ (รายรับ-รายจ่าย)';
            }
        } else if (state.chartView === 'year') {
            if (cardIncome) {
                cardIncome.style.display = 'flex';
                const label = cardIncome.querySelector('.kpi-label');
                if (label) label.textContent = 'รายรับทั้งปี';
            }
            if (cardExpense) {
                cardExpense.style.display = 'flex';
                const label = cardExpense.querySelector('.kpi-label');
                if (label) label.textContent = 'รายจ่ายทั้งปี';
            }
            if (cardSaving) {
                cardSaving.style.display = 'flex';
                const label = cardSaving.querySelector('.kpi-label');
                if (label) label.textContent = 'ออม+ลงทุนทั้งปี';
            }
            if (cardBalance) {
                cardBalance.style.display = 'none';
            }
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
            if (!res.ok) throw new Error("API not found");
            state.budgetConfig = await res.json();
            renderBudgetProgress();
        } catch (e) {
            console.error("Budget config load fallback for demo:", e);
            // Rich Demo Data for Budget Progress
            state.budgetConfig = [
                { category: "อาหาร", budget: 6000, used: 2450, mode: "Day", status: "On" },
                { category: "ของใช้ส่วนตัว", budget: 3000, used: 1200, mode: "Month", status: "On" },
                { category: "7-ELEVEN", budget: 2000, used: 850, mode: "Day", status: "On" },
                { category: "เดินทาง", budget: 2500, used: 1100, mode: "Month", status: "On" },
                { category: "เครื่องดื่ม", budget: 1500, used: 680, mode: "Day", status: "On" },
                { category: "ของใช้", budget: 2000, used: 950, mode: "Month", status: "On" },
                { category: "Enjoy", budget: 4000, used: 1500, mode: "Month", status: "On" },
                { category: "อื่นๆ", budget: 3000, used: 833, mode: "Month", status: "On" }
            ];
            renderBudgetProgress();
        }
    }

    function renderChart() {
        if (!state.summaryData) return;
        
        const expenseChartCanvas = document.getElementById('expenseChart');
        const expenseCard = expenseChartCanvas ? expenseChartCanvas.closest('.chart-card') : null;

        const incomeChartCanvas = document.getElementById('incomeChart');
        const incomeCard = incomeChartCanvas ? incomeChartCanvas.closest('.chart-card') : null;

        // --- 1. Expense Chart ---
        const totalExpense = state.summaryData["รายจ่าย"] || 0;
        const usedItems = state.budgetConfig ? state.budgetConfig.filter(i => i.used > 0) : [];
        let labels = usedItems.map(i => i.category);
        let values = usedItems.map(i => i.used);

        if (totalExpense === 0 || usedItems.length === 0) {
            if (expenseCard) expenseCard.style.display = 'none';
        } else {
            if (expenseCard) expenseCard.style.display = 'block';
            const colors = labels.map(l => CATEGORY_COLORS[l] || "#94a3b8");

            if (expenseChartCanvas) {
                const ctx = expenseChartCanvas.getContext('2d');
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
                            centerText: {
                                label: "รวมรายจ่าย",
                                value: formatTHB(totalExpense),
                                color: "#0f172a"
                            },
                            legend: { position: 'bottom', labels: { color: '#475569', font: { family: 'Prompt', size: 11, weight: '600' }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
                            tooltip: { callbacks: { label: function(context) {
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

            if (totalIncome === 0 || incLabels.length === 0) {
                if (incomeCard) incomeCard.style.display = 'none';
            } else {
                if (incomeCard) incomeCard.style.display = 'block';
                const incColors = incLabels.map(l => CATEGORY_COLORS[l] || "#3b82f6");

                if (incomeChartCanvas) {
                    const ctxInc = incomeChartCanvas.getContext('2d');
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
                                centerText: {
                                    label: "รวมรายรับ",
                                    value: formatTHB(totalIncome),
                                    color: "#10b981"
                                },
                                legend: { position: 'bottom', labels: { color: '#475569', font: { family: 'Prompt', size: 11, weight: '600' }, padding: 12, usePointStyle: true, pointStyle: 'circle' } },
                                tooltip: { callbacks: { label: function(context) {
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

        renderYearlyComboChart();
    }

    function renderYearlyComboChart() {
        const yearlyCard = document.getElementById('yearly-chart-card');
        const yearlyCanvas = document.getElementById('yearlyComboChart');
        if (!yearlyCard || !yearlyCanvas) return;

        if (state.chartView !== 'year') {
            yearlyCard.style.display = 'none';
            return;
        }

        yearlyCard.style.display = 'block';
        const ctx = yearlyCanvas.getContext('2d');

        const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const incData = [25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000];
        const expData = [12400, 14200, 11800, 15300, 13100, 16000, 9563, 14000, 12500, 13800, 14500, 18000];
        const savData = [5000, 5000, 6000, 4000, 5000, 3000, 8000, 5000, 6000, 5000, 4000, 3000];

        if (state.yearlyChartInstance) state.yearlyChartInstance.destroy();

        state.yearlyChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    {
                        type: 'line',
                        label: 'ออม+ลงทุน',
                        data: savData,
                        borderColor: '#a855f7',
                        backgroundColor: '#a855f7',
                        borderWidth: 2.5,
                        pointRadius: 3,
                        pointHoverRadius: 5,
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        type: 'bar',
                        label: 'รายรับ',
                        data: incData,
                        backgroundColor: '#10b981',
                        borderRadius: 4,
                        barPercentage: 0.65,
                        categoryPercentage: 0.65
                    },
                    {
                        type: 'bar',
                        label: 'รายจ่าย',
                        data: expData,
                        backgroundColor: '#f43f5e',
                        borderRadius: 4,
                        barPercentage: 0.65,
                        categoryPercentage: 0.65
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: '#475569',
                            font: { family: 'Prompt', size: 10, weight: '600' },
                            usePointStyle: true,
                            boxWidth: 8
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ` ${context.dataset.label}: ฿${context.raw.toLocaleString()}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#64748b', font: { family: 'Prompt', size: 9 } }
                    },
                    y: {
                        grid: { color: 'rgba(226, 232, 240, 0.6)' },
                        ticks: {
                            color: '#64748b',
                            font: { family: 'Prompt', size: 9 },
                            callback: function(val) { return '฿' + (val / 1000) + 'k'; }
                        }
                    }
                }
            }
        });
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

            const pct = budget > 0 ? Math.round((actual / budget) * 100) : (actual > 0 ? 100 : 0);
            let color = "#10b981"; // soft green
            let statusBadge = '';

            if (actual > budget && budget > 0) {
                color = "#f43f5e"; // soft red
                const overAmount = actual - budget;
                statusBadge = `<span class="badge-overbudget">เกินงบ ฿${overAmount.toLocaleString()} (${pct}%)</span>`;
            } else {
                if (pct > 80) color = "#f59e0b"; // warm yellow
                const remaining = Math.max(0, budget - actual);
                statusBadge = `<span class="badge-remaining">เหลือ ฿${remaining.toLocaleString()} (${pct}%)</span>`;
            }

            const fillWidth = Math.min(pct, 100);

            const itemHtml = `
                <div class="budget-item">
                    <div class="budget-info" style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="budget-cat">${cat}</span>
                        ${statusBadge}
                    </div>
                    <div class="budget-info" style="margin-top: 4px; font-size: 0.8rem; color: #64748b;">
                        <span>ใช้ไป ฿${actual.toLocaleString()}</span>
                        <span>งบประมาณ ฿${budget.toLocaleString()}</span>
                    </div>
                    <div class="progress-bar-bg" style="margin-top: 6px;">
                        <div class="progress-bar-fill" style="width: ${fillWidth}%; background-color: ${color};"></div>
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

            if (state.chartView === 'day' && elements.dayPicker) {
                if (!elements.dayPicker.value) {
                    elements.dayPicker.value = state.currentDay;
                }
            }

            // Instantly toggle KPI cards visibility & title labels
            updateKpiCards();

            loadSummary();
            loadBudgetConfig();
            if (typeof loadTransactions === 'function') loadTransactions();
        });
    });

    if (elements.monthSelect) {
        elements.monthSelect.addEventListener('change', (e) => {
            state.currentMonth = parseInt(e.target.value);
            loadSummary();
            loadBudgetConfig();
            if (typeof loadTransactions === 'function') loadTransactions();
        });
    }

    if (elements.dayPicker) {
        elements.dayPicker.value = state.currentDay;
        elements.dayPicker.addEventListener('change', (e) => {
            state.currentDay = e.target.value;
            loadSummary();
            loadBudgetConfig();
            if (typeof loadTransactions === 'function') loadTransactions();
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

    // Form Submit Handler (with Confirm Modal for Edit)
    let pendingTxPayload = null;
    let pendingMethod = 'POST';

    if (elements.txForm) {
        elements.txForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('tx-name');
            pendingTxPayload = {
                type: state.txType,
                date: elements.txDateInput.value,
                category: nameInput ? nameInput.value : '',
                amount: parseFloat(elements.txAmountInput.value),
                note: elements.txNoteInput.value,
                saving_type: state.txType === 'เงินออม/ลงทุน' ? (elements.txSavingType ? elements.txSavingType.value : '') : '',
                saving_group: state.txType === 'เงินออม/ลงทุน' ? (elements.txSavingGroup ? elements.txSavingGroup.value : '') : ''
            };

            pendingMethod = 'POST';
            if (elements.txIdInput && elements.txIdInput.value) {
                pendingTxPayload.id = elements.txIdInput.value;
                pendingMethod = 'PUT';
                // Show confirm modal for edit
                const confirmModal = document.getElementById('confirm-modal');
                if (confirmModal) confirmModal.style.display = 'flex';
                return;
            }

            executeSaveTransaction();
        });
    }

    async function executeSaveTransaction() {
        if (!pendingTxPayload) return;
        const saveBtn = document.getElementById('btn-save-tx');
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> กำลังบันทึก...`;
        lucide.createIcons();

        try {
            const res = await fetch('/api/transaction', {
                method: pendingMethod,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pendingTxPayload)
            });
            const data = await res.json();

            if (data.success) {
                showToast(pendingMethod === 'PUT' ? "✨ แก้ไขเรียบร้อยแล้ว!" : "✨ บันทึกเรียบร้อยแล้ว!");
                elements.txAmountInput.value = '';
                elements.txNoteInput.value = '';
                if (elements.txIdInput) elements.txIdInput.value = '';
                loadSummary();
                loadBudgetConfig();
                if (typeof loadTransactions === 'function') loadTransactions();
            } else {
                showToast("❌ เกิดข้อผิดพลาด: " + (data.error || "ไม่สามารถบันทึกได้"));
            }
        } catch (err) {
            showToast("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i data-lucide="save"></i> บันทึกข้อมูลลง Google Sheets`;
            lucide.createIcons();
            pendingTxPayload = null;
        }
    }

    // Modal Action Buttons
    const btnModalCancel = document.getElementById('btn-modal-cancel');
    const btnModalConfirm = document.getElementById('btn-modal-confirm');
    const confirmModal = document.getElementById('confirm-modal');

    if (btnModalCancel) {
        btnModalCancel.addEventListener('click', () => {
            if (confirmModal) confirmModal.style.display = 'none';
            pendingTxPayload = null;
        });
    }

    if (btnModalConfirm) {
        btnModalConfirm.addEventListener('click', () => {
            if (confirmModal) confirmModal.style.display = 'none';
            executeSaveTransaction();
        });
    }

    async function loadTransactions() {
        try {
            let url = `/api/transactions?year=${state.currentYear}`;
            if (state.currentMonth) {
                url += `&month=${state.currentMonth}`;
            }
            
            const res = await fetch(url);
            if (!res.ok) throw new Error("API not found");
            const data = await res.json();
            state.transactionsData = data;
            renderTransactionHistory();
        } catch (e) {
            console.error("Transactions load fallback for demo:", e);
            // Rich Demo Transactions Data for History List & Pie Charts
            state.transactionsData = [
                { id: 1, date: "2026-07-28", type: "รายจ่าย", category: "อาหาร", amount: 250, note: "ข้าวกลางวัน + กาแฟ" },
                { id: 2, date: "2026-07-28", type: "รายจ่าย", category: "7-ELEVEN", amount: 120, note: "ของกินเล่น" },
                { id: 3, date: "2026-07-27", type: "รายรับ", category: "เงินเดือน", amount: 25000, note: "เงินเดือนประจำเดือน" },
                { id: 4, date: "2026-07-26", type: "เงินออม/ลงทุน", category: "กองทุน", amount: 3000, saving_type: "ซื้อ", saving_group: "Port 1", note: "DCA กองทุนดัชนี" },
                { id: 5, date: "2026-07-25", type: "รายจ่าย", category: "เดินทาง", amount: 150, note: "ค่ารถไฟฟ้า BTS" },
                { id: 6, date: "2026-07-24", type: "รายจ่าย", category: "ของใช้ส่วนตัว", amount: 480, note: "สบู่ ยาสระผม" }
            ];
            renderTransactionHistory();
        }
    }

    function formatShortThaiDate(dateStr) {
        if (!dateStr) return '';
        const parts = String(dateStr).split('T')[0].split('-');
        if (parts.length !== 3) return dateStr;
        const thaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
        const day = parseInt(parts[2], 10);
        const monthIdx = parseInt(parts[1], 10) - 1;
        const shortYear = parts[0].slice(-2);
        if (monthIdx >= 0 && monthIdx < 12) {
            return `${day}/${thaiMonths[monthIdx]}/${shortYear}`;
        }
        return dateStr;
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

            const formattedDate = formatShortThaiDate(t.date);

            const itemHtml = `
                <div class="tx-item tx-${typeClass}">
                    <div class="tx-left">
                        <div class="tx-icon"><i data-lucide="${iconName}"></i></div>
                        <div class="tx-details">
                            <span class="tx-title">${t.category}</span>
                            <span class="tx-sub">${formattedDate} ${t.note ? '• ' + t.note : ''}</span>
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
                    
                    const addNav = document.querySelector('.bottom-nav .nav-item[data-page="page-add"]');
                    if (addNav) addNav.click();
                    window.scrollTo(0, 0);
                }
            });
        });

        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (confirm('คุณต้องการลบรายการนี้ใช่หรือไม่? (ระบบจะลบข้อมูลและเคลียร์เซลล์บันทึกใน Google Sheet ด้วย)')) {
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

    // Sticky Note Management (Rich-Text & Pen Slide-out Palette)
    const noteEditor = document.getElementById('note-editor');
    const noteContainer = document.getElementById('sticky-note-container');
    const noteStatus = document.getElementById('note-save-status');
    const btnNotePen = document.getElementById('btn-note-pen');
    const penPalette = document.getElementById('sticky-pen-palette');
    const btnNoteBgPalette = document.getElementById('btn-note-bg-palette');
    const bgPalette = document.getElementById('sticky-bg-palette');
    const colorDots = document.querySelectorAll('.color-dot');
    const textColorDots = document.querySelectorAll('.text-color-dot');
    let noteSaveTimeout = null;

    // Toggle Pen Slide-out Palette
    if (btnNotePen && penPalette) {
        btnNotePen.addEventListener('click', (e) => {
            e.stopPropagation();
            if (bgPalette) {
                bgPalette.classList.add('collapsed');
                if (btnNoteBgPalette) btnNoteBgPalette.classList.remove('active');
            }
            penPalette.classList.toggle('collapsed');
            btnNotePen.classList.toggle('active', !penPalette.classList.contains('collapsed'));
        });
    }

    // Toggle Background Color Slide-out Palette
    if (btnNoteBgPalette && bgPalette) {
        btnNoteBgPalette.addEventListener('click', (e) => {
            e.stopPropagation();
            if (penPalette) {
                penPalette.classList.add('collapsed');
                if (btnNotePen) btnNotePen.classList.remove('active');
            }
            bgPalette.classList.toggle('collapsed');
            btnNoteBgPalette.classList.toggle('active', !bgPalette.classList.contains('collapsed'));
        });
    }

    async function loadNote() {
        if (!noteEditor) return;
        try {
            const res = await fetch('/api/notes');
            const data = await res.json();
            if (data) {
                noteEditor.innerHTML = data.content || '';
                if (data.color && noteContainer) {
                    noteContainer.style.backgroundColor = data.color;
                    colorDots.forEach(dot => {
                        dot.classList.toggle('active', dot.getAttribute('data-color') === data.color);
                    });
                }
            }
        } catch (e) {
            console.error("Failed to load note:", e);
        }
    }

    async function saveNote() {
        if (!noteEditor || !noteContainer) return;
        const currentColor = noteContainer.style.backgroundColor || '#fef08a';
        const content = noteEditor.innerHTML;

        if (noteStatus) {
            noteStatus.innerHTML = `<i data-lucide="loader-2" class="spin"></i> กำลังบันทึก...`;
            lucide.createIcons();
        }

        try {
            await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, color: currentColor })
            });
            if (noteStatus) {
                noteStatus.innerHTML = `<i data-lucide="check-circle-2"></i> บันทึกแล้ว`;
                lucide.createIcons();
            }
        } catch (e) {
            if (noteStatus) {
                noteStatus.innerHTML = `<i data-lucide="alert-circle"></i> บันทึกไม่สำเร็จ`;
                lucide.createIcons();
            }
        }
    }

    if (noteEditor) {
        noteEditor.addEventListener('input', () => {
            if (noteSaveTimeout) clearTimeout(noteSaveTimeout);
            if (noteStatus) {
                noteStatus.innerHTML = `<i data-lucide="edit-3"></i> กำลังพิมพ์...`;
                lucide.createIcons();
            }
            noteSaveTimeout = setTimeout(saveNote, 800);
        });
    }

    // Change background color & auto collapse palette
    colorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            colorDots.forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            const color = dot.getAttribute('data-color');
            if (noteContainer) {
                noteContainer.style.backgroundColor = color;
                saveNote();
            }
            if (bgPalette) {
                bgPalette.classList.add('collapsed');
                if (btnNoteBgPalette) btnNoteBgPalette.classList.remove('active');
            }
        });
    });

    // Apply text color to selected text
    textColorDots.forEach(dot => {
        dot.addEventListener('click', () => {
            const textColor = dot.getAttribute('data-textcolor');
            if (noteEditor) {
                noteEditor.focus();
                document.execCommand('foreColor', false, textColor);
                saveNote();
            }
            // Auto collapse palette after selecting color
            if (penPalette) {
                penPalette.classList.add('collapsed');
                if (btnNotePen) btnNotePen.classList.remove('active');
            }
        });
    });

    // Dedicated Settings Page Sync Button Handler
    const btnSyncNow = document.getElementById('btn-sync-now');
    if (btnSyncNow) {
        btnSyncNow.addEventListener('click', async () => {
            btnSyncNow.disabled = true;
            btnSyncNow.innerHTML = `<i data-lucide="loader-2" class="spin"></i> กำลังซิงค์ข้อมูล...`;
            lucide.createIcons();

            try {
                const res = await fetch('/api/sync', { method: 'POST' });
                const data = await res.json();
                if (data.success) {
                    showToast("✨ ซิงค์ข้อมูลกับ Google Sheet สำเร็จ!");
                    loadCategories();
                    loadBudgetConfig();
                    loadSummary();
                } else {
                    showToast("❌ ซิงค์ข้อมูลไม่สำเร็จ: " + (data.error || ""));
                }
            } catch (e) {
                showToast("❌ เกิดข้อผิดพลาดในการเชื่อมต่อ");
            } finally {
                btnSyncNow.disabled = false;
                btnSyncNow.innerHTML = `<i data-lucide="refresh-cw"></i> ซิงค์ข้อมูลกับ Google Sheet ตอนนี้`;
                lucide.createIcons();
            }
        });
    }

    // Initialize Application
    if (elements.monthSelect) {
        elements.monthSelect.value = state.currentMonth;
    }
    if (elements.dayPicker) {
        elements.dayPicker.value = state.currentDay;
    }
    checkConfig();
    loadNote();
    loadCategories().then(() => {
        // Trigger initial type mapping
        const activeTab = document.querySelector('.type-tab.active');
        if(activeTab) activeTab.click();
    });
    loadBudgetConfig();
    loadSummary();
});
