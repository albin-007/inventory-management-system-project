// TrackCart JavaScript Functions

// Global variables
let currentChart = null;

// Document ready function
$(document).ready(function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'))
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl)
    });
    
    // Initialize modals
    $('.modal').on('hidden.bs.modal', function() {
        $(this).find('form').trigger('reset');
    });
    
    // Auto-hide alerts after 5 seconds
    setTimeout(function() {
        $('.alert').fadeOut();
    }, 5000);
    
    // Initialize charts if data exists
    if (typeof chartData !== 'undefined') {
        initDashboardChart();
    }
});

// Chart initialization function
function initDashboardChart() {
    const ctx = document.getElementById('salesChart');
    if (ctx) {
        if (currentChart) {
            currentChart.destroy();
        }
        
        currentChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.map(item => item.date),
                datasets: [{
                    label: 'Daily Sales',
                    data: chartData.map(item => item.sales),
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.2)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toFixed(2);
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return 'Sales: $' + context.parsed.y.toFixed(2);
                            }
                        }
                    }
                }
            }
        });
    }
}

// Product search functionality
function searchProducts(query) {
    if (query.length < 2) {
        $('#productSearchResults').hide();
        return;
    }
    
    $.ajax({
        url: '/sales/search-products/',
        data: { 'q': query },
        success: function(data) {
            let results = '';
            data.products.forEach(function(product) {
                results += `
                    <div class="list-group-item list-group-item-action" onclick="selectProduct(${product.id}, '${product.name}', ${product.price}, ${product.stock})">
                        <strong>${product.name}</strong> (${product.sku})<br>
                        <small>Price: $${product.price} | Stock: ${product.stock} ${product.unit}</small>
                    </div>
                `;
            });
            
            if (results) {
                $('#productSearchResults').html(results).show();
            } else {
                $('#productSearchResults').html('<div class="list-group-item">No products found</div>').show();
            }
        }
    });
}

// Select product for sale
function selectProduct(id, name, price, stock) {
    const tableBody = $('#saleItemsTable tbody');
    
    // Check if product already added
    if ($(`input[value="${id}"]`).length > 0) {
        alert('Product already added to the sale!');
        return;
    }
    
    const rowCount = tableBody.children().length;
    const newRow = `
        <tr>
            <td>
                <input type="hidden" name="product_id" value="${id}">
                ${name}
            </td>
            <td>
                <input type="number" name="quantity" class="form-control" value="1" min="1" max="${stock}" onchange="updateRowTotal(this)">
            </td>
            <td>
                <input type="number" name="unit_price" class="form-control" value="${price}" step="0.01" onchange="updateRowTotal(this)">
            </td>
            <td class="row-total">$${price}</td>
            <td>
                <button type="button" class="btn btn-sm btn-danger" onclick="removeRow(this)">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `;
    
    tableBody.append(newRow);
    $('#productSearchResults').hide();
    $('#productSearch').val('');
    updateSaleTotal();
}

// Update row total
function updateRowTotal(element) {
    const row = $(element).closest('tr');
    const quantity = parseFloat(row.find('input[name="quantity"]').val()) || 0;
    const unitPrice = parseFloat(row.find('input[name="unit_price"]').val()) || 0;
    const total = quantity * unitPrice;
    
    row.find('.row-total').text('$' + total.toFixed(2));
    updateSaleTotal();
}

// Remove row from sale
function removeRow(button) {
    $(button).closest('tr').remove();
    updateSaleTotal();
}

// Update sale total
function updateSaleTotal() {
    let subtotal = 0;
    $('.row-total').each(function() {
        const amount = parseFloat($(this).text().replace('$', '')) || 0;
        subtotal += amount;
    });
    
    const discount = parseFloat($('#discountAmount').val()) || 0;
    const tax = parseFloat($('#taxAmount').val()) || 0;
    const total = subtotal - discount + tax;
    
    $('#subtotalAmount').text('$' + subtotal.toFixed(2));
    $('#totalAmount').text('$' + total.toFixed(2));
    
    // Update change calculation
    updateChange();
}

// Update change amount
function updateChange() {
    const total = parseFloat($('#totalAmount').text().replace('$', '')) || 0;
    const received = parseFloat($('#paymentReceived').val()) || 0;
    const change = Math.max(0, received - total);
    
    $('#changeAmount').text('$' + change.toFixed(2));
}

// Delete confirmation
function confirmDelete(itemName, deleteUrl) {
    if (confirm(`Are you sure you want to delete "${itemName}"?`)) {
        // Create form and submit
        const form = $('<form>', {
            'method': 'POST',
            'action': deleteUrl
        });
        
        // Add CSRF token
        const csrfToken = $('[name=csrfmiddlewaretoken]').val();
        form.append($('<input>', {
            'type': 'hidden',
            'name': 'csrfmiddlewaretoken',
            'value': csrfToken
        }));
        
        $('body').append(form);
        form.submit();
    }
}

// Toggle user status
function toggleUserStatus(userId, username) {
    $.ajax({
        url: '/auth/toggle-user-status/',
        method: 'POST',
        data: {
            'user_id': userId,
            'csrfmiddlewaretoken': $('[name=csrfmiddlewaretoken]').val()
        },
        success: function(response) {
            if (response.success) {
                location.reload();
            } else {
                alert('Error: ' + response.message);
            }
        },
        error: function() {
            alert('Error processing request');
        }
    });
}

// Print receipt
function printReceipt() {
    window.print();
}

// Export table to CSV
function exportTableToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    const rows = table.querySelectorAll('tr');
    let csv = [];
    
    for (let i = 0; i < rows.length; i++) {
        const row = [];
        const cols = rows[i].querySelectorAll('td, th');
        
        for (let j = 0; j < cols.length - 1; j++) { // Exclude last column (actions)
            row.push('"' + cols[j].innerText.replace(/"/g, '""') + '"');
        }
        
        csv.push(row.join(','));
    }
    
    // Download CSV
    const csvString = csv.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', '');
    a.setAttribute('href', url);
    a.setAttribute('download', filename + '.csv');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Format currency
function formatCurrency(amount) {
    return '$' + parseFloat(amount).toFixed(2);
}

// Show loading spinner
function showLoading(button) {
    const originalText = button.innerHTML;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Loading...';
    button.disabled = true;
    
    return function() {
        button.innerHTML = originalText;
        button.disabled = false;
    };
}

// Validate form before submission
function validateSaleForm() {
    const items = $('#saleItemsTable tbody tr').length;
    if (items === 0) {
        alert('Please add at least one item to the sale.');
        return false;
    }
    
    const total = parseFloat($('#totalAmount').text().replace('$', '')) || 0;
    const received = parseFloat($('#paymentReceived').val()) || 0;
    
    if (received < total) {
        if (!confirm('Payment received is less than total amount. Continue?')) {
            return false;
        }
    }
    
    return true;
}

// Auto-complete functionality
function setupAutoComplete(inputSelector, dataUrl, onSelect) {
    $(inputSelector).on('input', function() {
        const query = $(this).val();
        const $results = $(inputSelector + 'Results');
        
        if (query.length < 2) {
            $results.hide();
            return;
        }
        
        $.ajax({
            url: dataUrl,
            data: { 'q': query },
            success: function(data) {
                let html = '';
                data.results.forEach(function(item) {
                    html += `<div class="list-group-item list-group-item-action" onclick="${onSelect}(${item.id}, '${item.name}')">${item.name}</div>`;
                });
                
                if (html) {
                    $results.html(html).show();
                } else {
                    $results.html('<div class="list-group-item">No results found</div>').show();
                }
            }
        });
    });
}
