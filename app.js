const CATEGORIES = ['All', 'Food', 'Transport', 'Stay', 'Activities', 'Other'];
const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AUD: 'A$', JPY: '¥' };
const MEMBER_COLORS = ['#2A6F6B', '#C98A3E', '#4C7A4F', '#8A4B2E', '#5B6EA8', '#A85B7E', '#3E6C8A', '#7A6A3E'];

let state = {
  tripName: 'Goa Trip 2026',
  currency: 'INR',
  currentUserId: null,
  members: [],
  expenses: [],
  settlements: [],
  activeCategoryFilter: 'All',
  searchQuery: ''
};

let currentReceiptDataUrl = null;   // staged receipt for the open expense form
let confirmCallback = null;         // callback wired to the generic confirm modal
let colorIndex = 0;                 // cycles through MEMBER_COLORS for new members


function seedState(){
  const alex = { id: generateId(), name: 'You', color: nextColor() };
  const priya = { id: generateId(), name: 'Priya', color: nextColor() };
  const aarav = { id: generateId(), name: 'Aarav', color: nextColor() };
  const members = [alex, priya, aarav];

  const today = new Date();
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  };

  const expenses = [
    {
      id: generateId(), title: 'Flight tickets', amount: 14500, category: 'Transport',
      date: daysAgo(3), paidBy: alex.id, participants: [alex.id, priya.id, aarav.id],
      note: 'Booked early for a better fare', receipt: null, createdAt: Date.now() - 3000
    },
    {
      id: generateId(), title: 'Beach resort (2 nights)', amount: 9200, category: 'Stay',
      date: daysAgo(2), paidBy: priya.id, participants: [alex.id, priya.id, aarav.id],
      note: '', receipt: null, createdAt: Date.now() - 2000
    },
    {
      id: generateId(), title: 'Seafood dinner', amount: 2340, category: 'Food',
      date: daysAgo(1), paidBy: aarav.id, participants: [alex.id, priya.id],
      note: 'Priya skipped, allergic to shellfish', receipt: null, createdAt: Date.now() - 1000
    }
  ];

  return {
    tripName: 'Goa Trip 2026',
    currency: 'INR',
    currentUserId: alex.id,
    members,
    expenses,
    settlements: [],
    activeCategoryFilter: 'All',
    searchQuery: ''
  };
}


function generateId(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

function nextColor(){
  const c = MEMBER_COLORS[colorIndex % MEMBER_COLORS.length];
  colorIndex++;
  return c;
}

function escapeHTML(str){
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function formatMoney(amount, currency){
  const symbol = CURRENCY_SYMBOLS[currency] || (currency + ' ');
  const num = Number(amount) || 0;
  return symbol + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(isoDate){
  if(!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  if(isNaN(d)) return isoDate;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function memberName(id){
  const m = state.members.find(mm => mm.id === id);
  return m ? m.name : 'Unknown';
}

function categoryIcon(category){
  const icons = { Food: '\u{1F37D}', Transport: '\u{1F695}', Stay: '\u{1F6CF}', Activities: '\u{1F3DF}', Other: '\u{1F9FE}' };
  return icons[category] || icons.Other;
}

function persistState(){
  const ok = TripStorage.save(state);
  if(!ok){
    Toast.show('Could not save changes locally — storage might be full. Try removing a large receipt photo.', 'error');
  }
}

/* ----------------------- SETTLE-UP ALGORITHM ----------------------- */

// Net balance per member: positive = is owed money overall, negative = owes money overall.
function computeBalances(members, expenses, settlements){
  const balance = {};
  members.forEach(m => { balance[m.id] = 0; });

  expenses.forEach(exp => {
    if(!exp.participants.length) return;
    const share = exp.amount / exp.participants.length;
    balance[exp.paidBy] = (balance[exp.paidBy] || 0) + exp.amount;
    exp.participants.forEach(pid => {
      balance[pid] = (balance[pid] || 0) - share;
    });
  });

  settlements.forEach(s => {
    balance[s.from] = (balance[s.from] || 0) + s.amount; // debtor paid up, their debt shrinks
    balance[s.to] = (balance[s.to] || 0) - s.amount;      // creditor received it, now owed less
  });

  return balance;
}

function simplifyDebts(balance){
  const creditors = [];
  const debtors = [];

  Object.entries(balance).forEach(([id, amt]) => {
    const rounded = Math.round(amt * 100) / 100;
    if(rounded > 0.01) creditors.push({ id, amt: rounded });
    else if(rounded < -0.01) debtors.push({ id, amt: -rounded });
  });

  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const transactions = [];
  let i = 0, j = 0;

  while(i < debtors.length && j < creditors.length){
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.amt, creditor.amt);

    if(amount > 0.01){
      transactions.push({ from: debtor.id, to: creditor.id, amount: Math.round(amount * 100) / 100 });
    }

    debtor.amt -= amount;
    creditor.amt -= amount;
    if(debtor.amt <= 0.01) i++;
    if(creditor.amt <= 0.01) j++;
  }

  return transactions;
}

/* ----------------------- RENDERING ----------------------- */

function renderAll(){
  renderStats();
  renderMemberSelects();
  renderMembersAvatars();
  renderMembersDrawerList();
  renderCategoryChips();
  renderExpenseList();
  renderBalances();
}

function renderStats(){
  const total = state.expenses.reduce((sum, e) => sum + e.amount, 0);
  const balance = computeBalances(state.members, state.expenses, state.settlements);
  const myBalance = state.currentUserId ? Math.round((balance[state.currentUserId] || 0) * 100) / 100 : 0;
  const isPositive = myBalance >= 0;

  document.getElementById('statsRow').innerHTML = `
    <div class="stat-card">
      <div class="stat-num">${formatMoney(total, state.currency)}</div>
      <div class="stat-label">Total spent</div>
    </div>
    <div class="stat-card ${isPositive ? 'stat-positive' : 'stat-negative'}">
      <div class="stat-num">${formatMoney(Math.abs(myBalance), state.currency)}</div>
      <div class="stat-label">${isPositive ? 'You are owed' : 'You owe'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${state.expenses.length}</div>
      <div class="stat-label">Expenses logged</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${state.members.length}</div>
      <div class="stat-label">Members</div>
    </div>
  `;
}

function renderMemberSelects(){
  const currentUserSelect = document.getElementById('currentUserSelect');
  currentUserSelect.innerHTML = state.members.map(m =>
    `<option value="${m.id}">${escapeHTML(m.name)}</option>`
  ).join('') || '<option value="">No members</option>';
  if(state.currentUserId) currentUserSelect.value = state.currentUserId;

  const paidBySelect = document.getElementById('expensePaidBy');
  paidBySelect.innerHTML = '<option value="">Select member</option>' +
    state.members.map(m => `<option value="${m.id}">${escapeHTML(m.name)}</option>`).join('');
}

function renderParticipantsCheckboxes(selectedIds){
  selectedIds = selectedIds || [];
  const wrap = document.getElementById('participantsCheckboxes');
  wrap.innerHTML = state.members.map(m => `
    <label class="checkbox-item">
      <input type="checkbox" value="${m.id}" ${selectedIds.includes(m.id) ? 'checked' : ''}>
      <span class="avatar-dot" style="background:${m.color}"></span>
      ${escapeHTML(m.name)}
    </label>
  `).join('');
}

function renderMembersAvatars(){
  const wrap = document.getElementById('membersAvatarsList');
  wrap.innerHTML = state.members.map(m => `
    <div class="avatar-chip" style="background:${m.color}" title="${escapeHTML(m.name)}">${avatarInitials(m.name)}</div>
  `).join('') || '<span class="muted-text">No members yet.</span>';
}

function renderMembersDrawerList(){
  const list = document.getElementById('membersList');
  list.innerHTML = state.members.map(m => `
    <li class="member-row">
      <span class="avatar-chip small" style="background:${m.color}">${avatarInitials(m.name)}</span>
      <span class="member-name">${escapeHTML(m.name)}</span>
      <button class="icon-btn small danger" id="removeMember-${m.id}" title="Remove member" aria-label="Remove ${escapeHTML(m.name)}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
    </li>
  `).join('') || '<li class="muted-text" style="list-style:none;">No members yet — add one above.</li>';

  state.members.forEach(m => {
    const btn = document.getElementById('removeMember-' + m.id);
    if(btn) btn.addEventListener('click', () => confirmRemoveMember(m.id));
  });
}

function avatarInitials(name){
  const parts = String(name).trim().split(/\s+/);
  const initials = parts.length > 1 ? (parts[0][0] + parts[1][0]) : (parts[0] ? parts[0].slice(0, 2) : '?');
  return initials.toUpperCase();
}

function renderCategoryChips(){
  const wrap = document.getElementById('categoryChips');
  wrap.innerHTML = CATEGORIES.map(c =>
    `<button type="button" class="chip ${c === state.activeCategoryFilter ? 'chip-active' : ''}" data-cat="${c}">${c}</button>`
  ).join('');

  wrap.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeCategoryFilter = btn.dataset.cat;
      renderCategoryChips();
      renderExpenseList();
    });
  });
}

function getFilteredExpenses(){
  const q = state.searchQuery.toLowerCase();
  return state.expenses
    .filter(exp => {
      const matchesCategory = state.activeCategoryFilter === 'All' || exp.category === state.activeCategoryFilter;
      const matchesSearch = !q || exp.title.toLowerCase().includes(q) || (exp.note && exp.note.toLowerCase().includes(q));
      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function skeletonHTML(n){
  let out = '';
  for(let i = 0; i < n; i++){
    out += `
      <div class="expense-card skeleton-card expense-card-main">
        <div class="skeleton-circle"></div>
        <div class="skeleton-lines">
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
        <div class="skeleton-amount"></div>
      </div>
    `;
  }
  return out;
}

function emptyStateHTML({ icon, title, message, ctaId, ctaLabel }){
  return `
    <div class="empty-state">
      <div class="empty-illustration">${icon}</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(message)}</p>
      ${ctaId ? `<button class="btn btn-primary" id="${ctaId}">${escapeHTML(ctaLabel)}</button>` : ''}
    </div>
  `;
}

function expenseCardHTML(exp){
  const payer = state.members.find(m => m.id === exp.paidBy);
  const participantNames = exp.participants.map(id => memberName(id)).join(', ');
  const perShare = exp.participants.length ? exp.amount / exp.participants.length : exp.amount;

  return `
    <article class="expense-card">
      <div class="expense-card-main">
        <div class="expense-icon cat-${exp.category.toLowerCase()}">${categoryIcon(exp.category)}</div>
        <div class="expense-info">
          <h4 class="expense-title">${escapeHTML(exp.title)}</h4>
          <p class="expense-meta">${escapeHTML(payer ? payer.name : 'Unknown')} paid · split with ${escapeHTML(participantNames || 'no one yet')}</p>
          <p class="expense-date">${formatDate(exp.date)}</p>
          ${exp.note ? `<p class="expense-note">${escapeHTML(exp.note)}</p>` : ''}
        </div>
        <div class="expense-amount-wrap">
          <span class="expense-amount">${formatMoney(exp.amount, state.currency)}</span>
          <span class="expense-share">${formatMoney(perShare, state.currency)} each</span>
        </div>
      </div>
      <div class="expense-card-actions">
        ${exp.receipt ? `<button type="button" class="chip-btn" id="receipt-${exp.id}">View receipt</button>` : ''}
        <button type="button" class="chip-btn" id="edit-${exp.id}">Edit</button>
        <button type="button" class="chip-btn danger" id="delete-${exp.id}">Delete</button>
      </div>
    </article>
  `;
}

function renderExpenseList(){
  const container = document.getElementById('expenseListContainer');

  if(state.members.length === 0){
    container.innerHTML = emptyStateHTML({
      icon: '\u{1F9F3}',
      title: 'Add your group first',
      message: 'You need at least one member before you can log an expense.',
      ctaId: 'emptyStateAddMemberBtn',
      ctaLabel: 'Add a member'
    });
    document.getElementById('emptyStateAddMemberBtn').addEventListener('click', () => ModalSystem.open('membersDrawerOverlay'));
    return;
  }

  if(state.expenses.length === 0){
    container.innerHTML = emptyStateHTML({
      icon: '\u{1F9F3}',
      title: 'No expenses yet',
      message: 'Add your first expense to start splitting costs with the group.',
      ctaId: 'emptyStateAddBtn',
      ctaLabel: 'Add an expense'
    });
    document.getElementById('emptyStateAddBtn').addEventListener('click', openAddExpenseModal);
    return;
  }

  const filtered = getFilteredExpenses();

  if(filtered.length === 0){
    container.innerHTML = emptyStateHTML({
      icon: '\u{1F50D}',
      title: 'No matching expenses',
      message: 'Try a different search term or category filter.',
      ctaId: 'emptyStateClearBtn',
      ctaLabel: 'Clear filters'
    });
    document.getElementById('emptyStateClearBtn').addEventListener('click', () => {
      document.getElementById('searchInput').value = '';
      state.searchQuery = '';
      state.activeCategoryFilter = 'All';
      renderCategoryChips();
      renderExpenseList();
    });
    return;
  }

  container.innerHTML = filtered.map(expenseCardHTML).join('');

  filtered.forEach(exp => {
    const editBtn = document.getElementById('edit-' + exp.id);
    const delBtn = document.getElementById('delete-' + exp.id);
    const receiptBtn = document.getElementById('receipt-' + exp.id);
    if(editBtn) editBtn.addEventListener('click', () => openEditExpenseModal(exp.id));
    if(delBtn) delBtn.addEventListener('click', () => confirmDeleteExpense(exp.id));
    if(receiptBtn) receiptBtn.addEventListener('click', () => openLightbox(exp.receipt));
  });
}

function renderBalances(){
  const wrap = document.getElementById('balancesList');

  if(state.members.length === 0){
    wrap.innerHTML = '<p class="muted-text">Add members to see balances.</p>';
    return;
  }

  const balance = computeBalances(state.members, state.expenses, state.settlements);

  wrap.innerHTML = state.members.map(m => {
    const amt = Math.round((balance[m.id] || 0) * 100) / 100;
    let cls = 'balance-zero', label = 'Settled up';
    if(amt > 0.01){ cls = 'balance-positive'; label = formatMoney(amt, state.currency) + ' gets back'; }
    else if(amt < -0.01){ cls = 'balance-negative'; label = formatMoney(Math.abs(amt), state.currency) + ' owes'; }

    return `
      <div class="balance-row ${m.id === state.currentUserId ? 'is-you' : ''}">
        <span class="avatar-chip small" style="background:${m.color}">${avatarInitials(m.name)}</span>
        <span class="balance-name">${escapeHTML(m.name)}${m.id === state.currentUserId ? ' (you)' : ''}</span>
        <span class="balance-amount ${cls}">${label}</span>
      </div>
    `;
  }).join('');
}

/* ----------------------- EXPENSE MODAL ----------------------- */

function openAddExpenseModal(){
  if(state.members.length === 0){
    Toast.show('Add at least one member before logging an expense.', 'error');
    ModalSystem.open('membersDrawerOverlay');
    return;
  }
  resetExpenseForm();
  document.getElementById('expenseModalTitle').textContent = 'Add expense';
  document.getElementById('expenseDate').value = new Date().toISOString().slice(0, 10);
  renderParticipantsCheckboxes(state.members.map(m => m.id)); // default: split with everyone
  ModalSystem.open('expenseModalOverlay');
}

function openEditExpenseModal(id){
  const exp = state.expenses.find(x => x.id === id);
  if(!exp) return;

  resetExpenseForm();
  document.getElementById('expenseModalTitle').textContent = 'Edit expense';
  document.getElementById('expenseId').value = exp.id;
  document.getElementById('expenseTitle').value = exp.title;
  document.getElementById('expenseAmount').value = exp.amount;
  document.getElementById('expenseCategory').value = exp.category;
  document.getElementById('expenseDate').value = exp.date;
  document.getElementById('expensePaidBy').value = exp.paidBy;
  document.getElementById('expenseNote').value = exp.note || '';
  renderParticipantsCheckboxes(exp.participants);

  if(exp.receipt){
    currentReceiptDataUrl = exp.receipt;
    showReceiptPreview(exp.receipt);
  }

  ModalSystem.open('expenseModalOverlay');
}

function resetExpenseForm(){
  document.getElementById('expenseForm').reset();
  document.getElementById('expenseId').value = '';
  currentReceiptDataUrl = null;
  hideReceiptPreview();
  ['expenseTitle', 'expenseAmount', 'expensePaidBy', 'participants', 'receipt'].forEach(clearFieldError);
}

function validateExpenseForm(){
  let valid = true;

  const title = document.getElementById('expenseTitle').value;
  const titleErr = Validators.required(title) || Validators.minLength(title, 2);
  setFieldError('expenseTitle', titleErr);
  if(titleErr) valid = false;

  const amount = document.getElementById('expenseAmount').value;
  const amountErr = Validators.positiveNumber(amount);
  setFieldError('expenseAmount', amountErr);
  if(amountErr) valid = false;

  const paidBy = document.getElementById('expensePaidBy').value;
  const paidByErr = paidBy ? '' : 'Choose who paid.';
  setFieldError('expensePaidBy', paidByErr);
  if(paidByErr) valid = false;

  const checked = document.querySelectorAll('#participantsCheckboxes input:checked');
  const participantsErr = checked.length > 0 ? '' : 'Select at least one person to split with.';
  setFieldError('participants', participantsErr);
  if(participantsErr) valid = false;

  if(!valid){
    const firstInvalid = document.querySelector('.input-invalid');
    if(firstInvalid) firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return valid;
}

function setupLiveValidation(){
  document.getElementById('expenseTitle').addEventListener('input', function(){
    if(this.value.trim().length >= 2) clearFieldError('expenseTitle');
  });
  document.getElementById('expenseAmount').addEventListener('input', function(){
    if(parseFloat(this.value) > 0) clearFieldError('expenseAmount');
  });
  document.getElementById('expensePaidBy').addEventListener('change', function(){
    if(this.value) clearFieldError('expensePaidBy');
  });
  document.getElementById('participantsCheckboxes').addEventListener('change', () => {
    if(document.querySelectorAll('#participantsCheckboxes input:checked').length > 0) clearFieldError('participants');
  });
}

function handleExpenseFormSubmit(e){
  e.preventDefault();
  if(!validateExpenseForm()) return;

  const id = document.getElementById('expenseId').value || generateId();
  const participantIds = Array.from(document.querySelectorAll('#participantsCheckboxes input:checked')).map(cb => cb.value);

  const expense = {
    id,
    title: document.getElementById('expenseTitle').value.trim(),
    amount: parseFloat(document.getElementById('expenseAmount').value),
    category: document.getElementById('expenseCategory').value,
    date: document.getElementById('expenseDate').value || new Date().toISOString().slice(0, 10),
    paidBy: document.getElementById('expensePaidBy').value,
    participants: participantIds,
    note: document.getElementById('expenseNote').value.trim(),
    receipt: currentReceiptDataUrl,
    createdAt: Date.now()
  };

  const existingIndex = state.expenses.findIndex(x => x.id === id);
  if(existingIndex >= 0){
    expense.createdAt = state.expenses[existingIndex].createdAt;
    state.expenses[existingIndex] = expense;
    Toast.show('Expense updated.', 'success');
  }else{
    state.expenses.unshift(expense);
    Toast.show('Expense added.', 'success');
  }

  persistState();
  renderAll();
  ModalSystem.close('expenseModalOverlay');
  resetExpenseForm();
}

function confirmDeleteExpense(id){
  const exp = state.expenses.find(e => e.id === id);
  if(!exp) return;
  openConfirmModal({
    title: 'Delete expense?',
    message: `Delete "${exp.title}"? This cannot be undone.`,
    onConfirm: () => {
      state.expenses = state.expenses.filter(e => e.id !== id);
      persistState();
      renderAll();
      Toast.show('Expense deleted.', 'info');
    }
  });
}

/* ----------------------- FILE UPLOAD / RECEIPT ----------------------- */

function showReceiptPreview(dataUrl){
  document.getElementById('fileDropContent').hidden = true;
  const previewWrap = document.getElementById('receiptPreviewWrap');
  document.getElementById('receiptPreviewImg').src = dataUrl;
  previewWrap.hidden = false;
}

function hideReceiptPreview(){
  document.getElementById('fileDropContent').hidden = false;
  document.getElementById('receiptPreviewWrap').hidden = true;
  document.getElementById('receiptPreviewImg').src = '';
}

function handleReceiptFile(file){
  setFieldError('receipt', '');
  if(!file) return;

  if(!file.type.startsWith('image/')){
    setFieldError('receipt', 'Please upload an image file (JPG or PNG).');
    return;
  }

  const MAX_SIZE = 5 * 1024 * 1024;
  if(file.size > MAX_SIZE){
    setFieldError('receipt', 'Image is too large. Please choose a file under 5MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentReceiptDataUrl = e.target.result;
    showReceiptPreview(currentReceiptDataUrl);
  };
  reader.onerror = () => {
    setFieldError('receipt', 'Could not read that file. Please try again.');
  };
  reader.readAsDataURL(file);
}

function setupFileUpload(){
  const receiptInput = document.getElementById('receiptInput');
  const fileDropZone = document.getElementById('fileDropZone');

  receiptInput.addEventListener('change', (e) => handleReceiptFile(e.target.files[0]));
  document.getElementById('browseFileBtn').addEventListener('click', () => receiptInput.click());

  ['dragenter', 'dragover'].forEach(evt => {
    fileDropZone.addEventListener(evt, (e) => { e.preventDefault(); fileDropZone.classList.add('drag-over'); });
  });
  ['dragleave', 'drop'].forEach(evt => {
    fileDropZone.addEventListener(evt, (e) => { e.preventDefault(); fileDropZone.classList.remove('drag-over'); });
  });
  fileDropZone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    handleReceiptFile(file);
  });

  document.getElementById('removeReceiptBtn').addEventListener('click', () => {
    currentReceiptDataUrl = null;
    receiptInput.value = '';
    hideReceiptPreview();
  });
}

function openLightbox(src){
  document.getElementById('lightboxImg').src = src;
  ModalSystem.open('lightboxOverlay');
}

/* ----------------------- SETTLE UP MODAL ----------------------- */

function openSettleModal(){
  renderSettleModal();
  ModalSystem.open('settleModalOverlay');
}

function renderSettleModal(){
  const balance = computeBalances(state.members, state.expenses, state.settlements);
  const transactions = simplifyDebts(balance);
  const container = document.getElementById('settleTransactionsList');

  if(transactions.length === 0){
    container.innerHTML = `
      <div class="all-settled">
        <span class="all-settled-icon">✓</span>
        <p>Everyone is settled up!</p>
      </div>
    `;
    return;
  }

  container.innerHTML = transactions.map((t, idx) => `
    <div class="settle-row">
      <span class="settle-text"><strong>${escapeHTML(memberName(t.from))}</strong> pays <strong>${escapeHTML(memberName(t.to))}</strong></span>
      <span class="settle-amount">${formatMoney(t.amount, state.currency)}</span>
      <button type="button" class="btn btn-ghost" id="settle-${idx}">Mark as paid</button>
    </div>
  `).join('');

  transactions.forEach((t, idx) => {
    const btn = document.getElementById('settle-' + idx);
    if(!btn) return;
    btn.addEventListener('click', () => {
      openConfirmModal({
        title: 'Mark as settled?',
        message: `Record that ${memberName(t.from)} paid ${formatMoney(t.amount, state.currency)} to ${memberName(t.to)}.`,
        danger: false,
        onConfirm: () => {
          state.settlements.push({ id: generateId(), from: t.from, to: t.to, amount: t.amount, date: new Date().toISOString() });
          persistState();
          renderAll();
          renderSettleModal();
          Toast.show('Settlement recorded.', 'success');
        }
      });
    });
  });
}

/* ----------------------- GENERIC CONFIRM MODAL ----------------------- */

function openConfirmModal({ title, message, onConfirm, danger = true }){
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  confirmCallback = onConfirm;

  const okBtn = document.getElementById('confirmOkBtn');
  okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');

  ModalSystem.open('confirmModalOverlay');
}

function setupConfirmModal(){
  document.getElementById('confirmOkBtn').addEventListener('click', () => {
    const cb = confirmCallback;
    confirmCallback = null;
    ModalSystem.close('confirmModalOverlay');
    if(cb) cb();
  });
  document.getElementById('confirmCancelBtn').addEventListener('click', () => {
    confirmCallback = null;
    ModalSystem.close('confirmModalOverlay');
  });
}

/* ----------------------- MEMBERS ----------------------- */

function setupMembersDrawer(){
  document.getElementById('addMemberForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('newMemberName');
    const name = input.value.trim();

    if(!name){ setFieldError('newMemberName', 'Enter a name.'); return; }
    if(state.members.some(m => m.name.toLowerCase() === name.toLowerCase())){
      setFieldError('newMemberName', 'This member already exists.');
      return;
    }
    clearFieldError('newMemberName');

    const member = { id: generateId(), name, color: nextColor() };
    state.members.push(member);
    if(!state.currentUserId) state.currentUserId = member.id;

    persistState();
    renderAll();
    input.value = '';
    Toast.show(name + ' added to the trip.', 'success');
  });
}

function confirmRemoveMember(id){
  const usedInExpense = state.expenses.some(e => e.paidBy === id || e.participants.includes(id));
  if(usedInExpense){
    Toast.show('Cannot remove this member — they are linked to existing expenses. Delete those expenses first.', 'error');
    return;
  }

  const member = state.members.find(m => m.id === id);
  if(!member) return;

  openConfirmModal({
    title: 'Remove member?',
    message: `Remove ${member.name} from this trip?`,
    onConfirm: () => {
      state.members = state.members.filter(m => m.id !== id);
      if(state.currentUserId === id) state.currentUserId = state.members[0] ? state.members[0].id : null;
      persistState();
      renderAll();
      Toast.show(member.name + ' removed.', 'info');
    }
  });
}

/* ----------------------- EXCHANGE RATE WIDGET ----------------------- */

async function loadExchangeRate(){
  const content = document.getElementById('ratesContent');
  content.innerHTML = `
    <div class="skeleton-line"></div>
    <div class="skeleton-line short"></div>
  `;

  try{
    const rates = await CurrencyService.fetchRates(state.currency);
    const secondary = document.getElementById('secondaryCurrencySelect').value || 'USD';
    const rate = rates[secondary];

    if(rate === undefined){
      throw new Error('Rate not available for ' + secondary);
    }

    const total = state.expenses.reduce((sum, e) => sum + e.amount, 0);
    const converted = total * rate;

    content.innerHTML = `
      <p class="rate-line">1 ${state.currency} = ${rate.toFixed(4)} ${secondary}</p>
      <p class="rate-total">Trip total ≈ ${formatMoney(converted, secondary)}</p>
    `;
  }catch(err){
    console.error('Exchange rate fetch failed:', err);
    content.innerHTML = `<p class="error-text">Could not load exchange rates. ${escapeHTML(err.message)}</p>`;
  }
}

/* ----------------------- CLOUD BACKUP (Fetch POST demo) ----------------------- */

async function handleBackup(){
  const btn = document.getElementById('backupBtn');
  const statusEl = document.getElementById('backupStatus');
  const originalText = btn.textContent;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Backing up...';
  statusEl.textContent = '';
  statusEl.className = 'backup-status';

  try{
    const payload = {
      title: state.tripName,
      body: JSON.stringify({ members: state.members, expenses: state.expenses, settlements: state.settlements }),
      userId: 1
    };

    const res = await fetch('https://jsonplaceholder.typicode.com/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if(!res.ok) throw new Error('Server responded with ' + res.status);

    const data = await res.json();
    statusEl.textContent = 'Last backup: just now (demo id #' + data.id + ')';
    statusEl.classList.add('status-success');
    Toast.show('Trip backed up successfully.', 'success');
  }catch(err){
    console.error('Backup failed:', err);
    statusEl.textContent = 'Backup failed: ' + err.message;
    statusEl.classList.add('status-error');
    Toast.show('Could not back up right now. Check your connection and try again.', 'error');
  }finally{
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/* ----------------------- EXPORT / IMPORT ----------------------- */

function handleExport(){
  const data = {
    tripName: state.tripName,
    currency: state.currency,
    members: state.members,
    expenses: state.expenses,
    settlements: state.settlements
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (state.tripName || 'trip').replace(/\s+/g, '_') + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  Toast.show('Trip exported as JSON.', 'success');
}

function handleImportFile(file){
  if(!file) return;

  const looksLikeJson = file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
  if(!looksLikeJson){
    Toast.show('Please choose a .json file.', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = (ev) => {
    try{
      const parsed = JSON.parse(ev.target.result);
      if(!parsed || !Array.isArray(parsed.members) || !Array.isArray(parsed.expenses)){
        throw new Error('This file does not look like a Tripsplit export.');
      }

      openConfirmModal({
        title: 'Replace current trip?',
        message: `Importing "${parsed.tripName || 'this trip'}" will replace your current trip data. This cannot be undone.`,
        onConfirm: () => {
          state.tripName = parsed.tripName || 'Imported trip';
          state.currency = parsed.currency || 'INR';
          state.members = parsed.members;
          state.expenses = parsed.expenses;
          state.settlements = Array.isArray(parsed.settlements) ? parsed.settlements : [];
          state.currentUserId = state.members[0] ? state.members[0].id : null;
          persistState();
          document.getElementById('tripNameInput').value = state.tripName;
          document.getElementById('currencySelect').value = state.currency;
          renderAll();
          Toast.show('Trip imported successfully.', 'success');
        }
      });
    }catch(err){
      console.error('Import failed:', err);
      Toast.show('Could not import file: ' + err.message, 'error');
    }
  };
  reader.onerror = () => Toast.show('Could not read that file.', 'error');
  reader.readAsText(file);
}

/* ----------------------- EVENT WIRING ----------------------- */

function setupEventListeners(){
  // Expense form
  document.getElementById('expenseForm').addEventListener('submit', handleExpenseFormSubmit);
  document.getElementById('fabAddExpense').addEventListener('click', openAddExpenseModal);
  setupFileUpload();

  // Settle up
  document.getElementById('settleUpBtn').addEventListener('click', openSettleModal);

  // Confirm modal
  setupConfirmModal();

  // Members
  document.getElementById('openMembersDrawerBtn').addEventListener('click', () => ModalSystem.open('membersDrawerOverlay'));
  setupMembersDrawer();

  // Header controls
  document.getElementById('currencySelect').addEventListener('change', (e) => {
    state.currency = e.target.value;
    persistState();
    renderAll();
    loadExchangeRate();
  });

  document.getElementById('currentUserSelect').addEventListener('change', (e) => {
    state.currentUserId = e.target.value;
    persistState();
    renderStats();
    renderBalances();
  });

  document.getElementById('tripNameInput').addEventListener('change', (e) => {
    state.tripName = e.target.value.trim() || 'Untitled trip';
    e.target.value = state.tripName;
    persistState();
  });

  // Export / import
  document.getElementById('exportBtn').addEventListener('click', handleExport);
  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFileInput').click());
  document.getElementById('importFileInput').addEventListener('change', (e) => {
    handleImportFile(e.target.files[0]);
    e.target.value = ''; // allow re-importing the same file later
  });

  // Reset
  document.getElementById('resetBtn').addEventListener('click', () => {
    openConfirmModal({
      title: 'Reset this trip?',
      message: 'This will permanently delete all members, expenses, and settlements. This cannot be undone.',
      onConfirm: () => {
        TripStorage.clear();
        colorIndex = 0;
        state = { tripName: 'New Trip', currency: 'INR', currentUserId: null, members: [], expenses: [], settlements: [], activeCategoryFilter: 'All', searchQuery: '' };
        persistState();
        document.getElementById('tripNameInput').value = state.tripName;
        renderAll();
        Toast.show('Trip has been reset.', 'info');
      }
    });
  });

  // Exchange rate
  document.getElementById('refreshRateBtn').addEventListener('click', loadExchangeRate);
  document.getElementById('secondaryCurrencySelect').addEventListener('change', loadExchangeRate);

  // Backup
  document.getElementById('backupBtn').addEventListener('click', handleBackup);

  // Search (debounced)
  let searchDebounceTimer;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounceTimer);
    const value = e.target.value;
    searchDebounceTimer = setTimeout(() => {
      state.searchQuery = value;
      renderExpenseList();
    }, 150);
  });
}

/* ----------------------- BOOT ----------------------- */

function loadStateFromStorageOrSeed(){
  const saved = TripStorage.load();
  if(saved && Array.isArray(saved.members)){
    state = Object.assign(state, saved);
    // Keep colorIndex consistent so new members don't repeat a used color immediately.
    colorIndex = state.members.length;
  }else{
    state = seedState();
    persistState();
  }
  if(!state.currentUserId && state.members.length) state.currentUserId = state.members[0].id;
}

function boot(){
  // Simulate an initial async load so the skeleton-loading pattern is
  // visible and testable, even though the real data source here is
  // synchronous localStorage. Swap this for a real await fetch(...)
  // and the skeleton/empty/error states below already handle it.
  const container = document.getElementById('expenseListContainer');
  container.innerHTML = skeletonHTML(3);

  setTimeout(() => {
    loadStateFromStorageOrSeed();
    document.getElementById('tripNameInput').value = state.tripName;
    document.getElementById('currencySelect').value = state.currency;
    renderAll();
    loadExchangeRate();
  }, 550);
}

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  setupLiveValidation();
  boot();
});
