/**
 * InvoiceFlow — Utility helpers
 */

const IFUtils = {
  formatCurrency(amount, symbol = '$') {
    const n = Number(amount) || 0;
    return symbol + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  },

  formatDateShort(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  },

  today() {
    return new Date().toISOString().slice(0, 10);
  },

  addDays(dateStr, days) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  },

  statusLabel(status) {
    const map = {
      draft: 'Draft',
      sent: 'Sent',
      viewed: 'Viewed',
      partially_paid: 'Partially Paid',
      paid: 'Paid',
      overdue: 'Overdue',
      cancelled: 'Cancelled'
    };
    return map[status] || status;
  },

  statusClass(status) {
    return 'badge badge-' + (status || 'draft');
  },

  toast(message, type = 'success') {
    const container = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    const icon = type === 'success'
      ? '<svg class="w-5 h-5 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>'
      : type === 'error'
      ? '<svg class="w-5 h-5 text-red-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>'
      : '<svg class="w-5 h-5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
    el.innerHTML = `${icon}<span class="text-sm flex-1">${message}</span><button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">&times;</button>`;
    container.appendChild(el);
    el.querySelector('button').onclick = () => el.remove();
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      setTimeout(() => el.remove(), 300);
    }, 3500);
  },

  confirm(message) {
    return new Promise(resolve => {
      const root = document.getElementById('modalRoot');
      root.innerHTML = `
        <div class="modal-backdrop">
          <div class="modal p-6 max-w-sm">
            <h3 class="text-lg font-semibold mb-2">Confirm</h3>
            <p class="text-sm text-slate-600 dark:text-slate-400 mb-6">${message}</p>
            <div class="flex justify-end gap-2">
              <button class="btn btn-secondary" data-action="cancel">Cancel</button>
              <button class="btn btn-danger" data-action="ok">Confirm</button>
            </div>
          </div>
        </div>`;
      const close = (val) => { root.innerHTML = ''; resolve(val); };
      root.querySelector('[data-action="cancel"]').onclick = () => close(false);
      root.querySelector('[data-action="ok"]').onclick = () => close(true);
      root.querySelector('.modal-backdrop').onclick = (e) => { if (e.target === e.currentTarget) close(false); };
    });
  },

  debounce(fn, ms = 300) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
};

window.IFUtils = IFUtils;
