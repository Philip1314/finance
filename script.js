document.addEventListener('DOMContentLoaded', () => {
    // Corrected CSV URL for reading data from your Google Sheet
    const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgMFbI8pivLbRpc2nL2Gyoxw47PmXEVxvUDrjr-t86gj4-J3QM8uV7m8iJN9wxlYo3IY5FQqqUICei/pub?output=csv';

    // THE GOOGLE FORM LINK FOR THE ADD BUTTON
    const GOOGLE_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSdrDJoOeo264aOn4g2UEe-K-FHpbssBAVmEtOWoW46Q1cwjgg/viewform?usp=header';

    function parseCSV(csv) {
        const lines = csv.split('\n').filter(line => line.trim() !== '');
        if (lines.length === 0) return [];

        const headers = lines[0].split(',').map(header => header.trim());
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(value => value.trim());
            // Basic check for column mismatch to prevent errors
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

    function formatCurrency(amount) {
        const numAmount = parseFloat(amount);
        if (isNaN(numAmount)) {
            return '₱ 0.00';
        }
        // Format as Philippine Peso
        return `₱ ${numAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    // Function to map category and get appropriate icon
    function mapCategoryAndIcon(type, whatKind) {
        let category = 'Misc';
        let icon = '✨'; // Default icon

        const lowerCaseWhatKind = whatKind ? whatKind.toLowerCase() : '';
        const lowerCaseType = type ? type.toLowerCase() : '';

        if (lowerCaseType === 'gains') {
            category = 'Gain';
            switch (lowerCaseWhatKind) {
                case 'salary':
                    icon = '💸';
                    break;
                case 'allowance':
                    icon = '🎁';
                    break;
                // Add more gain categories if needed
                default:
                    icon = '💰'; // Default for other gains
                    break;
            }
        } else if (lowerCaseType === 'expenses') {
            switch (lowerCaseWhatKind) {
                case 'food':
                case 'groceries':
                    category = 'Food';
                    icon = '🍔';
                    break;
                case 'medicines':
                    category = 'Medicines';
                    icon = '💊';
                    break;
                case 'online shopping':
                    category = 'Shopping';
                    icon = '🛍️';
                    break;
                case 'transportation':
                    category = 'Transportation';
                    icon = '🚌';
                    break;
                case 'utility bills':
                    category = 'Utility Bills';
                    icon = '💡';
                    break;
                case 'allowance': // Could be expense if allowance is used for a general category
                    category = 'Misc';
                    icon = '🚶';
                    break;
                // Add more expense categories if needed
                default:
                    category = 'Misc';
                    icon = '✨';
                    break;
            }
        }
        return { category, icon };
    }

    // --- Dashboard Specific Logic (index.html) ---
    async function updateDashboard() {
        if (!document.getElementById('dashboard-page')) return; // Only run on dashboard page

        try {
            const response = await fetch(CSV_URL);
            const csv = await response.text();
            const data = parseCSV(csv);

            let totalExpensesAmount = 0;
            let totalGainsAmount = 0;

            // Initialize categories for the donut chart
            const expenseCategoriesForChart = {
                Food: 0,
                Medicines: 0,
                Shopping: 0,
                Misc: 0,
            };

            data.forEach(entry => {
                const amount = parseFloat(entry.Amount);
                const entryType = entry.Type ? entry.Type.toLowerCase() : '';
                const entryWhatKind = entry['What kind?'] ? entry['What kind?'].toLowerCase() : '';

                // Skip entries with invalid amount or missing type/whatKind
                if (isNaN(amount) || !entryType || !entryWhatKind) {
                    console.warn('Dashboard - Skipping malformed entry:', entry);
                    return;
                }

                if (entryType === 'expenses') {
                    totalExpensesAmount += amount;
                    // Distribute expenses into categories for the chart
                    if (entryWhatKind === 'food' || entryWhatKind === 'groceries') {
                        expenseCategoriesForChart.Food += amount;
                    } else if (entryWhatKind === 'medicines') {
                        expenseCategoriesForChart.Medicines += amount;
                    } else if (entryWhatKind === 'online shopping') {
                        expenseCategoriesForChart.Shopping += amount;
                    } else {
                        expenseCategoriesForChart.Misc += amount; // Catch-all for other expenses
                    }
                } else if (entryType === 'gains') {
                    totalGainsAmount += amount;
                }
            });

            // Update Net Expense display
            const netExpenseForDisplay = totalExpensesAmount;
            document.getElementById('netExpenseValue').textContent = formatCurrency(netExpenseForDisplay);

            // Update Remaining Balance display
            const remainingBalance = totalGainsAmount - totalExpensesAmount;
            const totalIncomeOrBudget = totalGainsAmount; // Assuming gains represent the budget/income

            document.getElementById('remainingBalanceAmount').textContent = `${formatCurrency(remainingBalance)} of ${formatCurrency(totalIncomeOrBudget)}`;

            // Calculate and update Remaining Balance Percentage
            let remainingBalancePercentage = 0;
            if (totalIncomeOrBudget > 0) {
                remainingBalancePercentage = (remainingBalance / totalIncomeOrBudget) * 100;
            }
            const displayPercentage = isNaN(remainingBalancePercentage) ? 0 : Math.round(remainingBalancePercentage); // Round for display
            document.getElementById('remainingBalancePct').textContent = `${displayPercentage}%`; // Display percentage inside circle

            // Update Progress Circle (Remaining Balance)
            let progressOffset = 0;
            let progressColor = 'var(--accent-green)'; // Default color for positive balance
            const radius = 34; // Radius of the circle for SVG
            const circumference = 2 * Math.PI * radius; // Circumference for SVG dasharray

            if (displayPercentage >= 100) { // Full progress or more
                progressOffset = 0;
            } else if (displayPercentage > 0) { // Some balance remaining
                progressOffset = circumference - (displayPercentage / 100) * circumference;
                if (displayPercentage < 25) { // Low balance warning
                    progressColor = 'var(--accent-orange)';
                }
            } else { // No balance or overspent
                progressOffset = circumference; // Circle fully empty
                progressColor = 'var(--accent-red)'; // Red for negative balance
            }

            const progressCircle = document.querySelector('.progress-ring-progress');
            if (progressCircle) {
                progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
                progressCircle.style.strokeDashoffset = progressOffset;
                progressCircle.style.stroke = progressColor;
            }

            // Update Expense Category Percentages for Dashboard Legend
            const categoryNames = ['Food', 'Medicines', 'Shopping', 'Misc'];
            const categoryAmounts = [
                expenseCategoriesForChart.Food,
                expenseCategoriesForChart.Medicines,
                expenseCategoriesForChart.Shopping,
                expenseCategoriesForChart.Misc,
            ];
            const totalCategoryExpenseForChart = categoryAmounts.reduce((sum, amount) => sum + amount, 0);

            // Update percentage texts for each legend item
            document.getElementById('foodPct').textContent = `${totalCategoryExpenseForChart > 0 ? Math.round((expenseCategoriesForChart.Food / totalCategoryExpenseForChart) * 100) : 0}%`;
            document.getElementById('medicinesPct').textContent = `${totalCategoryExpenseForChart > 0 ? Math.round((expenseCategoriesForChart.Medicines / totalCategoryExpenseForChart) * 100) : 0}%`;
            document.getElementById('shoppingPct').textContent = `${totalCategoryExpenseForChart > 0 ? Math.round((expenseCategoriesForChart.Shopping / totalCategoryExpenseForChart) * 100) : 0}%`;
            document.getElementById('miscPct').textContent = `${totalCategoryExpenseForChart > 0 ? Math.round((expenseCategoriesForChart.Misc / totalCategoryExpenseForChart) * 100) : 0}%`;


            // Render Donut Chart
            const ctx = document.getElementById('expenseChart');
            if (ctx) {
                // Destroy existing chart instance if it exists to prevent re-rendering issues
                if (window.expenseChartInstance) {
                    window.expenseChartInstance.destroy();
                }
                // CHART.JS COLORS TO MATCH CSS LEGEND DOT COLORS
                const chartColors = [
                    getComputedStyle(document.documentElement).getPropertyValue('--accent-green').trim(),    // Food
                    getComputedStyle(document.documentElement).getPropertyValue('--accent-red').trim(),      // Medicines
                    getComputedStyle(document.documentElement).getPropertyValue('--accent-orange').trim(),   // Shopping
                    getComputedStyle(document.documentElement).getPropertyValue('--accent-blue').trim()     // Misc
                ];
                window.expenseChartInstance = new Chart(ctx.getContext('2d'), {
                    type: 'doughnut',
                    data: {
                        labels: categoryNames,
                        datasets: [{
                            data: categoryAmounts,
                            backgroundColor: chartColors, // Use the defined colors
                            borderColor: 'var(--card-bg)', // Border color around segments
                            borderWidth: 4, // Donut chart border thickness - adjusted here
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        cutout: '80%', // Thickness of the donut
                        plugins: {
                            legend: {
                                display: false, // Hide default Chart.js legend as we have a custom one
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        let label = context.label || '';
                                        if (label) { label += ': '; }
                                        if (context.parsed !== null) { label += formatCurrency(context.parsed); }
                                        return label;
                                    }
                                }
                            }
                        }
                    }
                });
            }

        } catch (error) {
            console.error('Error fetching or processing CSV for dashboard:', error);
            // Display error messages on dashboard if data fails to load
            if (document.getElementById('netExpenseValue')) document.getElementById('netExpenseValue').textContent = '₱ Error';
            if (document.getElementById('remainingBalanceAmount')) document.getElementById('remainingBalanceAmount').textContent = '₱ Error';
        }
    }

    // --- Transactions Page Specific Logic (transactions.html) ---
    async function renderTransactions(selectedMonth, filterKeyword = '') {
        const transactionsListDiv = document.getElementById('transactionsList');
        if (!transactionsListDiv) return; // Exit if not on transactions page

        try {
            const response = await fetch(CSV_URL);
            const csv = await response.text();
            let data = parseCSV(csv);

            // Filter data by selected month and keyword
            data = data.filter(entry => {
                const amount = parseFloat(entry.Amount);
                const date = new Date(entry.Date);
                const entryType = entry.Type ? entry.Type.toLowerCase() : '';
                const entryWhatKind = entry['What kind?'] ? entry['What kind?'].toLowerCase() : '';

                // Basic data validation for each entry
                if (isNaN(amount) || isNaN(date) || !entryType || !entryWhatKind) {
                    return false; // Skip invalid entries
                }

                const entryDate = new Date(entry.Date);
                entryDate.setHours(0, 0, 0, 0); // Normalize date to start of day

                // Filter by month
                if (entryDate.getMonth() + 1 !== selectedMonth) {
                    return false;
                }

                // Apply keyword filter if present
                if (filterKeyword) {
                    const lowerCaseKeyword = filterKeyword.toLowerCase();
                    const description = entry.Description ? entry.Description.toLowerCase() : '';
                    const whatKind = entry['What kind?'] ? entry['What kind?'].toLowerCase() : '';

                    if (!(description.includes(lowerCaseKeyword) || whatKind.includes(lowerCaseKeyword))) {
                        return false; // Exclude if keyword not found
                    }
                }
                return true; // Include the entry
            });

            // Sort transactions by date (descending)
            data.sort((a, b) => new Date(b.Date) - new Date(a.Date));

            transactionsListDiv.innerHTML = ''; // Clear previous transactions

            const groupedTransactions = {};
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normalize today's date

            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1); // Normalize yesterday's date

            // Group transactions by date for display
            data.forEach(entry => {
                const entryDate = new Date(entry.Date);
                entryDate.setHours(0, 0, 0, 0);

                let dateHeader;
                if (entryDate.getTime() === today.getTime()) {
                    dateHeader = 'Today';
                } else if (entryDate.getTime() === yesterday.getTime()) {
                    dateHeader = 'Yesterday';
                } else {
                    dateHeader = entryDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                }

                if (!groupedTransactions[dateHeader]) {
                    groupedTransactions[dateHeader] = [];
                }
                groupedTransactions[dateHeader].push(entry);
            });

            // Sort dates for display (Today, Yesterday, then chronological)
            const sortedDates = Object.keys(groupedTransactions).sort((a, b) => {
                if (a === 'Today') return -1;
                if (b === 'Today') return 1;
                if (a === 'Yesterday') return -1;
                if (b === 'Yesterday') return 1;
                const dateA = new Date(a);
                const dateB = new Date(b);
                if (!isNaN(dateA) && !isNaN(dateB)) { // Only compare if valid dates
                    return dateB - dateA; // Descending
                }
                return 0; // Maintain order if dates are invalid
            });

            // Render each grouped transaction
            sortedDates.forEach(dateHeader => {
                const groupDiv = document.createElement('div');
                groupDiv.classList.add('transaction-group');

                const headerDiv = document.createElement('div');
                headerDiv.classList.add('transaction-date-header');
                headerDiv.textContent = dateHeader;
                groupDiv.appendChild(headerDiv);

                // Sort transactions within each group by time (ascending)
                groupedTransactions[dateHeader].sort((a, b) => {
                    const timeA = a.Time ? a.Time.split(':').map(Number) : [0, 0, 0];
                    const timeB = b.Time ? b.Time.split(':').map(Number) : [0, 0, 0];
                    if (timeA[0] !== timeB[0]) return timeA[0] - timeB[0];
                    if (timeA[1] !== timeB[1]) return timeA[1] - timeB[1];
                    return timeA[2] - timeB[2]; // Compare seconds if present
                });

                groupedTransactions[dateHeader].forEach(entry => {
                    const itemDiv = document.createElement('div');
                    itemDiv.classList.add('transaction-item');

                    const categoryIconDiv = document.createElement('div');
                    categoryIconDiv.classList.add('transaction-category-icon');

                    const { category: mappedCategory, icon: categoryIcon } = mapCategoryAndIcon(entry.Type, entry['What kind?']);

                    // Assign category-specific background color
                    if (entry.Type && entry.Type.toLowerCase() === 'gains') {
                         categoryIconDiv.classList.add('category-gain');
                    } else {
                        switch (mappedCategory.toLowerCase()) {
                            case 'food': categoryIconDiv.classList.add('category-food'); break;
                            case 'medicines': categoryIconDiv.classList.add('category-medicines'); break;
                            case 'shopping': categoryIconDiv.classList.add('category-shopping'); break;
                            default: categoryIconDiv.classList.add('category-misc'); break;
                        }
                    }

                    categoryIconDiv.textContent = categoryIcon;
                    itemDiv.appendChild(categoryIconDiv);

                    const detailsDiv = document.createElement('div');
                    detailsDiv.classList.add('transaction-details');

                    const nameSpan = document.createElement('span');
                    nameSpan.classList.add('transaction-name');
                    nameSpan.textContent = entry.Description && entry.Description.trim() !== '' ? entry.Description : (entry['What kind?'] && entry['What kind?'].trim() !== '' ? entry['What kind?'] : 'N/A');
                    detailsDiv.appendChild(nameSpan);

                    const timeSpan = document.createElement('span');
                    timeSpan.classList.add('transaction-time');
                    timeSpan.textContent = entry.Time || ''; // Display time if available
                    detailsDiv.appendChild(timeSpan);

                    itemDiv.appendChild(detailsDiv);

                    const amountSpan = document.createElement('span');
                    amountSpan.classList.add('transaction-amount');
                    amountSpan.textContent = formatCurrency(entry.Amount);
                    if (entry.Type && entry.Type.toLowerCase() === 'expenses') {
                        amountSpan.classList.add('expense');
                    } else if (entry.Type && entry.Type.toLowerCase() === 'gains') {
                        amountSpan.classList.add('gain');
                    }
                    itemDiv.appendChild(amountSpan);

                    groupDiv.appendChild(itemDiv);
                });
                transactionsListDiv.appendChild(groupDiv);
            });

            if (data.length === 0) {
                transactionsListDiv.innerHTML = '<p style="text-align: center; color: var(--text-light); padding: 2rem;">No transactions found for this month or filter.</p>';
            }

        } catch (error) {
            console.error('Error fetching or processing CSV for transactions:', error);
            transactionsListDiv.innerHTML = '<p style="text-align: center; color: var(--accent-red); padding: 2rem;">Error loading transactions. Please check the data source.</p>';
        }
    }

    // --- Common Logic & Event Listeners ---

    // Floating Action Button (FAB) click handler - Now opens in a new tab
    const fabButton = document.querySelector('.fab-button');
    if (fabButton) {
        fabButton.addEventListener('click', () => {
            window.open(GOOGLE_FORM_URL, '_blank'); // Open in new tab
        });
    }

    // Determine current page and call relevant functions
    if (document.getElementById('dashboard-page')) {
        updateDashboard();
    } else if (document.getElementById('transactions-page')) {
        const today = new Date();
        const currentMonth = today.getMonth() + 1; // getMonth() is 0-indexed

        // Set initial active month button
        const monthButtons = document.querySelectorAll('.month-button');
        monthButtons.forEach(button => {
            if (parseInt(button.dataset.month) === currentMonth) {
                button.classList.add('active');
            }
        });

        // Set date in profile icon on transactions page
        const profileDateDisplay = document.getElementById('profileDateDisplay');
        if (profileDateDisplay) {
            const monthName = today.toLocaleDateString('en-US', { month: 'short' });
            const dayOfMonth = today.getDate();
            profileDateDisplay.innerHTML = `<span>${monthName}</span><span>${dayOfMonth}</span>`;
        }

        // Render transactions for the current month on load
        renderTransactions(currentMonth);

        // Add event listeners for month buttons
        monthButtons.forEach(button => {
            button.addEventListener('click', function() {
                monthButtons.forEach(btn => btn.classList.remove('active')); // Remove active from all
                this.classList.add('active'); // Add active to clicked
                const month = parseInt(this.dataset.month);
                const currentFilterKeyword = document.getElementById('filterKeyword').value;
                renderTransactions(month, currentFilterKeyword);
            });
        });

        // Filter button functionality
        const filterButton = document.getElementById('filterButton');
        const filterOptions = document.getElementById('filterOptions');
        const applyFilterButton = document.getElementById('applyFilter');
        const filterKeywordInput = document.getElementById('filterKeyword');

        if (filterButton && filterOptions && applyFilterButton && filterKeywordInput) {
            filterButton.addEventListener('click', () => {
                filterOptions.style.display = filterOptions.style.display === 'none' ? 'block' : 'none';
            });

            applyFilterButton.addEventListener('click', () => {
                const activeMonthButton = document.querySelector('.month-button.active');
                const selectedMonth = activeMonthButton ? parseInt(activeMonthButton.dataset.month) : new Date().getMonth() + 1;
                const keyword = filterKeywordInput.value;
                renderTransactions(selectedMonth, keyword);
                filterOptions.style.display = 'none'; // Hide filter options after applying
            });

            // Allow pressing Enter in the keyword input to apply filter
            filterKeywordInput.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault(); // Prevent default form submission if input is part of a form
                    applyFilterButton.click(); // Programmatically click the apply filter button
                }
            });
        }
    }
});
