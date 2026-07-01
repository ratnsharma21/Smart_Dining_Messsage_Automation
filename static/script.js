// Premium Toast Notification System
function showToast(title, message, type = 'success', duration = 6000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        success: '🟢',
        error: '🔴',
        info: '🔵',
        warning: '🟡'
    };
    
    const icon = icons[type] || 'ℹ️';
    
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.classList.add('toast-fade-out'); setTimeout(() => this.parentElement.remove(), 300);">&times;</button>
    `;
    
    container.appendChild(toast);
    
    if (duration > 0) {
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('toast-fade-out');
                setTimeout(() => {
                    if (toast.parentElement) {
                        toast.remove();
                    }
                }, 300);
            }
        }, duration);
    }
    
    return toast;
}

// Tab switching controller
function switchTab(tabId) {
    // Toggle active tabs in navigation list
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => item.classList.remove('active'));
    
    // Find which nav item clicked and mark active
    if (window.event && window.event.currentTarget) {
        window.event.currentTarget.classList.add('active');
    } else {
        // Fallback if called programmatically without event
        const matchingNav = Array.from(document.querySelectorAll('.nav-item')).find(el => el.getAttribute('onclick').includes(tabId));
        if (matchingNav) matchingNav.classList.add('active');
    }
    
    // Update main top page title
    const titles = {
        'customers': 'Customers Directory',
        'leaderboard': 'Top 10 Customers Leaderboard',
        'logs': 'Message History Logs',
        'automation': 'Occasion Calendar & Message Automation',
        'offline_messaging': 'Occasion Calendar Offline'
    };
    const titleEl = document.getElementById('page-display-title');
    if (titleEl && titles[tabId]) {
        titleEl.innerText = titles[tabId];
    }
    
    // Show the active tab contents panel
    const panes = document.querySelectorAll('.tab-pane');
    panes.forEach(pane => pane.classList.remove('active'));
    
    const targetPane = document.getElementById('tab-' + tabId);
    if (targetPane) {
        targetPane.classList.add('active');
    }
    
    localStorage.setItem('activeTab', tabId);
    
    if (tabId === 'automation') {
        runCalendarOccasionCheck();
    } else if (tabId === 'logs') {
        switchHistoryTab('automated');
    }
}

// Modal Control functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

// Close Modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function closeModalOnOverlay(event, modalId) {
    if (event.target === event.currentTarget) {
        closeModal(modalId);
    }
}

// Search and filter customers directory table locally
function filterCustomers() {
    const query = document.getElementById('customerSearch').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;
    const moneyFilter = document.getElementById('moneyFilter').value;
    const dateFilter = document.getElementById('dateFilter').value; // YYYY-MM-DD
    const rows = document.querySelectorAll('#customersTable tbody tr');
    
    rows.forEach(row => {
        // Skip empty row if present
        if (row.cells.length < 9) return;
        
        const text = row.textContent.toLowerCase();
        
        // 1. Category check
        const categoryBadge = row.querySelector('.badge');
        const category = categoryBadge ? categoryBadge.textContent.trim() : '';
        const matchCategory = (categoryFilter === 'All' || category === categoryFilter);
        
        // 2. Money range check
        const totalSpentText = row.querySelector('td:nth-child(7)').textContent.replace(/[₹,]/g, '').trim();
        const totalSpent = parseFloat(totalSpentText) || 0.0;
        let matchMoney = false;
        if (moneyFilter === 'All') {
            matchMoney = true;
        } else if (moneyFilter === '1000-2000') {
            matchMoney = (totalSpent >= 1000.0 && totalSpent <= 2000.0);
        } else if (moneyFilter === '2000-4000') {
            matchMoney = (totalSpent >= 2000.0 && totalSpent <= 4000.0);
        } else if (moneyFilter === '4000-10000') {
            matchMoney = (totalSpent >= 4000.0 && totalSpent <= 10000.0);
        }
        
        // 3. Date check (Last Visited)
        const lastVisitedText = row.querySelector('td:nth-child(9)').textContent.trim(); // YYYY-MM-DD or "Never"
        const matchDate = (!dateFilter || lastVisitedText === dateFilter);
        
        // 4. Text query search check
        const matchQuery = text.includes(query);
        
        if (matchQuery && matchCategory && matchMoney && matchDate) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function clearDateFilter() {
    document.getElementById('dateFilter').value = '';
    filterCustomers();
}

// Drawer Slide-Over control functions
function openDrawer() {
    document.getElementById('drawer-overlay').classList.add('active');
    document.getElementById('drawer').classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.querySelector('.drawer-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeDrawer);
    }
});

function closeDrawer() {
    document.getElementById('drawer-overlay').classList.remove('active');
    document.getElementById('drawer').classList.remove('active');
}

// Fetch details of a single customer via AJAX
let currentDrawerCustomer = null;

function fetchCustomerDetails(id) {
    fetch('?action=get_customer_details&id=' + id)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                currentDrawerCustomer = data.profile;
                populateDrawer(data);
                openDrawer();
            } else {
                showToast('Retrieval Failed', data.message, 'error');
            }
        })
        .catch(err => {
            console.error(err);
            showToast('Connection Error', 'Failure trying to retrieve profile data.', 'error');
        });
}

// Populate drawer elements with retrieved details
function populateDrawer(data) {
    const p = data.profile;
    const prefs = data.preferences;
    
    // Profile Info
    document.getElementById('drawer-full-name').innerText = p.full_name;
    document.getElementById('drawer-contact').innerText = p.phone_number + ' | ' + (p.email_address || 'No Email');
    
    // Category Badge
    const catBadge = document.getElementById('drawer-category-badge');
    catBadge.innerText = p.customer_category;
    catBadge.className = 'badge ' + p.customer_category.toLowerCase();
    
    // Demographic statistics card
    document.getElementById('drawer-visits-count').innerText = p.total_visits;
    document.getElementById('drawer-spent-sum').innerText = '₹' + parseFloat(p.total_amount_spent).toFixed(2);
    document.getElementById('drawer-loyalty-points').innerText = p.loyalty_points || 0;
    
    // Demographics
    document.getElementById('drawer-dob').innerText = p.date_of_birth ? formatDate(p.date_of_birth) : 'Not Provided';
    document.getElementById('drawer-anniversary').innerText = p.anniversary_date ? formatDate(p.anniversary_date) : 'Not Provided';
    document.getElementById('drawer-address').innerText = p.address || 'No address logged';
    document.getElementById('drawer-marketing-consent').innerText = 
        'Consent: ' + p.marketing_consent + ' (Preferred: ' + p.preferred_channel + ')';

    // Taste Preference tags
    const prefContainer = document.getElementById('drawer-pref-tags');
    prefContainer.innerHTML = '';
    if (prefs) {
        if (prefs.favorite_cuisine) prefContainer.appendChild(createPrefTag('Cuisine', prefs.favorite_cuisine));
        if (prefs.favorite_dish) prefContainer.appendChild(createPrefTag('Dish', prefs.favorite_dish));
        if (prefs.spice_preference) prefContainer.appendChild(createPrefTag('Spice', prefs.spice_preference));
        if (prefs.dietary_preference) prefContainer.appendChild(createPrefTag('Diet', prefs.dietary_preference));
        if (prefs.preferred_seating) prefContainer.appendChild(createPrefTag('Seating', prefs.preferred_seating));
        
        document.getElementById('drawer-special-notes').innerText = prefs.special_notes || 'None';
    } else {
        prefContainer.innerHTML = '<span style="font-size: 13px; color: var(--text-muted)">No dining preferences defined.</span>';
        document.getElementById('drawer-special-notes').innerText = 'None';
    }

    // Family Members List
    const familyContainer = document.getElementById('drawer-family-list');
    familyContainer.innerHTML = '';
    if (data.family.length > 0) {
        data.family.forEach(f => {
            const item = document.createElement('div');
            item.className = 'drawer-card';
            item.style.padding = '12px';
            
            let dateText = `DOB: ${formatDate(f.date_of_birth)}`;
            if (f.anniversary_date) {
                dateText += ` | Anniv: ${formatDate(f.anniversary_date)}`;
            }
            
            item.innerHTML = `
                <div style="font-weight:600; display:flex; justify-content:space-between; font-size: 13px;">
                    <span>${f.family_member_name} (${f.relationship})</span>
                    <span style="font-size: 11px; color: var(--text-muted);">${dateText}</span>
                </div>
            `;
            familyContainer.appendChild(item);
        });
    } else {
        familyContainer.innerHTML = '<div style="font-size: 13px; color: var(--text-muted);">No family members registered.</div>';
    }

    // Occasions list
    const occasionsContainer = document.getElementById('drawer-occasions-list');
    occasionsContainer.innerHTML = '';
    if (data.occasions.length > 0) {
        data.occasions.forEach(o => {
            const item = document.createElement('div');
            item.className = 'drawer-card';
            item.style.padding = '12px';
            item.innerHTML = `
                <div style="font-weight:600; display:flex; justify-content:space-between; font-size:13px;">
                    <span>${o.occasion_name} (${o.occasion_type})</span>
                    <span style="font-size: 11px; color: var(--accent-primary); font-weight:700;">Date: ${formatDate(o.occasion_date)}</span>
                </div>
                <div style="font-size: 11px; color: var(--text-muted); margin-top:4px;">Remind ${o.reminder_days_before} days prior</div>
            `;
            occasionsContainer.appendChild(item);
        });
    } else {
        occasionsContainer.innerHTML = '<div style="font-size: 13px; color: var(--text-muted);">No occasions recorded.</div>';
    }

    // Visits timeline
    const visitContainer = document.getElementById('drawer-visit-timeline');
    visitContainer.innerHTML = '';
    if (data.visits.length > 0) {
        data.visits.forEach(v => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            
            let ratingHtml = '';
            if (v.feedback_rating) {
                ratingHtml = '<div class="rating-stars">' + '⭐'.repeat(v.feedback_rating) + '</div>';
            }
            
            item.innerHTML = `
                <div class="timeline-header">
                    <span style="font-weight:600;">₹${parseFloat(v.total_bill_amount).toFixed(2)}</span>
                    <span>${v.visit_date}</span>
                </div>
                <div class="timeline-body">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
                        <span style="font-size:12px; color:var(--text-secondary);">${v.number_of_guests} Guests</span>
                        ${ratingHtml}
                    </div>
                    ${v.feedback_comment ? `<p style="font-style:italic; font-size:12px; color:var(--text-primary); border-left:2px solid var(--glass-border); padding-left:8px; margin-top:4px;">"${v.feedback_comment}"</p>` : ''}
                </div>
            `;
            visitContainer.appendChild(item);
        });
    } else {
        visitContainer.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); padding-left:12px;">No historical visits logged yet.</div>';
    }
}

// Open Edit Customer Modal populated with drawer data
function openEditCustomerModal() {
    if (!currentDrawerCustomer) return;
    const p = currentDrawerCustomer;
    
    document.getElementById('edit_customer_id').value = p.customer_id;
    document.getElementById('edit_full_name').value = p.full_name;
    document.getElementById('edit_phone').value = p.phone_number;
    document.getElementById('edit_email').value = p.email_address || '';
    document.getElementById('edit_dob').value = p.date_of_birth || '';
    document.getElementById('edit_anniversary').value = p.anniversary_date || '';
    document.getElementById('edit_gender').value = p.gender || '';
    document.getElementById('edit_address').value = p.address || '';
    document.getElementById('edit_preferred_channel').value = p.preferred_channel || 'WhatsApp';
    document.getElementById('edit_consent').value = p.marketing_consent || 'No';
    document.getElementById('edit_loyalty_points').value = p.loyalty_points || 0;
    
    openModal('edit-customer-modal');
}

// Help builder for preference pills
function createPrefTag(label, value) {
    const el = document.createElement('div');
    el.className = 'pref-tag';
    el.innerHTML = `<span>${label}:</span> ${value}`;
    return el;
}

// Date formatter helper
function formatDate(dateString) {
    if (!dateString) return '-';
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Select/Deselect all matched occasions checkboxes
function toggleSelectAllOccasions(checkedState) {
    const checkboxes = document.querySelectorAll('.occasion-cb');
    checkboxes.forEach(cb => cb.checked = checkedState);
}

// Run real-time check for calendar occasions
function runCalendarOccasionCheck() {
    const dateVal = document.getElementById('calendar_check_date').value;
    if (!dateVal) return;
    
    const container = document.getElementById('calendar-results-container');
    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">Searching matching records...</div>';
    
    fetch('?action=check_calendar_occasions&date=' + dateVal)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                container.innerHTML = '';
                const totalMatches = data.birthdays.length + data.anniversaries.length + data.occasions.length;
                
                if (totalMatches === 0) {
                    container.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 40px 0;">No matching birthdays or anniversaries on this date.</div>';
                    return;
                }
                
                // Add "Select All" control
                const selectAllDiv = document.createElement('div');
                selectAllDiv.style.display = 'flex';
                selectAllDiv.style.alignItems = 'center';
                selectAllDiv.style.gap = '8px';
                selectAllDiv.style.marginBottom = '12px';
                selectAllDiv.style.padding = '0 6px';
                selectAllDiv.innerHTML = `
                    <input type="checkbox" id="select_all_occasions" class="occasion-checkbox" checked onchange="toggleSelectAllOccasions(this.checked)">
                    <label for="select_all_occasions" style="font-size:12px; cursor:pointer;">Select All Recipients</label>
                `;
                container.appendChild(selectAllDiv);
                
                // Display Birthdays
                data.birthdays.forEach(b => {
                    const div = document.createElement('div');
                    div.className = 'occasion-card';
                    div.style.borderLeft = '4px solid var(--accent-primary)';
                    div.innerHTML = `
                        <input type="checkbox" class="occasion-cb occasion-checkbox" data-id="${b.customer_id}" checked>
                        <div class="occasion-details">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <strong>🎂 Birthday: ${b.full_name}</strong>
                                <span class="badge new">Active</span>
                            </div>
                            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
                                Email: ${b.email_address || 'None'} | Phone: ${b.phone_number}
                            </div>
                        </div>
                    `;
                    container.appendChild(div);
                });

                // Display Anniversaries
                data.anniversaries.forEach(a => {
                    const div = document.createElement('div');
                    div.className = 'occasion-card';
                    div.style.borderLeft = '4px solid var(--accent-primary)';
                    div.innerHTML = `
                        <input type="checkbox" class="occasion-cb occasion-checkbox" data-id="${a.customer_id}" checked>
                        <div class="occasion-details">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <strong>🥂 Anniversary: ${a.full_name}</strong>
                                <span class="badge vip">Active</span>
                            </div>
                            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
                                Email: ${a.email_address || 'None'} | Phone: ${a.phone_number}
                            </div>
                        </div>
                    `;
                    container.appendChild(div);
                });

                // Display Special Occasions
                data.occasions.forEach(o => {
                    const div = document.createElement('div');
                    div.className = 'occasion-card';
                    div.style.borderLeft = '4px solid var(--success)';
                    div.innerHTML = `
                        <input type="checkbox" class="occasion-cb occasion-checkbox" data-id="${o.customer_id}" checked>
                        <div class="occasion-details">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <strong>✨ Milestone: ${o.occasion_name} (${o.occasion_type})</strong>
                                <span style="font-size:11px; color:var(--text-muted);">Customer: ${o.full_name}</span>
                            </div>
                            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
                                Email: ${o.email_address || 'None'} | Phone: ${o.phone_number}
                            </div>
                        </div>
                    `;
                    container.appendChild(div);
                });
            } else {
                container.innerHTML = '<div style="color: var(--danger); text-align: center; padding: 20px;">Error running check: ' + data.message + '</div>';
            }
        })
        .catch(err => {
            console.error(err);
            container.innerHTML = '<div style="color: var(--danger); text-align: center; padding: 20px;">Connection failure.</div>';
        });
}

// Trigger sending notifications for matched occasions with selected channels
function triggerAutomationEmails() {
    const dateVal = document.getElementById('calendar_check_date').value;
    const overrideEmail = encodeURIComponent(document.getElementById('override_test_email').value);
    const overridePhone = encodeURIComponent(document.getElementById('override_test_phone').value);
    
    // Fetch send channel choices
    const sendEmailCheckbox = document.getElementById('send_channel_email');
    const sendSmsCheckbox = document.getElementById('send_channel_sms');
    const sendWhatsappCheckbox = document.getElementById('send_channel_whatsapp');
    
    const sendEmailVal = sendEmailCheckbox ? (sendEmailCheckbox.checked ? '1' : '0') : '1';
    const sendSmsVal = sendSmsCheckbox ? (sendSmsCheckbox.checked ? '1' : '0') : '1';
    const sendWhatsappVal = sendWhatsappCheckbox ? (sendWhatsappCheckbox.checked ? '1' : '0') : '1';

    if (!dateVal) return;
    
    // Find only selected customer ids
    const checkedBoxes = document.querySelectorAll('.occasion-cb:checked');
    if (checkedBoxes.length === 0) {
        showToast("No Recipients Selected", "Please select at least one recipient checkbox to send greetings.", "warning");
        return;
    }
    const customerIds = Array.from(checkedBoxes).map(cb => cb.getAttribute('data-id')).join(',');
    
    const bdayMsg = encodeURIComponent(document.getElementById('custom_bday_msg').value);
    const annivMsg = encodeURIComponent(document.getElementById('custom_anniv_msg').value);
    
    if (!confirm(`Are you sure you want to dispatch greetings to the ${checkedBoxes.length} selected customer(s)?`)) {
        return;
    }
    
    // Get button and back up state
    const btn = window.event ? window.event.currentTarget : null;
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '⏳ Dispatching...';
        btn.disabled = true;
    }
    
    const loadingToast = showToast("Processing Queue", `Sending greetings to ${checkedBoxes.length} customer(s)...`, "info", 0);
    
    fetch('?action=send_occasion_emails&date=' + dateVal + 
          '&customer_ids=' + customerIds +
          '&override_email=' + overrideEmail + 
          '&override_phone=' + overridePhone + 
          '&bday_msg=' + bdayMsg + 
          '&anniv_msg=' + annivMsg +
          '&send_email=' + sendEmailVal +
          '&send_sms=' + sendSmsVal +
          '&send_whatsapp=' + sendWhatsappVal
    )
        .then(res => res.json())
        .then(data => {
            // Remove loading toast
            if (loadingToast) {
                loadingToast.classList.add('toast-fade-out');
                setTimeout(() => loadingToast.remove(), 300);
            }
            
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
            
            if (data.success) {
                if (data.logs.length === 0) {
                    showToast("Queue Finished", "No greetings were dispatched.", "warning");
                } else {
                    let successList = "";
                    let failureList = "";
                    let successCount = 0;
                    let failureCount = 0;
                    
                    data.logs.forEach(l => {
                        const chan = l.channel || 'Email';
                        if (l.status === 'Delivered' || l.status === 'Sent') {
                            successList += `• ${l.name} (${l.type}) via ${chan} to: ${l.to}\n`;
                            successCount++;
                        } else {
                            failureList += `• ${l.name} (${l.type}) via ${chan} to: ${l.to} - Reason: ${l.error || 'Unknown'}\n`;
                            failureCount++;
                        }
                    });
                    
                    if (successCount > 0) {
                        showToast("Greetings Sent", `Dispatched ${successCount} greetings successfully!\n\n${successList}`, "success", 8000);
                    }
                    if (failureCount > 0) {
                        showToast("Sending Errors", `Failed to send ${failureCount} greetings:\n\n${failureList}`, "error", 10000);
                    }
                    runCalendarOccasionCheck();
                }
            } else {
                showToast("Failed to Run Automation", data.message, "error");
            }
        })
        .catch(err => {
            // Remove loading toast
            if (loadingToast) {
                loadingToast.classList.add('toast-fade-out');
                setTimeout(() => loadingToast.remove(), 300);
            }
            if (btn) {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }
            console.error(err);
            showToast("Connection Failure", "Connection failed trying to execute automation.", "error");
        });
}

// Save Configuration values to Database dynamically via AJAX
function saveSettingsToDatabase() {
    const smtpHost = document.getElementById('smtp_host').value;
    const smtpPort = document.getElementById('smtp_port').value;
    const smtpSecure = document.getElementById('smtp_secure').value;
    const smtpUser = document.getElementById('smtp_user').value;
    const smtpPass = document.getElementById('smtp_pass').value;
    
    const smsProvider = document.getElementById('sms_provider').value;
    const smsHost = document.getElementById('sms_host').value;
    const smsToken = document.getElementById('sms_token').value;
    const smsSender = document.getElementById('sms_sender').value;
    
    const whatsappProvider = document.getElementById('whatsapp_provider').value;
    const whatsappHost = document.getElementById('whatsapp_host').value;
    const whatsappToken = document.getElementById('whatsapp_token').value;
    const whatsappSender = document.getElementById('whatsapp_sender').value;
    
    const customBdayMsg = document.getElementById('custom_bday_msg').value;
    const customAnnivMsg = document.getElementById('custom_anniv_msg').value;
    
    const formData = new FormData();
    formData.append('save_settings', '1');
    formData.append('smtp_host', smtpHost);
    formData.append('smtp_port', smtpPort);
    formData.append('smtp_secure', smtpSecure);
    formData.append('smtp_user', smtpUser);
    formData.append('smtp_pass', smtpPass);
    formData.append('sms_provider', smsProvider);
    formData.append('sms_host', smsHost);
    formData.append('sms_token', smsToken);
    formData.append('sms_sender', smsSender);
    formData.append('whatsapp_provider', whatsappProvider);
    formData.append('whatsapp_host', whatsappHost);
    formData.append('whatsapp_token', whatsappToken);
    formData.append('whatsapp_sender', whatsappSender);
    formData.append('custom_bday_msg', customBdayMsg);
    formData.append('custom_anniv_msg', customAnnivMsg);
    
    const btn = window.event ? window.event.currentTarget : null;
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.innerHTML = '⏳ Saving...';
        btn.disabled = true;
    }
    
    fetch('?action=save_settings', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        if (data.success) {
            showToast("Settings Saved", "Configurations saved to database successfully!", "success");
        } else {
            showToast("Save Failed", data.message, "error");
        }
    })
    .catch(err => {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        console.error(err);
        showToast("Connection Failure", "Connection failure while saving settings.", "error");
    });
}

// Update WhatsApp UI based on provider selection
function updateWhatsappProviderUI() {
    const waProviderSelect = document.getElementById('whatsapp_provider');
    if (!waProviderSelect) return;
    const waProvider = waProviderSelect.value;
    
    const waHostGroup = document.getElementById('whatsapp_host_group');
    const waHostLabel = document.getElementById('whatsapp_host_label');
    const waHostInput = document.getElementById('whatsapp_host');
    const waTokenLabel = document.getElementById('whatsapp_token_label');
    const waSenderLabel = document.getElementById('whatsapp_sender_label');
    const waProviderBadge = document.getElementById('wa_provider_badge');
    const waProviderBadgeDot = document.getElementById('wa_provider_badge_dot');
    const waProviderBadgeText = document.getElementById('wa_provider_badge_text');
    
    if (waProvider === 'twilio') {
        if (waHostGroup) waHostGroup.style.display = '';
        if (waHostLabel) waHostLabel.textContent = 'Twilio Account SID';
        if (waHostInput) waHostInput.readOnly = false;
        if (waTokenLabel) waTokenLabel.textContent = 'Twilio Auth Token';
        if (waSenderLabel) waSenderLabel.textContent = 'Twilio WhatsApp Number (Sender)';
        
        if (waProviderBadge) {
            waProviderBadge.style.background = 'linear-gradient(135deg, #1a2a1a, #0f3a0f)';
            waProviderBadge.style.borderColor = '#2ecc40';
        }
        if (waProviderBadgeDot) waProviderBadgeDot.style.background = '#2ecc40';
        if (waProviderBadgeText) {
            waProviderBadgeText.textContent = 'Twilio WhatsApp API — Active';
            waProviderBadgeText.style.color = '#7dff8a';
        }
    } else { // simulated
        if (waHostGroup) waHostGroup.style.display = 'none';
        if (waHostInput) {
            waHostInput.readOnly = true;
            waHostInput.value = 'simulated';
        }
        if (waTokenLabel) waTokenLabel.textContent = 'API Key / Token (Not Required)';
        if (waSenderLabel) waSenderLabel.textContent = 'Sender Number (Not Required)';
        
        if (waProviderBadge) {
            waProviderBadge.style.background = 'linear-gradient(135deg, #2a1a2e, #200f3a)';
            waProviderBadge.style.borderColor = '#9b59b6';
        }
        if (waProviderBadgeDot) waProviderBadgeDot.style.background = '#9b59b6';
        if (waProviderBadgeText) {
            waProviderBadgeText.textContent = 'Simulated WhatsApp Provider — Active';
            waProviderBadgeText.style.color = '#e8a7f5';
        }
    }
}

// Update SMS UI based on provider selection
function updateSmsProviderUI() {
    const smsProviderSelect = document.getElementById('sms_provider');
    if (!smsProviderSelect) {
        console.warn("updateSmsProviderUI: sms_provider element not found!");
        return;
    }
    const smsProvider = smsProviderSelect.value;
    console.log("updateSmsProviderUI: smsProvider =", smsProvider);
    
    const smsHostGroup = document.getElementById('sms_host_group');
    const smsHostLabel = document.getElementById('sms_host_label');
    const smsHostInput = document.getElementById('sms_host');
    const smsTokenLabel = document.getElementById('sms_token_label');
    const smsTokenInput = document.getElementById('sms_token');
    const smsSenderLabel = document.getElementById('sms_sender_label');
    const smsSenderInput = document.getElementById('sms_sender');
    const smsSenderDesc = document.getElementById('sms_sender_desc');
    const smsProviderBadge = document.getElementById('sms_provider_badge');
    const smsProviderBadgeDot = document.getElementById('sms_provider_badge_dot');
    const smsProviderBadgeText = document.getElementById('sms_provider_badge_text');
    const badgeVal = document.getElementById('sms_sender_badge_val');
    
    // Add real-time event listener to update the diagram badge
    if (smsSenderInput && !smsSenderInput.dataset.hasListener) {
        smsSenderInput.addEventListener('input', () => {
            if (badgeVal) badgeVal.textContent = smsSenderInput.value || 'None';
        });
        smsSenderInput.dataset.hasListener = 'true';
    }

    if (smsProvider === 'fast2sms') {
        if (smsHostGroup) smsHostGroup.style.display = 'none';
        if (smsHostInput) {
            smsHostInput.readOnly = true;
            smsHostInput.value = 'https://www.fast2sms.com/dev/bulkV2';
        }
        if (smsTokenLabel) smsTokenLabel.textContent = 'Fast2SMS Authorization API Key';
        if (smsSenderLabel) smsSenderLabel.textContent = 'Fast2SMS Sender ID (Optional)';
        if (smsSenderDesc) smsSenderDesc.textContent = 'Leave blank for Quick SMS route ("q"). For custom sender, use DLT-registered 6-character alphabetic ID.';
        
        if (smsProviderBadge) {
            smsProviderBadge.style.background = 'linear-gradient(135deg, #2e261a, #3f2f0f)';
            smsProviderBadge.style.borderColor = '#ffaa33';
        }
        if (smsProviderBadgeDot) smsProviderBadgeDot.style.background = '#ffaa33';
        if (smsProviderBadgeText) {
            smsProviderBadgeText.textContent = 'Fast2SMS Bulk SMS Service — Active';
            smsProviderBadgeText.style.color = '#ffdd99';
        }
    } else { // simulated
        if (smsHostGroup) smsHostGroup.style.display = 'none';
        if (smsHostInput) {
            smsHostInput.readOnly = true;
            smsHostInput.value = 'simulated';
        }
        if (smsTokenLabel) smsTokenLabel.textContent = 'API Key / Token (Not Required)';
        if (smsSenderLabel) smsSenderLabel.textContent = 'Sender Number (Not Required)';
        if (smsSenderDesc) smsSenderDesc.textContent = 'Simulated sending outputs messages to console logs only.';
        
        if (smsProviderBadge) {
            smsProviderBadge.style.background = 'linear-gradient(135deg, #2a1a2e, #200f3a)';
            smsProviderBadge.style.borderColor = '#9b59b6';
        }
        if (smsProviderBadgeDot) smsProviderBadgeDot.style.background = '#9b59b6';
        if (smsProviderBadgeText) {
            smsProviderBadgeText.textContent = 'Simulated SMS Provider — Active';
            smsProviderBadgeText.style.color = '#e8a7f5';
        }
    }
    
    if (badgeVal && smsSenderInput) {
        badgeVal.textContent = smsSenderInput.value || 'None';
    }
}

/**
 * Sends test messages on selected active channels (Email, SMS, or both) to your redirect details.
 */
function sendTestChannel() {
    const sendEmailCheckbox = document.getElementById('send_channel_email');
    const sendSmsCheckbox = document.getElementById('send_channel_sms');
    const sendWhatsappCheckbox = document.getElementById('send_channel_whatsapp');
    
    const sendEmail = sendEmailCheckbox ? sendEmailCheckbox.checked : false;
    const sendSms = sendSmsCheckbox ? sendSmsCheckbox.checked : false;
    const sendWhatsapp = sendWhatsappCheckbox ? sendWhatsappCheckbox.checked : false;
    
    if (!sendEmail && !sendSms && !sendWhatsapp) {
        showToast('Selection Required', 'Please select at least one active channel (Email, SMS, or WhatsApp) to test.', 'warning');
        return;
    }
    
    const overrideEmailEl = document.getElementById('override_test_email');
    const overridePhoneEl = document.getElementById('override_test_phone');
    const apiKeyEl = document.getElementById('sms_token');
    const waTokenEl = document.getElementById('whatsapp_token');
    
    const emailTo = overrideEmailEl ? overrideEmailEl.value.trim() : '';
    const phoneTo = overridePhoneEl ? overridePhoneEl.value.trim() : '';
    const apiKey = apiKeyEl ? apiKeyEl.value.trim() : '';
    const waToken = waTokenEl ? waTokenEl.value.trim() : '';
    
    const smsProviderSelect = document.getElementById('sms_provider');
    const smsProvider = smsProviderSelect ? smsProviderSelect.value : '';
    const smsHostInput = document.getElementById('sms_host');
    const smsHost = smsHostInput ? smsHostInput.value.trim() : '';
    const smsSenderInput = document.getElementById('sms_sender');
    const smsSender = smsSenderInput ? smsSenderInput.value.trim() : '';
    
    const whatsappProviderSelect = document.getElementById('whatsapp_provider');
    const whatsappProvider = whatsappProviderSelect ? whatsappProviderSelect.value : '';
    const whatsappHostInput = document.getElementById('whatsapp_host');
    const whatsappHost = whatsappHostInput ? whatsappHostInput.value.trim() : '';
    const whatsappSenderInput = document.getElementById('whatsapp_sender');
    const whatsappSender = whatsappSenderInput ? whatsappSenderInput.value.trim() : '';
    
    if (sendEmail && !emailTo) {
        showToast('Input Required', 'Please enter a Test Redirect Email address.', 'warning');
        overrideEmailEl.focus();
        return;
    }
    if (sendSms && !phoneTo) {
        showToast('Input Required', 'Please enter a Test Redirect Phone number.', 'warning');
        overridePhoneEl.focus();
        return;
    }
    if (sendWhatsapp && !phoneTo) {
        showToast('Input Required', 'Please enter a Test Redirect Phone number for WhatsApp.', 'warning');
        overridePhoneEl.focus();
        return;
    }
    
    if (sendSms) {
        if (smsProvider === 'fast2sms') {
            if (!apiKey) {
                showToast('API Key Required', 'Please enter your Fast2SMS API Key to test SMS.', 'warning');
                apiKeyEl.focus();
                return;
            }
        }
    }
    
    if (sendWhatsapp) {
        if (whatsappProvider === 'twilio') {
            if (!waToken) {
                showToast('Auth Token Required', 'Please enter your Twilio Auth Token to test WhatsApp.', 'warning');
                waTokenEl.focus();
                return;
            }
        }
    }
    
    let confirmMsg = 'Send test greetings?\n\n';
    if (sendEmail) confirmMsg += `• Email to: ${emailTo}\n`;
    if (sendSms) confirmMsg += `• SMS (via ${smsProvider}) to: ${phoneTo}\n`;
    if (sendWhatsapp) confirmMsg += `• WhatsApp (via ${whatsappProvider}) to: ${phoneTo}\n`;
    
    if (!confirm(confirmMsg)) return;
    
    const btn = window.event ? window.event.currentTarget : null;
    const origText = btn ? btn.innerHTML : 'Send';
    if (btn) { btn.innerHTML = '⏳ Sending...'; btn.disabled = true; }
    
    const promises = [];
    const testToast = showToast("Sending Tests", "Dispatching test messages...", "info", 0);
    
    if (sendEmail) {
        const testEmailMsg = `[Smart Dining CRM] Test email. SMTP server is connected and working! Sent at ${new Date().toLocaleString('en-IN')}.`;
        const emailUrl = '?action=send_test_email&email=' + encodeURIComponent(emailTo) + '&message=' + encodeURIComponent(testEmailMsg);
        promises.push(
            fetch(emailUrl)
                .then(res => res.json())
                .then(data => ({ channel: 'Email', data }))
                .catch(err => ({ channel: 'Email', data: { success: false, message: err.message || 'Connection failure' } }))
        );
    }
    
    if (sendSms) {
        const testSmsMsg = `[Smart Dining CRM] Test SMS. SMS service is connected and working! Sent at ${new Date().toLocaleString('en-IN')}.`;
        const smsUrl = '?action=send_test_sms' +
                       '&phone=' + encodeURIComponent(phoneTo) +
                       '&provider=' + encodeURIComponent(smsProvider) +
                       '&host=' + encodeURIComponent(smsHost) +
                       '&api_key=' + encodeURIComponent(apiKey) +
                       '&sender=' + encodeURIComponent(smsSender) +
                       '&message=' + encodeURIComponent(testSmsMsg);
        promises.push(
            fetch(smsUrl)
                .then(res => res.json())
                .then(data => ({ channel: 'SMS', data }))
                .catch(err => ({ channel: 'SMS', data: { success: false, message: err.message || 'Connection failure' } }))
        );
    }
    
    if (sendWhatsapp) {
        const testWhatsappMsg = `[Smart Dining CRM] Test WhatsApp. WhatsApp service is connected and working! Sent at ${new Date().toLocaleString('en-IN')}.`;
        const whatsappUrl = '?action=send_test_whatsapp' +
                       '&phone=' + encodeURIComponent(phoneTo) +
                       '&provider=' + encodeURIComponent(whatsappProvider) +
                       '&host=' + encodeURIComponent(whatsappHost) +
                       '&api_key=' + encodeURIComponent(waToken) +
                       '&sender=' + encodeURIComponent(whatsappSender) +
                       '&message=' + encodeURIComponent(testWhatsappMsg);
        promises.push(
            fetch(whatsappUrl)
                .then(res => res.json())
                .then(data => ({ channel: 'WhatsApp', data }))
                .catch(err => ({ channel: 'WhatsApp', data: { success: false, message: err.message || 'Connection failure' } }))
        );
    }
    
    Promise.all(promises)
        .then(results => {
            if (testToast) {
                testToast.classList.add('toast-fade-out');
                setTimeout(() => testToast.remove(), 300);
            }
            
            let successList = "";
            let failureList = "";
            
            results.forEach(res => {
                if (res.data.success) {
                    successList += `• ${res.channel} test sent successfully.\n`;
                } else {
                    failureList += `• ${res.channel} test failed: ${res.data.message}\n`;
                }
            });
            
            if (successList) {
                showToast('Test Sent', successList, 'success', 8000);
            }
            if (failureList) {
                showToast('Test Failed', failureList, 'error', 10000);
            }
        })
        .catch(err => {
            if (testToast) {
                testToast.classList.add('toast-fade-out');
                setTimeout(() => testToast.remove(), 300);
            }
            showToast('Error', 'An error occurred during test dispatch.', 'error');
        })
        .finally(() => {
            if (btn) { btn.innerHTML = origText; btn.disabled = false; }
        });
}

// Initialize page state
function initPageState() {
    // Load active tab
    const activeTab = localStorage.getItem('activeTab') || 'customers';
    switchTab(activeTab);
    
    const smsProvider = document.getElementById('sms_provider');
    if (smsProvider) {
        smsProvider.addEventListener('change', updateSmsProviderUI);
        updateSmsProviderUI();
    }
    
    const whatsappProvider = document.getElementById('whatsapp_provider');
    if (whatsappProvider) {
        whatsappProvider.addEventListener('change', updateWhatsappProviderUI);
        updateWhatsappProviderUI();
    }
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initPageState);
} else {
    initPageState();
}

// Dynamically generate family member input blocks in the Register Customer modal
function updateFamilyMemberInputs(count) {
    const container = document.getElementById('family_members_container');
    if (!container) return;
    
    container.innerHTML = '';
    const num = parseInt(count) || 0;
    
    for (let i = 1; i <= num; i++) {
        const div = document.createElement('div');
        div.className = 'family-member-box';
        div.style.background = 'var(--bg-secondary)';
        div.style.border = '1px solid var(--glass-border)';
        div.style.borderRadius = 'var(--radius-md)';
        div.style.padding = '12px';
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.gap = '8px';
        
        div.innerHTML = `
            <div style="font-size: 11px; font-weight: 700; color: var(--accent-primary); text-transform: uppercase; letter-spacing: 0.5px;">
                Family Member #${i}
            </div>
            <div class="form-row">
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 10px;">Name *</label>
                    <input type="text" name="family_name[]" class="form-control" placeholder="Name" required>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 10px;">Relationship *</label>
                    <select name="family_relationship[]" class="form-control" required style="padding: 8px;">
                        <option value="Spouse">Spouse</option>
                        <option value="Child">Child</option>
                        <option value="Parent">Parent</option>
                        <option value="Sibling">Sibling</option>
                        <option value="Other">Other</option>
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 10px;">Birthday (DOB)</label>
                    <input type="date" name="family_dob[]" class="form-control">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 10px;">Anniversary Date</label>
                    <input type="date" name="family_anniversary[]" class="form-control">
                </div>
            </div>
        `;
        container.appendChild(div);
    }
}

let currentHistoryTab = 'automated';

// Switch history tab in Outbound Message Logs tabpane
function switchHistoryTab(type) {
    currentHistoryTab = type;
    
    // Toggle active state for sub-nav buttons
    const buttons = document.querySelectorAll('.sub-nav-btn');
    buttons.forEach(btn => {
        if (btn.getAttribute('onclick').includes(type)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    applyHistoryFilter();
}

// Client-side filtering logic for Outbound Message Logs
function applyHistoryFilter() {
    const filterSelect = document.getElementById('history-filter-select');
    const filterVal = filterSelect ? filterSelect.value : 'all';
    const dateFilter = document.getElementById('historyDateFilter') ? document.getElementById('historyDateFilter').value : '';
    
    const rows = document.querySelectorAll('.history-row');
    let visibleCount = 0;
    
    rows.forEach(row => {
        const rowDeliveryType = row.getAttribute('data-delivery-type') || 'automated';
        const rowChannel = row.getAttribute('data-channel') || '';
        const rowOccasion = row.getAttribute('data-occasion') || '';
        
        // Date check
        const sentTimestampCell = row.querySelector('td:nth-child(5)');
        const sentTimestampText = sentTimestampCell ? sentTimestampCell.textContent.trim() : '';
        const rowDate = sentTimestampText.split(/[ T]/)[0];
        const matchDate = (!dateFilter || rowDate === dateFilter);
        
        let matchesTab = (rowDeliveryType === currentHistoryTab);
        let matchesFilter = false;
        
        if (matchesTab) {
            if (filterVal === 'all') {
                matchesFilter = true;
            } else if (filterVal === 'sms') {
                matchesFilter = (rowChannel === 'sms');
            } else if (filterVal === 'whatsapp') {
                matchesFilter = (rowChannel === 'whatsapp');
            } else if (filterVal === 'email') {
                matchesFilter = (rowChannel === 'email');
            } else if (filterVal === 'birthday') {
                matchesFilter = (rowOccasion === 'birthday');
            } else if (filterVal === 'anniversary') {
                matchesFilter = (rowOccasion === 'anniversary');
            }
        }
        
        if (matchesTab && matchesFilter && matchDate) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });
    
    // Handle empty state row
    let emptyRow = document.getElementById('history-empty-row');
    if (visibleCount === 0) {
        if (!emptyRow) {
            const tbody = document.querySelector('#tab-logs tbody');
            if (tbody) {
                const tr = document.createElement('tr');
                tr.id = 'history-empty-row';
                tr.innerHTML = `<td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 24px 0;">No messages found matching the selected criteria.</td>`;
                tbody.appendChild(tr);
            }
        } else {
            emptyRow.style.display = '';
        }
    } else {
        if (emptyRow) {
            emptyRow.style.display = 'none';
        }
    }
}

function clearHistoryDateFilter() {
    const el = document.getElementById('historyDateFilter');
    if (el) el.value = '';
    applyHistoryFilter();
}

// Prepend dynamically a message log to history logs
function prependMessageHistoryLog(log) {
    const tbody = document.querySelector('#tab-logs tbody');
    if (!tbody) return;
    
    // Remove default empty row if present
    const emptyRow = tbody.querySelector('tr td[colspan]');
    if (emptyRow && emptyRow.id !== 'history-empty-row') {
        tbody.innerHTML = '';
    }
    
    const tr = document.createElement('tr');
    tr.className = 'history-row';
    tr.setAttribute('data-delivery-type', (log.delivery_type || 'manual').toLowerCase());
    tr.setAttribute('data-channel', (log.message_channel || '').toLowerCase());
    tr.setAttribute('data-occasion', (log.occasion || '').toLowerCase());
    tr.innerHTML = `
        <td>#${log.message_id}</td>
        <td style="font-weight: 600;">${log.full_name}</td>
        <td>
            <span class="badge ${log.message_channel.toLowerCase()}">${log.message_channel}</span>
        </td>
        <td style="max-width: 400px; font-size: 12px; line-height: 1.4; color: var(--text-secondary); white-space: pre-line;">${log.message_content}</td>
        <td>${log.sent_datetime}</td>
        <td>
            <span class="badge ${log.delivery_status.toLowerCase()}">${log.delivery_status}</span>
        </td>
    `;
    tbody.insertBefore(tr, tbody.firstChild);
}

// Global default templates (pre-rendered from DOM if available)
function getOfflineTemplate(type, customerName) {
    let template = '';
    if (type === 'Birthday') {
        const bdayEl = document.getElementById('custom_bday_msg');
        template = bdayEl ? bdayEl.value : "Dear {name},\n\nWe at Smart Dining Restaurant wish you a very Happy Birthday! Enjoy a complimentary dessert and 15% off on your next visit with us. Use code BDAY15.\n\nWarm regards,\nSmart Dining Team";
    } else if (type === 'Anniversary') {
        const annivEl = document.getElementById('custom_anniv_msg');
        template = annivEl ? annivEl.value : "Dear {name},\n\nHappy Anniversary to you and your partner from all of us at Smart Dining Restaurant! Celebrate your special day at our restaurant and receive a complimentary bottle of sparkling mocktails.\n\nWarm regards,\nSmart Dining Team";
    } else { // Custom
        template = "Dear {name},\n\nWe would love to celebrate your special milestone with you at Smart Dining Restaurant! Enjoy a complimentary beverage on your next visit.\n\nWarm regards,\nSmart Dining Team";
    }
    return template.replace(/{name}/g, customerName);
}

// Controller for selected customer change
function onOfflineCustomerChange() {
    const select = document.getElementById('offline_customer_select');
    if (!select) return;
    const selectedOption = select.options[select.selectedIndex];
    
    // Hide manual instructions panel on new customer selection
    const instructionPanel = document.getElementById('offline_instructions_panel');
    if (instructionPanel) instructionPanel.style.display = 'none';
    
    if (!selectedOption || !selectedOption.value) {
        document.getElementById('offline_message_body').value = '';
        return;
    }
    
    const customerName = selectedOption.getAttribute('data-name') || 'Customer';
    const typeSelect = document.getElementById('offline_occasion_select');
    const occasionType = typeSelect ? typeSelect.value : 'Birthday';
    
    const replaced = getOfflineTemplate(occasionType, customerName);
    document.getElementById('offline_message_body').value = replaced;
}

// Controller for selected occasion type change
function onOfflineOccasionChange() {
    onOfflineCustomerChange();
}

// Controller for channel select change
function onOfflineChannelChange() {
    const channelSelect = document.getElementById('offline_channel_select');
    const subjectGroup = document.getElementById('offline_subject_group');
    if (channelSelect && subjectGroup) {
        if (channelSelect.value === 'Email') {
            subjectGroup.style.display = '';
        } else {
            subjectGroup.style.display = 'none';
        }
    }
}

// Copy offline message to clipboard
function copyOfflineMsgToClipboard() {
    const textEl = document.getElementById('offline_message_body');
    if (!textEl) return;
    
    textEl.select();
    textEl.setSelectionRange(0, 99999); // For mobile devices
    
    navigator.clipboard.writeText(textEl.value)
        .then(() => {
            showToast("Copied to Clipboard", "Message template copied successfully!", "success");
        })
        .catch(err => {
            console.error(err);
            showToast("Copy Failed", "Failed to copy message to clipboard.", "error");
        });
}

// Sends/logs offline message to database and sets up manual launching links
function sendOfflineMessage() {
    const select = document.getElementById('offline_customer_select');
    if (!select || !select.value) {
        showToast("Selection Required", "Please choose a customer first.", "warning");
        select.focus();
        return;
    }
    
    const selectedOption = select.options[select.selectedIndex];
    const customerId = select.value;
    const phone = selectedOption.getAttribute('data-phone') || '';
    const email = selectedOption.getAttribute('data-email') || '';
    
    const channelSelect = document.getElementById('offline_channel_select');
    const channel = channelSelect ? channelSelect.value : 'WhatsApp';
    
    const subjectEl = document.getElementById('offline_subject');
    const subject = subjectEl ? subjectEl.value.trim() : '';
    
    const messageBody = document.getElementById('offline_message_body').value;
    
    if (!messageBody.trim()) {
        showToast("Content Required", "Please enter message greetings.", "warning");
        return;
    }
    
    // AJAX call to log manual dispatch in Database
    const url = `?action=send_offline_message&customer_id=${customerId}&channel=${channel}&content=${encodeURIComponent(messageBody)}&subject=${encodeURIComponent(subject)}`;
    
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                // Prepend log dynamically to Logs table
                prependMessageHistoryLog(data.log);
                
                // Configure instructions launcher link
                const actionBtn = document.getElementById('offline_action_link');
                const instructionPanel = document.getElementById('offline_instructions_panel');
                
                let redirectUrl = '#';
                let btnText = '';
                let targetAttr = '_blank';
                
                if (channel === 'WhatsApp') {
                    // Normalize phone number for wa.me link
                    let cleanPhone = phone.replace(/\D/g, '');
                    if (cleanPhone.length === 10) {
                        cleanPhone = '91' + cleanPhone;
                    }
                    redirectUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageBody)}`;
                    btnText = 'Open WhatsApp Web/App 💬';
                    targetAttr = '_blank';
                } else if (channel === 'Email') {
                    redirectUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${email}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(messageBody)}`;
                    btnText = 'Open Gmail Web 📧';
                    targetAttr = '_blank';
                } else { // SMS
                    redirectUrl = `sms:${phone}?body=${encodeURIComponent(messageBody)}`;
                    btnText = 'Launch System SMS Client 📱';
                    targetAttr = '_self';
                }
                
                if (actionBtn) {
                    actionBtn.href = redirectUrl;
                    actionBtn.textContent = btnText;
                    actionBtn.setAttribute('target', targetAttr);
                }
                
                if (instructionPanel) {
                    instructionPanel.style.display = '';
                }
                
                // Show success toast prompting user to click the revealed button
                showToast("Greeting Logged", `Greeting successfully recorded. Click the button below to launch ${channel} and send manually!`, "success", 10000);
                
                // Automatically switch history sub-tab to manual (so it is filtered correctly when user visits logs tab)
                switchHistoryTab('manual');
            } else {
                showToast("Logging Failed", data.message, "error");
            }
        })
        .catch(err => {
            console.error(err);
            showToast("Connection Failure", "Connection failed trying to log manual send.", "error");
        });
}
