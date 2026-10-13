/**
 * InvoiceFlow — PDF generation with multiple templates
 */

const IFPdf = {
  async generate(invoice, customer, settings, options = {}) {
    const { jsPDF } = window.jspdf;
    const totals = IFData.calcInvoiceTotals(invoice);
    const currency = settings.currencySymbol || '$';
    const template = options.template || settings.template || 'modern';

    // Create a temporary DOM for rendering
    const container = document.createElement('div');
    container.id = 'pdf-render-temp';
    container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:white;color:#0f172a;font-family:Inter,system-ui,sans-serif;';
    document.body.appendChild(container);

    container.innerHTML = this.renderTemplate(template, invoice, customer, settings, totals, currency);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const filename = `${invoice.number || 'invoice'}.pdf`;
      if (options.download !== false) {
        pdf.save(filename);
      }
      return pdf;
    } finally {
      container.remove();
    }
  },

  renderTemplate(template, invoice, customer, settings, totals, currency) {
    const brand = settings.brandColor || '#2563eb';
    const logoHtml = settings.logo
      ? `<img src="${settings.logo}" alt="Logo" style="max-height:56px;max-width:180px;object-fit:contain;">`
      : `<div style="font-size:22px;font-weight:700;color:${brand};">${IFUtils.escapeHtml(settings.companyName || 'Company')}</div>`;

    const itemsHtml = (invoice.items || []).map(item => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">
          <div style="font-weight:500;">${IFUtils.escapeHtml(item.name)}</div>
          ${item.description ? `<div style="font-size:12px;color:#64748b;margin-top:2px;">${IFUtils.escapeHtml(item.description)}</div>` : ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${item.qty}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${currency}${Number(item.price).toFixed(2)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:500;">${currency}${(item.qty * item.price).toFixed(2)}</td>
      </tr>
    `).join('');

    const addressLines = (settings.address || '').split('\n').map(l => IFUtils.escapeHtml(l)).join('<br>');
    const custAddress = (customer?.address || '').split('\n').map(l => IFUtils.escapeHtml(l)).join('<br>');

    if (template === 'classic') {
      return this.classicTemplate({ logoHtml, brand, invoice, customer, settings, totals, currency, itemsHtml, addressLines, custAddress });
    }
    if (template === 'minimal') {
      return this.minimalTemplate({ logoHtml, brand, invoice, customer, settings, totals, currency, itemsHtml, addressLines, custAddress });
    }
    // default modern
    return this.modernTemplate({ logoHtml, brand, invoice, customer, settings, totals, currency, itemsHtml, addressLines, custAddress });
  },

  modernTemplate({ logoHtml, brand, invoice, customer, settings, totals, currency, itemsHtml, addressLines, custAddress }) {
    return `
      <div style="padding:40px 48px;width:794px;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;">
          <div>${logoHtml}
            <div style="margin-top:12px;font-size:13px;color:#64748b;line-height:1.5;">${addressLines}</div>
            ${settings.email ? `<div style="font-size:13px;color:#64748b;">${IFUtils.escapeHtml(settings.email)}</div>` : ''}
            ${settings.phone ? `<div style="font-size:13px;color:#64748b;">${IFUtils.escapeHtml(settings.phone)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            <div style="font-size:28px;font-weight:700;color:${brand};letter-spacing:-0.5px;">INVOICE</div>
            <div style="margin-top:8px;font-size:14px;color:#334155;"><strong>${IFUtils.escapeHtml(invoice.number)}</strong></div>
            <div style="font-size:13px;color:#64748b;margin-top:4px;">Issue: ${IFUtils.formatDate(invoice.issueDate)}</div>
            <div style="font-size:13px;color:#64748b;">Due: ${IFUtils.formatDate(invoice.dueDate)}</div>
          </div>
        </div>

        <div style="display:flex;gap:48px;margin-bottom:32px;">
          <div style="flex:1;">
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:6px;">Bill To</div>
            <div style="font-weight:600;font-size:15px;">${IFUtils.escapeHtml(customer?.name || '—')}</div>
            ${customer?.company ? `<div style="font-size:13px;color:#475569;">${IFUtils.escapeHtml(customer.company)}</div>` : ''}
            <div style="font-size:13px;color:#64748b;margin-top:4px;line-height:1.5;">${custAddress}</div>
            ${customer?.email ? `<div style="font-size:13px;color:#64748b;">${IFUtils.escapeHtml(customer.email)}</div>` : ''}
          </div>
          <div style="flex:1;">
            <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;margin-bottom:6px;">Status</div>
            <div style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:600;background:${brand}18;color:${brand};">${IFUtils.statusLabel(invoice.status)}</div>
          </div>
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <thead>
            <tr style="background:${brand};color:white;">
              <th style="padding:12px;text-align:left;font-size:12px;font-weight:600;">Item</th>
              <th style="padding:12px;text-align:center;font-size:12px;font-weight:600;width:70px;">Qty</th>
              <th style="padding:12px;text-align:right;font-size:12px;font-weight:600;width:100px;">Rate</th>
              <th style="padding:12px;text-align:right;font-size:12px;font-weight:600;width:110px;">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <div style="display:flex;justify-content:flex-end;">
          <div style="width:260px;">
            <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
              <span style="color:#64748b;">Subtotal</span>
              <span>${currency}${totals.subtotal.toFixed(2)}</span>
            </div>
            ${totals.discountAmount > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
              <span style="color:#64748b;">Discount</span>
              <span>-${currency}${totals.discountAmount.toFixed(2)}</span>
            </div>` : ''}
            ${totals.taxAmount > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
              <span style="color:#64748b;">Tax</span>
              <span>${currency}${totals.taxAmount.toFixed(2)}</span>
            </div>` : ''}
            ${totals.shipping > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;">
              <span style="color:#64748b;">Shipping</span>
              <span>${currency}${totals.shipping.toFixed(2)}</span>
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;padding:12px 0 0;margin-top:8px;border-top:2px solid ${brand};font-size:16px;font-weight:700;">
              <span>Total</span>
              <span style="color:${brand};">${currency}${totals.total.toFixed(2)}</span>
            </div>
            ${totals.paid > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#047857;">
              <span>Paid</span>
              <span>${currency}${totals.paid.toFixed(2)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;font-weight:600;">
              <span>Balance Due</span>
              <span>${currency}${totals.balance.toFixed(2)}</span>
            </div>` : ''}
          </div>
        </div>

        ${(invoice.notes || invoice.terms) ? `
        <div style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;">
          ${invoice.notes ? `<div style="margin-bottom:12px;"><div style="font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:4px;">NOTES</div><div style="font-size:13px;color:#475569;">${IFUtils.escapeHtml(invoice.notes)}</div></div>` : ''}
          ${invoice.terms ? `<div><div style="font-size:11px;font-weight:600;color:#94a3b8;margin-bottom:4px;">TERMS</div><div style="font-size:13px;color:#475569;">${IFUtils.escapeHtml(invoice.terms)}</div></div>` : ''}
        </div>` : ''}

        <div style="margin-top:48px;text-align:center;font-size:12px;color:#94a3b8;">
          ${settings.website ? IFUtils.escapeHtml(settings.website) + ' · ' : ''}Thank you for your business
        </div>
      </div>
    `;
  },

  classicTemplate({ logoHtml, brand, invoice, customer, settings, totals, currency, itemsHtml, addressLines, custAddress }) {
    return `
      <div style="padding:40px 48px;width:794px;box-sizing:border-box;border-top:6px solid ${brand};">
        <div style="text-align:center;margin-bottom:28px;">
          ${logoHtml}
          <div style="font-size:13px;color:#64748b;margin-top:8px;">${addressLines.replace(/<br>/g, ' · ')}</div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:28px;padding-bottom:16px;border-bottom:1px solid #e2e8f0;">
          <div>
            <div style="font-size:11px;color:#94a3b8;font-weight:600;">INVOICE TO</div>
            <div style="font-weight:600;margin-top:4px;">${IFUtils.escapeHtml(customer?.name || '')}</div>
            <div style="font-size:13px;color:#64748b;">${custAddress}</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:20px;font-weight:700;">${IFUtils.escapeHtml(invoice.number)}</div>
            <div style="font-size:13px;color:#64748b;">Date: ${IFUtils.formatDate(invoice.issueDate)}</div>
            <div style="font-size:13px;color:#64748b;">Due: ${IFUtils.formatDate(invoice.dueDate)}</div>
          </div>
        </div>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <thead>
            <tr style="border-bottom:2px solid #0f172a;">
              <th style="padding:10px 8px;text-align:left;font-size:12px;">Description</th>
              <th style="padding:10px 8px;text-align:center;font-size:12px;width:60px;">Qty</th>
              <th style="padding:10px 8px;text-align:right;font-size:12px;width:90px;">Price</th>
              <th style="padding:10px 8px;text-align:right;font-size:12px;width:100px;">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div style="text-align:right;font-size:14px;">
          <div>Subtotal: ${currency}${totals.subtotal.toFixed(2)}</div>
          ${totals.discountAmount ? `<div>Discount: -${currency}${totals.discountAmount.toFixed(2)}</div>` : ''}
          ${totals.taxAmount ? `<div>Tax: ${currency}${totals.taxAmount.toFixed(2)}</div>` : ''}
          <div style="font-size:18px;font-weight:700;margin-top:8px;">Total: ${currency}${totals.total.toFixed(2)}</div>
        </div>
        ${invoice.terms ? `<div style="margin-top:32px;font-size:12px;color:#64748b;"><strong>Terms:</strong> ${IFUtils.escapeHtml(invoice.terms)}</div>` : ''}
      </div>
    `;
  },

  minimalTemplate({ logoHtml, brand, invoice, customer, settings, totals, currency, itemsHtml, addressLines, custAddress }) {
    return `
      <div style="padding:48px;width:794px;box-sizing:border-box;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:48px;">
          <div style="font-size:24px;font-weight:300;letter-spacing:2px;color:#0f172a;">INVOICE</div>
          <div style="font-size:14px;color:#64748b;">${IFUtils.escapeHtml(invoice.number)}</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:40px;">
          <div>
            <div style="font-size:11px;letter-spacing:1px;color:#94a3b8;margin-bottom:8px;">FROM</div>
            <div style="font-weight:500;">${IFUtils.escapeHtml(settings.companyName)}</div>
            <div style="font-size:13px;color:#64748b;line-height:1.6;">${addressLines}</div>
          </div>
          <div>
            <div style="font-size:11px;letter-spacing:1px;color:#94a3b8;margin-bottom:8px;">TO</div>
            <div style="font-weight:500;">${IFUtils.escapeHtml(customer?.name || '')}</div>
            <div style="font-size:13px;color:#64748b;line-height:1.6;">${custAddress}</div>
          </div>
        </div>
        <div style="display:flex;gap:24px;margin-bottom:32px;font-size:13px;color:#64748b;">
          <div>Issued <strong style="color:#0f172a;">${IFUtils.formatDate(invoice.issueDate)}</strong></div>
          <div>Due <strong style="color:#0f172a;">${IFUtils.formatDate(invoice.dueDate)}</strong></div>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid #e2e8f0;">
              <th style="padding:12px 0;text-align:left;font-size:11px;font-weight:500;color:#94a3b8;letter-spacing:0.5px;">ITEM</th>
              <th style="padding:12px 0;text-align:center;font-size:11px;font-weight:500;color:#94a3b8;width:60px;">QTY</th>
              <th style="padding:12px 0;text-align:right;font-size:11px;font-weight:500;color:#94a3b8;width:90px;">RATE</th>
              <th style="padding:12px 0;text-align:right;font-size:11px;font-weight:500;color:#94a3b8;width:100px;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div style="margin-top:24px;text-align:right;">
          <div style="font-size:13px;color:#64748b;">Total</div>
          <div style="font-size:28px;font-weight:300;letter-spacing:-1px;">${currency}${totals.total.toFixed(2)}</div>
        </div>
      </div>
    `;
  }
};

window.IFPdf = IFPdf;
