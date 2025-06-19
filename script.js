document.addEventListener('DOMContentLoaded', () => {
    // Reverted to the original CSV_URL from the user's initial script (1).js for stability.
    const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgMFbI8pivLbRpc2nL2Gyoxw47PmXEVxvUDrjr-t86gj4-J3QM8uV7m8iJN9wxlYo3IY5FQqqUICei/pub?output=csv';
    const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdrDJoOeo264aOn4g2UEh-K-FHpbssBAVmEtOWoW46Q1cwjgg/viewform?usp=header';

    // --- Pagination Globals ---
    const ITEMS_PER_PAGE = 15;
    let currentTransactionsPage = 1;
    let currentSavingsPage = 1;
    let allTransactionsData = []; // Store all fetched data for consistent filtering and pagination
    let allSavingsDataGlobal = []; // Store all fetched savings data for pagination

    // --- Upcoming Bills Data ---
    const BILLS = [
        { name: 'Lazada Paylater', dueDay: 16 },
        { name: 'Atome Card', dueDay: 2 },
        { name: 'Unionbank Card', dueDay: 10 },
        { name: 'Maya Credit', dueDay: 11 },
        { name: 'Netflix', dueDay: 'end' }, // Special handling for end of month
        { name: 'Google One', dueDay: 29 },
        { name: 'Converge', dueDay: 20 }
    ];

    /**
     * Parses a CSV string into an array of objects.
     * @param {string} csv - The CSV data as a string.
     * @returns {Array<Object>} An array of objects, where each object represents a row.
     */
    function parseCSV(csv) {
        const lines = csv.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return [];

        const headers = lines[0].split(',').map(header => header.trim());
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(value => value.trim());
            if (values.length !== headers.length) {
                console.warn('CSV Parse Warning: Skipping malformed row (column mismatch):', lines[i]);
                continue;
            }
            const entry = {};
            headers.forEach((header, index) => {
                entry[header] = values[index];
            });
            data.push(entry);
        }
        return data;
    }

    /**
     * Formats a number as a currency string (Philippine Peso).
     * @param {number|string} amount - The amount to format.
     * @returns {string} The formatted currency string.
     */
    function formatCurrency(amount) {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount)) {
            return '₱ 0.00';
        }
        return `₱ ${numAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    /**
     * Maps a transaction entry to a display category and icon.
     * @param {Object} entry - The transaction entry object.
     * @returns {{category: string, icon: string}} An object containing the category name and its corresponding emoji icon.
     */
    function mapCategoryAndIcon(entry) {
        let category = 'Misc';
        let icon = '✨';

        const lowerCaseWhatKind = entry['What kind?'] ? entry['What kind?'].toLowerCase() : '';
        const lowerCaseType = entry.Type ? entry.Type.toLowerCase() : '';

        if (lowerCaseType === 'gains') {
            category = 'Gain';
            switch (lowerCaseWhatKind) {
                case 'salary': icon = '💸'; break;
                case 'allowance': icon = '🎁'; break;
                case 'savings contribution':
                case 'savings':
                    icon = '💰'; break; // Could be a savings deposit or withdrawal indicator
                default: icon = '💰'; break;
            }
        } else if (lowerCaseType === 'expenses') {
            switch (lowerCaseWhatKind) {
                case 'food': case 'groceries': category = 'Food'; icon = '🍔'; break;
                case 'medicines': category = 'Medicines'; icon = '💊'; break;
                case 'online shopping': category = 'Shopping'; icon = '🛍️'; break;
                case 'transportation': category = 'Transportation'; icon = '🚌'; break;
                case 'utility bills': category = 'Utility Bills'; icon = '💡'; break;
                case 'savings':
                    icon = '📉'; // Icon indicating expenditure towards savings
                    break;
                default: category = 'Misc'; icon = '✨'; break;
            }
        }
        return { category, icon };
    }

    // --- Dark Mode Toggle ---
    const nightModeToggle = document.getElementById('nightModeToggle');
    const body = document.body;
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        body.classList.add(savedTheme);
    } else {
        body.classList.add('light-mode');
    }

    if (nightModeToggle) {
        nightModeToggle.addEventListener('click', () => {
            if (body.classList.contains('light-mode')) {
                body.classList.remove('light-mode');
                body.classList.add('dark-mode');
                localStorage.setItem('theme', 'dark-mode');
            } else {
                body.classList.remove('dark-mode');
                body.classList.add('light-mode');
                localStorage.setItem('theme', 'light-mode');
            }
            // For dashboard, re-apply filters that might be set to update chart colors
            if (document.getElementById('dashboard-page')) {
                const filterMonthSelect = document.getElementById('filterMonth');
                const filterYearSelect = document.getElementById('filterYear');
                const selectedMonth = filterMonthSelect ? filterMonthSelect.value : 'All';
                const selectedYear = filterYearSelect ? filterYearSelect.value : 'All';
                updateDashboard(selectedMonth, selectedYear);
            }
        });
    }

    // --- Hamburger Menu Logic ---
    const mainMenuButton = document.getElementById('mainMenuButton');
    const mainMenuSidebar = document.getElementById('mainMenuSidebar');
    const closeSidebarButton = document.getElementById('closeSidebarButton');
    if (mainMenuButton && mainMenuSidebar && closeSidebarButton) {
        mainMenuButton.addEventListener('click', () => mainMenuSidebar.classList.add('open'));
        closeSidebarButton.addEventListener('click', () => mainMenuSidebar.classList.remove('open'));
        document.addEventListener('click', (event) => {
            if (mainMenuSidebar.classList.contains('open') &&
                !mainMenuSidebar.contains(event.target) &&
                !mainMenuButton.contains(event.target)) {
                mainMenuSidebar.classList.remove('open');
            }
        });
    }

    /**
     * Updates the dashboard view with filtered data and renders charts/summaries.
     * This function now always calculates total savings from ALL transactions.
     * @param {string} filterMonth - The month to filter by ('All' or 1-12).
     * @param {string} filterYear - The year to filter by ('All' or specific year).
     */
    async function updateDashboard(filterMonth = 'All', filterYear = 'All') {
        if (!document.getElementById('dashboard-page')) return;
        try {
            const response = await fetch(CSV_URL);
            const csv = await response.text();
            allTransactionsData = parseCSV(csv); // Store all data globally

            // Populate year filter dropdown
            const years = new Set();
            allTransactionsData.forEach(entry => {
                const entryDate = new Date(entry.Date);
                if (!isNaN(entryDate.getFullYear())) {
                    years.add(entryDate.getFullYear());
                }
            });
            const sortedYears = Array.from(years).sort((a, b) => b - a); // Descending order
            const filterYearSelect = document.getElementById('filterYear');
            if (filterYearSelect) {
                filterYearSelect.innerHTML = '<option value="All">All Years</option>';
                sortedYears.forEach(year => {
                    const option = document.createElement('option');
                    option.value = year;
                    option.textContent = year;
                    filterYearSelect.appendChild(option);
                });
                // Set the selected year if it was previously filtered
                if (filterYear !== 'All') {
                    filterYearSelect.value = filterYear;
                }
            }
            // Set the selected month if it was previously filtered
            const filterMonthSelect = document.getElementById('filterMonth');
            if (filterMonthSelect && filterMonth !== 'All') {
                filterMonthSelect.value = filterMonth;
            }

            // Calculate total savings from ALL transactions (not filtered by month/year)
            let totalSavingsAmountOverall = 0;
            allTransactionsData.forEach(entry => {
                const amount = parseFloat(entry.Amount);
                const entryType = entry.Type ? entry.Type.toLowerCase() : '';
                const entryWhatKind = entry['What kind?'] ? entry['What kind?'].toLowerCase() : '';

                if (isNaN(amount) || !entryType) {
                    console.warn('Savings Calculation - Skipping malformed entry:', entry);
                    return;
                }

                if (entryType === 'expenses' && entryWhatKind === 'savings') {
                    // Money spent on "savings" increases totalSavingsAmountOverall (money moved INTO savings)
                    totalSavingsAmountOverall += amount;
                } else if (entryType === 'gains' && (entryWhatKind === 'savings contribution' || entryWhatKind === 'savings')) {
                    // Money gained from "savings contribution" decreases totalSavingsAmountOverall (money moved OUT of general funds, into savings)
                    totalSavingsAmountOverall -= amount;
                }
            });

            // Update savings display on dashboard
            const savingsAmountSpan = document.getElementById('savingsAmount');
            if (savingsAmountSpan) {
                savingsAmountSpan.dataset.actualAmount = totalSavingsAmountOverall;
                // If it was unmasked before, re-mask it by default on page load or filter change
                const maskSavingsButton = document.getElementById('maskSavingsButton');
                if (maskSavingsButton && maskSavingsButton.textContent === 'Mask') {
                     savingsAmountSpan.textContent = formatCurrency(totalSavingsAmountOverall);
                } else {
                     savingsAmountSpan.textContent = '₱ ●●●,●●●.●●'; // Masked display
                }
            }


            // Calculations for the Expense Breakdown chart (filtered by month/year)
            let totalExpensesAmountFiltered = 0;
            let totalGainsAmountFiltered = 0;
            const expenseCategoriesForChart = { Food: 0, Medicines: 0, Shopping: 0, Misc: 0 };

            const filteredDashboardData = allTransactionsData.filter(entry => {
                const entryDate = new Date(entry.Date);
                if (isNaN(entryDate.getTime())) return false;

                const entryMonth = entryDate.getMonth() + 1;
                const entryYear = entryDate.getFullYear();

                const matchesMonth = (filterMonth === 'All' || entryMonth === parseInt(filterMonth));
                const matchesYear = (filterYear === 'All' || entryYear === parseInt(filterYear));

                return matchesMonth && matchesYear;
            });

            filteredDashboardData.forEach(entry => {
                const amount = parseFloat(entry.Amount);
                const entryType = entry.Type ? entry.Type.toLowerCase() : '';
                const entryWhatKind = entry['What kind?'] ? entry['What kind?'].toLowerCase() : '';

                if (isNaN(amount) || !entryType) return; // Skip malformed entries

                if (entryType === 'expenses') {
                    totalExpensesAmountFiltered += amount;
                    if (entryWhatKind === 'food' || entryWhatKind === 'groceries') expenseCategoriesForChart.Food += amount;
                    else if (entryWhatKind === 'medicines') expenseCategoriesForChart.Medicines += amount;
                    else if (entryWhatKind === 'online shopping') expenseCategoriesForChart.Shopping += amount;
                    else expenseCategoriesForChart.Misc += amount;
                } else if (entryType === 'gains') {
                    totalGainsAmountFiltered += amount;
                }
            });

            document.getElementById('netExpenseValue').textContent = formatCurrency(totalExpensesAmountFiltered);
            const remainingBalance = totalGainsAmountFiltered - totalExpensesAmountFiltered;
            const totalIncomeOrBudget = totalGainsAmountFiltered; // Assuming total gains is the budget for the period
            document.getElementById('remainingBalanceAmount').textContent = `${formatCurrency(remainingBalance)} of ${formatCurrency(totalIncomeOrBudget)}`;

            let remainingBalancePercentage = totalIncomeOrBudget > 0 ? (remainingBalance / totalIncomeOrBudget) * 100 : 0;
            const displayPercentage = isNaN(remainingBalancePercentage) ? 0 : Math.round(remainingBalancePercentage);
            document.getElementById('remainingBalancePct').textContent = `${displayPercentage}%`;

            let progressOffset = 0;
            let progressColor = 'var(--accent-green)';
            const radius = 34;
            const circumference = 2 * Math.PI * radius;

            if (displayPercentage >= 100) progressOffset = 0;
            else if (displayPercentage > 0) {
                progressOffset = circumference - (displayPercentage / 100) * circumference;
                if (displayPercentage < 25) progressColor = 'var(--accent-red)';
                else if (displayPercentage < 50) progressColor = 'var(--accent-orange)';
            } else {
                progressOffset = circumference;
                progressColor = 'var(--accent-red)';
            }
            const progressCircle = document.querySelector('.progress-ring-progress');
            if (progressCircle) {
                progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
                progressCircle.style.strokeDashoffset = progressOffset;
                progressCircle.style.stroke = progressColor;
            }

            const categoryNames = Object.keys(expenseCategoriesForChart).filter(cat => expenseCategoriesForChart[cat] > 0);
            const categoryAmounts = categoryNames.map(cat => expenseCategoriesForChart[cat]);
            const totalCategoryExpenseForChart = categoryAmounts.reduce((sum, amount) => sum + amount, 0);

            document.getElementById('foodPct').textContent = `${totalCategoryExpenseForChart > 0 ? Math.round((expenseCategoriesForChart.Food / totalCategoryExpenseForChart) * 100) : 0}%`;
            document.getElementById('medicinesPct').textContent = `${totalCategoryExpenseForChart > 0 ? Math.round((expenseCategoriesForChart.Medicines / totalCategoryExpenseForChart) * 100) : 0}%`;
            document.getElementById('shoppingPct').textContent = `${totalCategoryExpenseForChart > 0 ? Math.round((expenseCategoriesForChart.Shopping / totalCategoryExpenseForChart) * 100) : 0}%`;
            document.getElementById('miscPct').textContent = `${totalCategoryExpenseForChart > 0 ? Math.round((expenseCategoriesForChart.Misc / totalCategoryExpenseForChart) * 100) : 0}%`;

            const ctx = document.getElementById('expenseChart');
            if (ctx) {
                if (window.expenseChartInstance) window.expenseChartInstance.destroy();

                const categoryColorMap = {
                    'Food': getComputedStyle(document.documentElement).getPropertyValue('--accent-green').trim(),
                    'Medicines': getComputedStyle(document.documentElement).getPropertyValue('--accent-red').trim(),
                    'Shopping': getComputedStyle(document.documentElement).getPropertyValue('--accent-orange').trim(),
                    'Misc': getComputedStyle(document.documentElement).getPropertyValue('--accent-blue').trim(),
                };

                const chartBackgroundColors = categoryNames.map(cat => categoryColorMap[cat] || 'gray');

                window.expenseChartInstance = new Chart(ctx.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: categoryNames,
                        datasets: [{
                            data: categoryAmounts,
                            backgroundColor: chartBackgroundColors,
                            borderColor: 'var(--card-bg)',
                            borderWidth: 4,
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false, cutout: '80%',
                        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${formatCurrency(c.parsed)}` } } }
                    }
                });
            }

            renderUpcomingBills(); // Call this after allTransactionsData is populated and dashboard updated
        } catch (error) {
            console.error('Error fetching or processing CSV for dashboard:', error);
            // Display a user-friendly error message on the dashboard if data fails to load
            document.getElementById('netExpenseValue').textContent = '₱ Error';
            document.getElementById('remainingBalanceAmount').textContent = 'Data Error';
            document.getElementById('remainingBalancePct').textContent = 'ERR%';
            const expenseChartContainer = document.querySelector('.chart-container');
            if (expenseChartContainer) {
                expenseChartContainer.innerHTML = '<p style="text-align: center; color: var(--accent-red); padding: 2rem;">Could not load expense data.</p>';
            }
        }
    }

    const maskSavingsButton = document.getElementById('maskSavingsButton');
    if (maskSavingsButton) {
        maskSavingsButton.addEventListener('click', () => {
            const savingsAmountSpan = document.getElementById('savingsAmount');
            if (savingsAmountSpan) {
                // Toggle between masked and actual amount
                if (savingsAmountSpan.textContent.includes('●')) {
                    savingsAmountSpan.textContent = formatCurrency(savingsAmountSpan.dataset.actualAmount || 0);
                    maskSavingsButton.textContent = 'Mask';
                } else {
                    savingsAmountSpan.textContent = '₱ ●●●,●●●.●●'; // Masked display
                    maskSavingsButton.textContent = 'Show';
                }
            }
        });
    }

    // --- Filter Modal Pop-up Logic for Dashboard ---
    const filterChartButton = document.getElementById('filterChartButton');
    const filterModalOverlay = document.getElementById('filterModalOverlay');
    const closeFilterModalButton = document.getElementById('closeFilterModalButton');
    const dashboardFilterMonthSelect = document.getElementById('filterMonth');
    const dashboardFilterYearSelect = document.getElementById('filterYear');
    const applyChartFilterButton = document.getElementById('applyChartFilter');

    if (filterChartButton && filterModalOverlay && closeFilterModalButton && dashboardFilterMonthSelect && dashboardFilterYearSelect && applyChartFilterButton) {
        filterChartButton.addEventListener('click', () => {
            filterModalOverlay.classList.add('active');
        });

        closeFilterModalButton.addEventListener('click', () => {
            filterModalOverlay.classList.remove('active');
        });

        // Close modal if clicked outside
        filterModalOverlay.addEventListener('click', (event) => {
            if (event.target === filterModalOverlay) {
                filterModalOverlay.classList.remove('active');
            }
        });

        applyChartFilterButton.addEventListener('click', () => {
            const selectedMonth = dashboardFilterMonthSelect.value;
            const selectedYear = dashboardFilterYearSelect.value;
            updateDashboard(selectedMonth, selectedYear); // Re-render dashboard with filters
            filterModalOverlay.classList.remove('active'); // Close modal

            // Clear month selection in the month navigation if a year filter is applied
            const dashboardMonthButtons = document.querySelectorAll('#dashboard-page .months-nav .month-button');
            dashboardMonthButtons.forEach(btn => btn.classList.remove('active'));
        });
    }

    // --- Upcoming Bills Logic ---

    /**
     * Calculates the next upcoming salary date based on a bi-weekly schedule starting June 20, 2025.
     * @returns {Date} The date of the next salary payment.
     */
    function calculateNextSalaryDate() {
        const today = new Date();
        today.setHours(0,0,0,0); // Normalize today to start of day
        const firstPayday = new Date('2025-06-20T00:00:00'); // Thursday, June 20, 2025 (user's given start date)
        
        let currentIterDate = new Date(firstPayday);

        // Find the *first* payday that is greater than or equal to today
        // This 'currentIterDate' will be the payday that 'covers' the current period's bills.
        while (currentIterDate < today) {
            currentIterDate.setDate(currentIterDate.getDate() + 14); // Add two weeks
        }

        // If 'currentIterDate' is exactly 'today', it means today is a payday.
        // In this case, the "upcoming scheduled salary" for which bills will show
        // is the *next* payday (two weeks from now), meaning bills due *after* today's payday.
        // If 'currentIterDate' is in the future relative to 'today', then 'currentIterDate' is already the target.
        if (currentIterDate.getTime() === today.getTime()) {
             currentIterDate.setDate(currentIterDate.getDate() + 14);
        }

        return currentIterDate;
    }

    /**
     * Determines which upcoming bills to display based on due dates and payment status.
     * A bill is considered "paid" if a transaction exists within a 5-day window around its due date
     * and its description/kind matches the bill name.
     * @returns {Array<Object>} A list of bills to display.
     */
    function getUpcomingBills() {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        const nextSalaryDate = calculateNextSalaryDate(); // The payday marking the end of the period for bill display

        const upcomingBills = [];

        BILLS.forEach(bill => {
            let nextDueDate = new Date(today.getFullYear(), today.getMonth(), 1); // Start of current month for calculating due date

            if (bill.dueDay === 'end') {
                nextDueDate = new Date(today.getFullYear(), today.getMonth() + 1, 0); // Last day of current month
            } else {
                nextDueDate.setDate(bill.dueDay); // Set to specific day of current month
            }

            // If the calculated nextDueDate is in the past, move it to the next month/year
            // This ensures we always get a future or present due date.
            while (nextDueDate < today) {
                nextDueDate.setMonth(nextDueDate.getMonth() + 1);
                if (bill.dueDay === 'end') {
                    nextDueDate = new Date(nextDueDate.getFullYear(), nextDueDate.getMonth() + 1, 0);
                } else {
                    nextDueDate.setDate(bill.dueDay);
                }
            }
            
            // Define the payment window for this bill: 5 days before to 5 days after due date
            const paymentWindowStart = new Date(nextDueDate);
            paymentWindowStart.setDate(nextDueDate.getDate() - 5);
            paymentWindowStart.setHours(0, 0, 0, 0);

            const paymentWindowEnd = new Date(nextDueDate);
            paymentWindowEnd.setDate(nextDueDate.getDate() + 5);
            paymentWindowEnd.setHours(23, 59, 59, 999);

            let isBillPaid = false;

            // Check if there's a transaction marking this bill as paid
            // Use allTransactionsData, which should be globally available and fully populated.
            for (const transaction of allTransactionsData) {
                const transactionDate = new Date(transaction.Date);
                transactionDate.setHours(0, 0, 0, 0);

                const transactionDescription = (transaction.Description || transaction['What kind?'] || '').toLowerCase();
                const billNameLower = bill.name.toLowerCase();

                // Check for date range, type 'expenses', and flexible name match
                const transactionWithinWindow = (transactionDate >= paymentWindowStart && transactionDate <= paymentWindowEnd);
                const isExpenseType = (transaction.Type && transaction.Type.toLowerCase() === 'expenses');
                
                // Flexible name matching: bill name in description OR description in bill name
                const nameMatches = (transactionDescription.includes(billNameLower) || billNameLower.includes(transactionDescription));

                if (transactionWithinWindow && isExpenseType && nameMatches) {
                    isBillPaid = true;
                    break; // Found a payment, no need to check further for this bill
                }
            }

            // Only include bills whose due date falls within the current salary period (today to nextSalaryDate)
            // AND have not been marked as paid by a transaction.
            if (nextDueDate >= today && nextDueDate <= nextSalaryDate && !isBillPaid) {
                upcomingBills.push({
                    name: bill.name,
                    dueDate: nextDueDate,
                    amount: 'N/A' // Placeholder, as amount data is not provided in problem
                });
            }
        });

        // Sort bills by due date
        upcomingBills.sort((a, b) => a.dueDate - b.dueDate);
        return upcomingBills;
    }

    /**
     * Renders the upcoming bills list on the dashboard.
     */
    function renderUpcomingBills() {
        const upcomingBillsListDiv = document.getElementById('upcomingBillsList');
        if (!upcomingBillsListDiv) return;

        const billsToDisplay = getUpcomingBills();
        upcomingBillsListDiv.innerHTML = ''; // Clear previous bills

        if (billsToDisplay.length === 0) {
            upcomingBillsListDiv.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 1rem;">No upcoming bills for this pay period.</p>';
            return;
        }

        billsToDisplay.forEach(bill => {
            const billItemDiv = document.createElement('div');
            billItemDiv.classList.add('upcoming-bill-item');

            const detailsDiv = document.createElement('div');
            detailsDiv.classList.add('upcoming-bill-details');

            const nameSpan = document.createElement('span');
            nameSpan.classList.add('upcoming-bill-name');
            nameSpan.textContent = bill.name;
            detailsDiv.appendChild(nameSpan);

            const dateSpan = document.createElement('span');
            dateSpan.classList.add('upcoming-bill-date');
            dateSpan.textContent = `Due: ${bill.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            detailsDiv.appendChild(dateSpan);
            
            billItemDiv.appendChild(detailsDiv);
            upcomingBillsListDiv.appendChild(billItemDiv);
        });
    }


    // --- Generic Pagination Setup ---
    /**
     * Sets up pagination controls for a given list.
     * @param {HTMLElement} containerElement - The DOM element to append pagination buttons to.
     * @param {number} totalPages - Total number of pages.
     * @param {number} currentPage - The currently active page.
     * @param {function(number): void} onPageChangeCallback - Callback function when a page button is clicked.
     */
    function setupPaginationControls(containerElement, totalPages, currentPage, onPageChangeCallback) {
        containerElement.innerHTML = ''; // Clear existing controls
        if (totalPages <= 1) return;

        const createButton = (text, page, isDisabled = false, isActive = false, isEllipsis = false) => {
            const button = document.createElement(isEllipsis ? 'span' : 'button');
            button.textContent = text;
            if (!isEllipsis) {
                button.disabled = isDisabled;
                if (isActive) button.classList.add('active');
                button.addEventListener('click', () => {
                    if (!isDisabled) onPageChangeCallback(page);
                });
            } else {
                button.style.padding = '8px 12px'; // Match button padding
                button.style.color = 'var(--text-light)';
            }
            return button;
        };

        // Previous Button
        containerElement.appendChild(createButton('Previous', currentPage - 1, currentPage === 1));

        // Page Number Buttons (with ellipsis for many pages)
        const maxPagesToShow = 5; // Max number of direct page buttons
        if (totalPages <= maxPagesToShow + 2) { // Show all if not too many
            for (let i = 1; i <= totalPages; i++) {
                containerElement.appendChild(createButton(i, i, false, i === currentPage));
            }
        } else {
            containerElement.appendChild(createButton(1, 1, false, 1 === currentPage)); // First page
            if (currentPage > 3) {
                containerElement.appendChild(createButton('...', 0, false, false, true)); // Ellipsis
            }

            let startPage = Math.max(2, currentPage - 1);
            let endPage = Math.min(totalPages - 1, currentPage + 1);

            if (currentPage <= 3) {
                endPage = Math.min(totalPages -1, maxPagesToShow -1); // Show 1, 2, 3, ..., last
            }
            if (currentPage >= totalPages - 2) {
                startPage = Math.max(2, totalPages - (maxPagesToShow - 2) ); // Show 1, ..., last-2, last-...
            }

            for (let i = startPage; i <= endPage; i++) {
                containerElement.appendChild(createButton(i, i, false, i === currentPage));
            }

            if (currentPage < totalPages - 2) {
                containerElement.appendChild(createButton('...', 0, false, false, true)); // Ellipsis
            }
            containerElement.appendChild(createButton(totalPages, totalPages, false, totalPages === currentPage)); // Last page
        }

        // Next Button
        containerElement.appendChild(createButton('Next', currentPage + 1, currentPage === totalPages));
    }


    // --- Transactions Page Specific Logic (transactions.html) ---
    /**
     * Fetches and processes transaction data for the transactions page.
     * Initializes filters and renders transactions for the current month.
     */
    async function fetchAndProcessTransactions() {
        if (!document.getElementById('transactions-page')) return;
        try {
            const response = await fetch(CSV_URL);
            const csv = await response.text();
            allTransactionsData = parseCSV(csv); // Store raw data globally


            populateCategoryFilter();
            const today = new Date();
            let initialMonth = today.getMonth() + 1;

            // Set initial active month button
            const monthButtons = document.querySelectorAll('#transactions-page .month-button');
            monthButtons.forEach(button => {
                button.classList.remove('active');
                if (parseInt(button.dataset.month) === initialMonth) {
                    button.classList.add('active');
                }
            });
            currentTransactionsPage = 1; // Reset page for initial load
            renderTransactions(initialMonth); // Initial render
        } catch (error) {
            console.error('Error fetching or processing CSV for transactions:', error);
            const transactionsListDiv = document.getElementById('transactionsList');
            if (transactionsListDiv) transactionsListDiv.innerHTML = '<p style="text-align: center; color: var(--accent-red); padding: 2rem;">Error loading transactions.</p>';
        }
    }

    /**
     * Populates the category filter dropdown on the transactions page.
     */
    function populateCategoryFilter() {
        const categoryFilterDropdown = document.getElementById('categoryFilterDropdown');
        if (!categoryFilterDropdown) return;
        categoryFilterDropdown.innerHTML = '<option value="">All Categories</option>';
        const uniqueCategories = new Set();
        allTransactionsData.forEach(entry => {
            if (entry['What kind?']) uniqueCategories.add(entry['What kind?'].trim());
            if (entry.Type) uniqueCategories.add(entry.Type.trim()); // Add "Gains" and "Expenses" as main types
        });

        const sortedCategories = Array.from(uniqueCategories).sort();
        const prioritized = [];
        if (sortedCategories.includes('Gains')) { prioritized.push('Gains'); sortedCategories.splice(sortedCategories.indexOf('Gains'), 1); }
        if (sortedCategories.includes('Expenses')) { prioritized.push('Expenses'); sortedCategories.splice(sortedCategories.indexOf('Expenses'), 1); }
        
        prioritized.push(...sortedCategories.filter(cat => !['salary', 'allowance', 'savings contribution'].includes(cat.toLowerCase()))); // Avoid redundant sub-categories if "Gains" is chosen
        // Ensure 'Savings' is a filter option for transactions page if it exists
        if (sortedCategories.includes('Savings')) {
             if (!prioritized.includes('Savings')) {
                 prioritized.push('Savings');
             }
        }


        prioritized.forEach(category => {
            if (category) {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                categoryFilterDropdown.appendChild(option);
            }
        });
    }

    /**
     * Renders transactions based on selected filters and pagination.
     * @param {number|null} selectedMonth - The month to filter by (1-12), or null for date range/all.
     * @param {string} selectedCategory - The category to filter by, or empty string for all.
     * @param {string|null} startDate - Start date string for range filter (YYYY-MM-DD), or null.
     * @param {string|null} endDate - End date string for range filter (YYYY-MM-DD), or null.
     */
    function renderTransactions(selectedMonth, selectedCategory = '', startDate = null, endDate = null) {
        const transactionsListDiv = document.getElementById('transactionsList');
        const paginationControlsDiv = document.getElementById('transactionsPaginationControls');
        if (!transactionsListDiv || !paginationControlsDiv) return;

        let filteredData = allTransactionsData.filter(entry => {
            const amount = parseFloat(entry.Amount);
            const date = new Date(entry.Date);
            const entryType = entry.Type ? entry.Type.toLowerCase() : '';
            const entryWhatKind = entry['What kind?'] ? entry['What kind?'].toLowerCase() : '';

            if (isNaN(amount) || isNaN(date.getTime()) || !entryType) {
                console.warn('Skipping malformed entry:', entry);
                return false;
            }

            const entryDate = new Date(entry.Date);
            entryDate.setHours(0, 0, 0, 0);

            // Filter by month if no date range is provided
            if (selectedMonth && !startDate && !endDate && entryDate.getMonth() + 1 !== selectedMonth) return false;

            if (selectedCategory) {
                const lowerCaseSelectedCategory = selectedCategory.toLowerCase();
                
                if (lowerCaseSelectedCategory === 'gains') { 
                    if (entryType !== 'gains') return false; 
                } else if (lowerCaseSelectedCategory === 'expenses') { 
                    if (entryType !== 'expenses') return false; 
                } else if (entryWhatKind !== lowerCaseSelectedCategory) {
                    return false; 
                }
            }

            if (startDate && endDate) {
                const start = new Date(startDate); start.setHours(0, 0, 0, 0);
                const end = new Date(endDate); end.setHours(23, 59, 59, 999);
                if (entryDate < start || entryDate > end) return false;
            }
            return true;
        });

        filteredData.sort((a, b) => new Date(b.Date) - new Date(a.Date)); // Sort by date desc

        const totalItems = filteredData.length;
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (currentTransactionsPage > totalPages && totalPages > 0) currentTransactionsPage = totalPages;
        if (currentTransactionsPage < 1 && totalPages > 0) currentTransactionsPage = 1;
        else if (totalPages === 0) currentTransactionsPage = 1;


        const startIndex = (currentTransactionsPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const paginatedData = filteredData.slice(startIndex, endIndex);

        transactionsListDiv.innerHTML = ''; // Clear previous items
        const groupedTransactions = {};
        const today = new Date(); today.setHours(0,0,0,0);
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

        paginatedData.forEach(entry => {
            const entryDate = new Date(entry.Date); entryDate.setHours(0,0,0,0);
            let dateHeader;
            if (entryDate.getTime() === today.getTime()) dateHeader = 'Today';
            else if (entryDate.getTime() === yesterday.getTime()) dateHeader = 'Yesterday';
            else dateHeader = entryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            if (!groupedTransactions[dateHeader]) groupedTransactions[dateHeader] = [];
            groupedTransactions[dateHeader].push(entry);
        });

        Object.keys(groupedTransactions).sort((a,b) => {
            if (a === 'Today') return -1; if (b === 'Today') return 1;
            if (a === 'Yesterday') return -1; if (b === 'Yesterday') return 1;
            return new Date(b) - new Date(a);
        }).forEach(dateHeader => {
            const groupDiv = document.createElement('div'); groupDiv.classList.add('transaction-group');
            const headerDiv = document.createElement('div'); headerDiv.classList.add('transaction-date-header'); headerDiv.textContent = dateHeader;
            groupDiv.appendChild(headerDiv);
            groupedTransactions[dateHeader].sort((a,b) => { /* time sort */
                const timeA = a.Time ? a.Time.split(':').map(Number) : [0,0,0];
                const timeB = b.Time ? b.Time.split(':').map(Number) : [0,0,0];
                if(timeA[0] !== timeB[0]) return timeA[0] - timeB[0];
                if(timeA[1] !== timeB[1]) return timeA[1] - timeB[1];
                return timeA[2] - timeB[2];
            }).forEach(entry => {
                const itemDiv = document.createElement('div'); itemDiv.classList.add('transaction-item');
                const categoryIconDiv = document.createElement('div'); categoryIconDiv.classList.add('transaction-category-icon');
                const { category: mappedCategory, icon: categoryIcon } = mapCategoryAndIcon(entry);
                if (entry.Type.toLowerCase() === 'gains') categoryIconDiv.classList.add('category-gain');
                else {
                    switch (mappedCategory.toLowerCase()) {
                        case 'food': categoryIconDiv.classList.add('category-food'); break;
                        case 'medicines': categoryIconDiv.classList.add('category-medicines'); break;
                        case 'shopping': categoryIconDiv.classList.add('category-shopping'); break;
                        case 'transportation': categoryIconDiv.classList.add('category-transportation'); break;
                        case 'utility bills': categoryIconDiv.classList.add('category-utility-bills'); break;
                        case 'savings': categoryIconDiv.classList.add('category-savings-expense'); break; // New class for savings expenses
                        default: categoryIconDiv.classList.add('category-misc'); break;
                    }
                }
                categoryIconDiv.textContent = categoryIcon; itemDiv.appendChild(categoryIconDiv);
                const detailsDiv = document.createElement('div'); detailsDiv.classList.add('transaction-details');
                const nameSpan = document.createElement('span'); nameSpan.classList.add('transaction-name');
                nameSpan.textContent = entry.Description || entry['What kind?'] || 'N/A'; detailsDiv.appendChild(nameSpan);
                const timeSpan = document.createElement('span'); timeSpan.classList.add('transaction-time');
                timeSpan.textContent = entry.Time || ''; detailsDiv.appendChild(timeSpan);
                itemDiv.appendChild(detailsDiv);
                const amountSpan = document.createElement('span'); amountSpan.classList.add('transaction-amount');
                amountSpan.textContent = formatCurrency(entry.Amount);
                if (entry.Type.toLowerCase() === 'expenses') amountSpan.classList.add('expense');
                else if (entry.Type.toLowerCase() === 'gains') amountSpan.classList.add('gain');
                itemDiv.appendChild(amountSpan);
                groupDiv.appendChild(itemDiv);
            });
            transactionsListDiv.appendChild(groupDiv);
        });

        if (paginatedData.length === 0) {
            transactionsListDiv.innerHTML = `<p style="text-align: center; color: var(--text-light); padding: 2rem;">No transactions found for ${totalItems > 0 ? 'this page.' : 'the selected filters.'}</p>`;
        }

        setupPaginationControls(paginationControlsDiv, totalPages, currentTransactionsPage, (newPage) => {
            currentTransactionsPage = newPage;
            const currentCat = document.getElementById('categoryFilterDropdown').value;
            const currentStart = document.getElementById('startDateInput').value;
            const currentEnd = document.getElementById('endDateInput').value;
            const activeMonthBtn = document.querySelector('.months-nav .month-button.active');
            const currentSelMonth = activeMonthBtn ? parseInt(activeMonthBtn.dataset.month) : null;
            const finalMonthToPass = (currentStart || currentEnd) ? null : currentSelMonth;
            renderTransactions(finalMonthToPass, currentCat, currentStart, currentEnd);
        });
    }

    // --- Savings Page Specific Logic (savings.html) ---
    /**
     * Updates the savings page with total savings and recent savings transactions.
     */
    async function updateSavingsPage() {
        if (!document.getElementById('savings-page')) return;
        const totalSavingsAmountSpan = document.getElementById('totalSavingsAmount');

        try {
            const response = await fetch(CSV_URL);
            const csv = await response.text();
            const allData = parseCSV(csv);

            let overallTotalSavings = 0;
            // Filter and calculate savings based *only* on 'savings' or 'savings contribution' entries
            allSavingsDataGlobal = allData.filter(entry => {
                const amount = parseFloat(entry.Amount);
                const entryType = entry.Type ? entry.Type.toLowerCase() : '';
                const entryWhatKind = entry['What kind?'] ? entry['What kind?'].toLowerCase() : '';

                const isSavingsEntry = (entryWhatKind === 'savings' || entryWhatKind === 'savings contribution') && !isNaN(amount);

                if (isSavingsEntry) {
                    // Logic based on previous understanding of user's CSV data:
                    // 'Gains' of 'savings contribution' or 'savings' means money MOVED OUT of general funds into savings (decreases general funds, increases savings)
                    if (entryType === 'gains') {
                        overallTotalSavings += amount; // Treat this as an increase to savings
                    }
                    // 'Expenses' of 'savings' means money MOVED OUT of general expenses to savings (increases savings)
                    else if (entryType === 'expenses') {
                        overallTotalSavings += amount; // Treat this as an increase to savings
                    }
                    // If you have "withdrawal from savings" that is a "gain" to general funds,
                    // you might need another condition like:
                    // else if (entryType === 'gains' && entryWhatKind === 'savings withdrawal') {
                    //     overallTotalSavings -= amount;
                    // }
                }
                return isSavingsEntry; // Only keep these entries for display in savings list
            });
            
            if (totalSavingsAmountSpan) totalSavingsAmountSpan.textContent = formatCurrency(overallTotalSavings);
            
            currentSavingsPage = 1; // Reset page on initial load/update
            renderSavingsEntries(); // Call render function (it will use allSavingsDataGlobal)

        } catch (error) {
            console.error('Error fetching or processing CSV for savings page:', error);
            if (totalSavingsAmountSpan) totalSavingsAmountSpan.textContent = '₱ Error';
            const savingsListDiv = document.getElementById('savingsTransactionsList');
            if (savingsListDiv) savingsListDiv.innerHTML = '<p style="text-align: center; color: var(--accent-red); padding: 2rem;">Error loading savings data.</p>';
        }
    }

    /**
     * Renders the paginated list of savings entries.
     */
    function renderSavingsEntries() {
        const savingsListDiv = document.getElementById('savingsTransactionsList');
        const paginationControlsDiv = document.getElementById('savingsPaginationControls');
        if (!savingsListDiv || !paginationControlsDiv) return;

        const sortedSavingsData = [...allSavingsDataGlobal].sort((a, b) => new Date(b.Date) - new Date(a.Date));

        const totalItems = sortedSavingsData.length;
        const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
        if (currentSavingsPage > totalPages && totalPages > 0) currentSavingsPage = totalPages;
        if (currentSavingsPage < 1 && totalPages > 0) currentSavingsPage = 1;
        else if (totalPages === 0) currentSavingsPage = 1;


        const startIndex = (currentSavingsPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const paginatedData = sortedSavingsData.slice(startIndex, endIndex);

        savingsListDiv.innerHTML = ''; // Clear previous items

        const groupedTransactions = {};
        const today = new Date(); today.setHours(0,0,0,0);
        const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

        paginatedData.forEach(entry => {
            const entryDate = new Date(entry.Date); entryDate.setHours(0,0,0,0);
            let dateHeader;
            if (entryDate.getTime() === today.getTime()) dateHeader = 'Today';
            else if (entryDate.getTime() === yesterday.getTime()) dateHeader = 'Yesterday';
            else dateHeader = entryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            if (!groupedTransactions[dateHeader]) groupedTransactions[dateHeader] = [];
            groupedTransactions[dateHeader].push(entry);
        });

        Object.keys(groupedTransactions).sort((a,b) => {
             if (a === 'Today') return -1; if (b === 'Today') return 1;
             if (a === 'Yesterday') return -1; if (b === 'Yesterday') return 1;
             return new Date(b) - new Date(a);
        }).forEach(dateHeader => {
            const groupDiv = document.createElement('div'); groupDiv.classList.add('transaction-group');
            const headerDiv = document.createElement('div'); headerDiv.classList.add('transaction-date-header'); headerDiv.textContent = dateHeader;
            groupDiv.appendChild(headerDiv);
            groupedTransactions[dateHeader].sort((a,b) => {
                const timeA = a.Time ? a.Time.split(':').map(Number) : [0,0,0];
                const timeB = b.Time ? b.Time.split(':').map(Number) : [0,0,0];
                if(timeA[0] !== timeB[0]) return timeA[0] - timeB[0];
                if(timeA[1] !== timeB[1]) return timeA[1] - timeB[1];
                return timeA[2] - timeB[2];
            }).forEach(entry => {
                const itemDiv = document.createElement('div'); itemDiv.classList.add('transaction-item');
                const categoryIconDiv = document.createElement('div'); categoryIconDiv.classList.add('transaction-category-icon');
                const amountSpan = document.createElement('span'); amountSpan.classList.add('transaction-amount');

                // For savings entries, decide icon and color
                const lowerCaseType = entry.Type ? entry.Type.toLowerCase() : '';
                const lowerCaseWhatKind = entry['What kind?'] ? entry['What kind?'].toLowerCase() : '';

                if (lowerCaseType === 'gains' && (lowerCaseWhatKind === 'savings contribution' || lowerCaseWhatKind === 'savings')) {
                    categoryIconDiv.classList.add('category-gain'); // Represents a deposit/contribution
                    categoryIconDiv.textContent = '⬆️'; // Up arrow for money going in
                    amountSpan.classList.add('gain');
                } else if (lowerCaseType === 'expenses' && lowerCaseWhatKind === 'savings') {
                    categoryIconDiv.classList.add('category-savings-expense'); // Use a specific class for savings expense
                    categoryIconDiv.textContent = '📥'; // In-box for money going into savings
                    amountSpan.classList.add('gain'); // Treat as a positive for overall savings calculation view
                }
                // Add more conditions if there are explicit "savings withdrawals" that are type "gains"
                // else if (lowerCaseType === 'gains' && lowerCaseWhatKind === 'savings withdrawal') {
                //     categoryIconDiv.classList.add('category-expense'); // Represents a withdrawal
                //     categoryIconDiv.textContent = '⬇️'; // Down arrow for money coming out
                //     amountSpan.classList.add('expense');
                // }


                itemDiv.appendChild(categoryIconDiv);
                
                const detailsDiv = document.createElement('div'); detailsDiv.classList.add('transaction-details');
                const nameSpan = document.createElement('span'); nameSpan.classList.add('transaction-name');
                // Updated logic for display text based on reversed savings logic
                nameSpan.textContent = entry.Description || (entry.Type && entry.Type.toLowerCase() === 'gains' ? 'Savings Contribution' : 'Savings Deposit'); // Refined descriptions
                detailsDiv.appendChild(nameSpan);
                const timeSpan = document.createElement('span'); timeSpan.classList.add('transaction-time');
                timeSpan.textContent = entry.Time || ''; detailsDiv.appendChild(timeSpan);
                itemDiv.appendChild(detailsDiv);
                
                amountSpan.textContent = formatCurrency(entry.Amount); itemDiv.appendChild(amountSpan);
                groupDiv.appendChild(itemDiv);
            });
            savingsListDiv.appendChild(groupDiv);
        });
        
        if (paginatedData.length === 0) {
            savingsListDiv.innerHTML = `<p style="text-align: center; color: var(--text-light); padding: 2rem;">No savings contributions or withdrawals ${totalItems > 0 ? 'on this page.' : 'found.'}</p>`;
        }

        setupPaginationControls(paginationControlsDiv, totalPages, currentSavingsPage, (newPage) => {
            currentSavingsPage = newPage;
            renderSavingsEntries();
        });
    }


    // --- Calculator Logic ---
    const calculatorOverlay = document.getElementById('calculatorOverlay');
    const calculatorDisplay = document.getElementById('calculatorDisplay');
    const calculatorButtons = document.querySelector('.calculator-buttons');
    const closeCalculatorButton = document.getElementById('closeCalculatorButton');
    const openCalculatorFab = document.getElementById('openCalculatorFab');

    let currentInput = '0';
    let firstOperand = null;
    let operator = null;
    let waitingForSecondOperand = false;

    function updateDisplay() { if(calculatorDisplay) calculatorDisplay.value = currentInput; }
    function resetCalculator() {
        currentInput = '0';
        firstOperand = null;
        operator = null;
        waitingForSecondOperand = false;
    }

    function inputDigit(digit) {
        if (currentInput === 'Error') currentInput = '0';
        if (waitingForSecondOperand) {
            currentInput = digit;
            waitingForSecondOperand = false;
        } else {
            currentInput = currentInput === '0' ? digit : currentInput + digit;
        }
        updateDisplay();
    }

    function inputDecimal(dot) {
        if (currentInput === 'Error') currentInput = '0.';
        if (waitingForSecondOperand) {
            currentInput = '0.';
            waitingForSecondOperand = false;
            updateDisplay(); return;
        }
        if (!currentInput.includes(dot)) currentInput += dot;
        updateDisplay();
    }

    const performCalculation = {
        'divide': (first, second) => second === 0 ? 'Error' : first / second,
        'multiply': (first, second) => first * second,
        'add': (first, second) => first + second,
        'subtract': (first, second) => first - second,
    };

    function handleOperator(nextOperator) {
        if (currentInput === 'Error' && nextOperator) {
             if (firstOperand !== null) {
                currentInput = String(firstOperand);
                waitingForSecondOperand = false;
             } else {
                resetCalculator();
                updateDisplay();
                return;
             }
        }

        const inputValue = parseFloat(currentInput);
        if (isNaN(inputValue)) {
            if (operator && waitingForSecondOperand) {
                 operator = nextOperator;
                 return;
            }
            console.warn("Calculator: Input is NaN, cannot process operator.");
            return;
        }


        if (operator && waitingForSecondOperand) {
            operator = nextOperator; return;
        }
        if (firstOperand === null) {
            firstOperand = inputValue;
        } else if (operator) {
            const result = performCalculation[operator](firstOperand, inputValue);
            if (result === 'Error' || isNaN(result)) {
                currentInput = 'Error';
                firstOperand = null;
                operator = null;
                waitingForSecondOperand = true;
            } else {
                currentInput = String(parseFloat(result.toFixed(7)));
                firstOperand = parseFloat(currentInput);
            }
        }
        waitingForSecondOperand = true;
        operator = nextOperator;
        updateDisplay();
    }


    if (calculatorButtons) {
        calculatorButtons.addEventListener('click', (event) => {
            const { target } = event;
            if (!target.matches('button')) return;
            const action = target.dataset.action;

            if (target.classList.contains('operator')) { handleOperator(action); return; }
            if (target.classList.contains('decimal')) { inputDecimal('.'); return; }
            if (action === 'clear') { resetCalculator(); updateDisplay(); return; }
            if (action === 'backspace') {
                if (currentInput === 'Error') { resetCalculator(); }
                else { currentInput = currentInput.length > 1 ? currentInput.slice(0, -1) : '0';}
                updateDisplay(); return;
            }
            if (action === 'calculate') {
                if (operator === null || firstOperand === null) return;
                
                const inputValue = parseFloat(currentInput);
                if (isNaN(inputValue) && currentInput !== 'Error') {
                    currentInput = 'Error';
                    firstOperand = null;
                    operator = null;
                    waitingForSecondOperand = true;
                    updateDisplay();
                    return;
                }

                if (currentInput === 'Error') return;

                let result = performCalculation[operator](firstOperand, inputValue);
                if (result === 'Error' || isNaN(result)) {
                    currentInput = 'Error';
                } else {
                    currentInput = String(parseFloat(result.toFixed(7)));
                }
                firstOperand = parseFloat(currentInput);
                if (currentInput === 'Error') firstOperand = null;

                operator = null;
                waitingForSecondOperand = true;
                updateDisplay();
                return;
            }
            if (target.classList.contains('digit')) { inputDigit(target.textContent); }
        });
    }

    if (openCalculatorFab) {
        openCalculatorFab.addEventListener('click', () => {
            calculatorOverlay.classList.add('active');
            resetCalculator(); updateDisplay();
        });
    }
    if (closeCalculatorButton) closeCalculatorButton.addEventListener('click', () => calculatorOverlay.classList.remove('active'));
    if (calculatorOverlay) calculatorOverlay.addEventListener('click', (event) => { if (event.target === calculatorOverlay) calculatorOverlay.classList.remove('active'); });

    // --- Common Logic & Event Listeners ---
    const addTransactionFab = document.getElementById('addTransactionFab');
    if (addTransactionFab) addTransactionFab.addEventListener('click', () => window.open(GOOGLE_FORM_URL, '_blank'));

    // Initialize page-specific functions based on the current HTML file
    if (document.getElementById('dashboard-page')) {
        const dashboardMonthButtons = document.querySelectorAll('#dashboard-page .months-nav .month-button');
        const today = new Date();
        const currentMonth = today.getMonth() + 1; // 1-indexed

        // Set initial active month button on dashboard
        dashboardMonthButtons.forEach(button => {
            button.classList.remove('active');
            if (parseInt(button.dataset.month) === currentMonth) {
                button.classList.add('active');
            }
        });

        // Event listeners for month buttons on dashboard
        dashboardMonthButtons.forEach(button => {
            button.addEventListener('click', function() {
                dashboardMonthButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                const selectedMonth = parseInt(this.dataset.month);
                // Clear year filter when a month is selected
                if (dashboardFilterYearSelect) dashboardFilterYearSelect.value = 'All';
                updateDashboard(selectedMonth); // Pass selected month to update dashboard
            });
        });

        updateDashboard(currentMonth); // Initial call to load data and render chart for current month
    } else if (document.getElementById('transactions-page')) {
        const filterButton = document.getElementById('filterButton');
        const filterOptionsContainer = document.getElementById('filterOptionsContainer');
        const categoryFilterDropdown = document.getElementById('categoryFilterDropdown');
        const startDateInput = document.getElementById('startDateInput');
        const endDateInput = document.getElementById('endDateInput');
        const applyFiltersButton = document.getElementById('applyFiltersButton');
        const clearFiltersButton = document.getElementById('clearFiltersButton');
        const monthButtons = document.querySelectorAll('#transactions-page .months-nav .month-button');

        if (filterButton) filterButton.addEventListener('click', () => filterOptionsContainer.style.display = filterOptionsContainer.style.display === 'flex' ? 'none' : 'flex');
        
        if (applyFiltersButton) {
            applyFiltersButton.addEventListener('click', () => {
                currentTransactionsPage = 1; // Reset page
                const selectedCategory = categoryFilterDropdown.value;
                const startDate = startDateInput.value;
                const endDate = endDateInput.value;
                monthButtons.forEach(btn => btn.classList.remove('active')); // Clear active month if date range used
                renderTransactions(null, selectedCategory, startDate, endDate); // Pass null for month if date range
                filterOptionsContainer.style.display = 'none';
            });
        }
        if (clearFiltersButton) {
            clearFiltersButton.addEventListener('click', () => {
                currentTransactionsPage = 1; // Reset page
                categoryFilterDropdown.value = ''; startDateInput.value = ''; endDateInput.value = '';
                const today = new Date(); const currentMonth = today.getMonth() + 1;
                monthButtons.forEach(btn => btn.classList.remove('active'));
                const currentMonthBtn = document.querySelector(`#transactions-page .months-nav .month-button[data-month="${currentMonth}"]`);
                if (currentMonthBtn) currentMonthBtn.classList.add('active');
                renderTransactions(currentMonth);
                if(filterOptionsContainer) filterOptionsContainer.style.display = 'none';
            });
        }
        monthButtons.forEach(button => {
            button.addEventListener('click', function() {
                currentTransactionsPage = 1; // Reset page
                monthButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                const selectedMonth = parseInt(this.dataset.month);
                // Clear other filters when a month is selected
                categoryFilterDropdown.value = ''; startDateInput.value = ''; endDateInput.value = '';
                renderTransactions(selectedMonth);
                if(filterOptionsContainer) filterOptionsContainer.style.display = 'none';
            });
        });
        fetchAndProcessTransactions(); // Initial fetch and render
    } else if (document.getElementById('savings-page')) {
        updateSavingsPage();
    }
});
