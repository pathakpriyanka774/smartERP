import React, { useState, useEffect } from 'react';
import './TemplateList.css';
import { COMPANY, BUYER_GSTIN_PLACEHOLDER } from '../../config/companyProfile';

const TemplateList = () => {
  const [templates, setTemplates] = useState([]);
  const [filterType, setFilterType] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = () => {
    const savedTemplates = JSON.parse(localStorage.getItem('templates') || '[]');
    const defaultTemplates = [
      {
        id: 1,
        name: 'GST Tax Invoice Template',
        type: 'Invoice',
        description: 'Exact GST compliant tax invoice with company logo and detailed structure',
        createdAt: '2024-01-15',
        isDefault: true,
        layout: 'gst-invoice'
      },
      {
        id: 2,
        name: 'Professional Invoice Template',
        type: 'Invoice',
        description: 'Standard business invoice template with clean design',
        createdAt: '2024-01-15',
        isDefault: true,
        layout: 'professional'
      },
      {
        id: 3,
        name: 'Minimal Invoice Template',
        type: 'Invoice',
        description: 'Clean and minimal invoice design for modern businesses',
        createdAt: '2024-01-15',
        isDefault: true,
        layout: 'minimal'
      },
      {
        id: 4,
        name: 'Email Invoice Template',
        type: 'Email',
        description: 'Email-friendly invoice template with responsive design',
        createdAt: '2024-01-15',
        isDefault: true,
        layout: 'email'
      }
    ];
    
    const allTemplates = [...defaultTemplates, ...savedTemplates];
    setTemplates(allTemplates);
  };

  const filteredTemplates = filterType === 'All' 
    ? templates 
    : templates.filter(template => template.type === filterType);

  const deleteTemplate = (templateId) => {
    const template = templates.find(t => t.id === templateId);
    if (template?.isDefault) {
      alert('Cannot delete default templates');
      return;
    }
    
    if (window.confirm('Are you sure you want to delete this template?')) {
      const updatedTemplates = templates.filter(t => t.id !== templateId);
      const customTemplates = updatedTemplates.filter(t => !t.isDefault);
      localStorage.setItem('templates', JSON.stringify(customTemplates));
      setTemplates(updatedTemplates);
    }
  };

  const duplicateTemplate = (template) => {
    const newTemplate = {
      ...template,
      id: Date.now(),
      name: `${template.name} (Copy)`,
      createdAt: new Date().toISOString().split('T')[0],
      isDefault: false
    };
    
    const savedTemplates = JSON.parse(localStorage.getItem('templates') || '[]');
    savedTemplates.push(newTemplate);
    localStorage.setItem('templates', JSON.stringify(savedTemplates));
    loadTemplates();
  };

  const selectTemplate = (template) => {
    localStorage.setItem('selectedInvoiceTemplate', JSON.stringify(template));
    window.location.hash = '#orders-invoice';
    closePreview();
  };

  const openPreview = (template) => {
    setSelectedTemplate(template);
    setShowPreview(true);
  };

  const closePreview = () => {
    setShowPreview(false);
    setSelectedTemplate(null);
  };

  const renderTemplatePreview = (template) => {
    // Preview data: the seller from the company profile (placeholders until
    // configured) and a fictional buyer. Real third-party details used to be here.
    const sampleData = {
      companyName: COMPANY.name,
      companyAddress: COMPANY.addressLines.join('\n'),
      gstin: `GSTIN ${COMPANY.gstin}`,
      phone: COMPANY.phone,
      email: COMPANY.email,
      website: COMPANY.website,
      invoiceNo: 'INV-0001',
      invoiceDate: '01/04/2026',
      placeOfSupply: COMPANY.placeOfSupply,
      clientName: 'Sample Customer Pvt Ltd',
      clientAddress: '[Buyer address line 1]\n[City, State PIN]\nIndia',
      clientGstin: `GSTIN ${BUYER_GSTIN_PLACEHOLDER}`
    };

    if (template.layout === 'gst-invoice') {
      return (
        <div className="gst-invoice-preview">
          <div className="gst-header">
            <div className="gst-company-section">
              <div className="gst-logo">🏭</div>
              <div className="gst-company-info">
                <h2>{sampleData.companyName}</h2>
                <div className="gst-address">
                  {sampleData.companyAddress.split('\n').map((line, i) => <div key={i}>{line}</div>)}
                </div>
                <div className="gst-contact">
                  <div>{sampleData.gstin}</div>
                  <div>{sampleData.phone}</div>
                  <div>{sampleData.email}</div>
                  <div>{sampleData.website}</div>
                </div>
              </div>
            </div>
            <div className="gst-title">
              <h1>TAX INVOICE</h1>
            </div>
          </div>
          
          <div className="gst-invoice-details">
            <div className="gst-left-details">
              <table>
                <tbody>
                  <tr><td>Invoice No.</td><td>: {sampleData.invoiceNo}</td></tr>
                  <tr><td>Invoice Date</td><td>: {sampleData.invoiceDate}</td></tr>
                  <tr><td>Terms</td><td>:</td></tr>
                  <tr><td>Due Date</td><td>: {sampleData.invoiceDate}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="gst-right-details">
              <table>
                <tbody>
                  <tr><td>Place of Supply</td><td>: {sampleData.placeOfSupply}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="gst-parties">
            <div className="gst-bill-to">
              <h4>Bill To</h4>
              <div><strong>{sampleData.clientName}</strong></div>
              {sampleData.clientAddress.split('\n').map((line, i) => <div key={i}>{line}</div>)}
              <div>{sampleData.clientGstin}</div>
            </div>
            <div className="gst-ship-to">
              <h4>Ship To</h4>
              <div><strong>C-90</strong></div>
              <div>HOSIERY COMPLEX PHASE-2,</div>
              <div>NOIDA</div>
              <div>201305 Uttar Pradesh</div>
              <div>India</div>
              <div>{sampleData.clientGstin}</div>
            </div>
          </div>
          
          <table className="gst-items-table">
            <thead>
              <tr>
                <th rowSpan="2">S. NO</th>
                <th rowSpan="2">Style & Description</th>
                <th rowSpan="2">HSN/ SAC</th>
                <th rowSpan="2">Qty</th>
                <th rowSpan="2">Rate</th>
                <th rowSpan="2">Per</th>
                <th rowSpan="2">Amt</th>
                <th colSpan="2">CGST</th>
                <th colSpan="2">SGST</th>
                <th rowSpan="2">Amount</th>
              </tr>
              <tr>
                <th>%</th><th>Amt</th><th>%</th><th>Amt</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1</td>
                <td>HT-AB-306</td>
                <td>581100</td>
                <td>2,182.63</td>
                <td>2.5%</td>
                <td>%</td>
                <td>2,182.63</td>
                <td>2.5%</td>
                <td>2,182.63</td>
                <td>2.5%</td>
                <td>2,182.63</td>
                <td>87,305.10</td>
              </tr>
            </tbody>
          </table>
          
          <div className="gst-totals">
            <div className="gst-words">
              <strong>Total in Words</strong><br/>
              <em>Indian Rupee Ninety-One Thousand Six Hundred Seventy and Thirty-Six Paise Only</em>
            </div>
            <div className="gst-amounts">
              <table>
                <tbody>
                  <tr><td>Sub Total</td><td>87,305.10</td></tr>
                  <tr><td>CGST 2.5 (2.5%)</td><td>2,182.63</td></tr>
                  <tr><td>SGST 2.5 (2.5%)</td><td>2,182.63</td></tr>
                  <tr><td><strong>Total</strong></td><td><strong>91,670.36</strong></td></tr>
                  <tr><td><strong>Balance Due</strong></td><td><strong>91,670.36</strong></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="gst-footer">
            <div className="gst-bank">
              <strong>BANK NAME : {COMPANY.bank.name}</strong><br/>
              <strong>A/C NO. : {COMPANY.bank.account}</strong><br/>
              <strong>IFSC CODE : {COMPANY.bank.ifsc}</strong><br/><br/>
              <strong>E-WAY BILL NO. : ____________</strong>
            </div>
            <div className="gst-signature">
              <strong>Authorised Signature</strong>
            </div>
          </div>
          
          <div className="gst-terms">
            <strong>Terms & Conditions:</strong><br/>
            <small>
              • Return & After Policy: Returns for alteration are accepted within 2 days of delivery.<br/>
              • Ownership & Risk: Any loss or damage after delivery is the buyer's responsibility.<br/>
              • Payment Terms: Payment is due within 15 to 30 days from the invoice date.<br/>
              • Taxes & Duties: All applicable taxes, including GST, are the responsibility of the buyer unless stated otherwise.<br/>
              • Shipping & Delivery: Any delivery timelines provided are estimates.
            </small>
          </div>
        </div>
      );
    }

    if (template.layout === 'minimal') {
      return (
        <div className="template-preview-minimal">
          <div className="minimal-header">
            <h1>{sampleData.companyName}</h1>
            <div className="invoice-title">INVOICE</div>
          </div>
          <div className="minimal-info">
            <div>Invoice: {sampleData.invoiceNo}</div>
            <div>Date: {sampleData.invoiceDate}</div>
          </div>
          <div className="minimal-client">
            <strong>Bill To:</strong><br/>
            {sampleData.clientName}<br/>
            C-90, HOSIERY COMPLEX PHASE-2, NOIDA
          </div>
          <table className="minimal-table">
            <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
            <tbody>
              <tr><td>HT-AB-306</td><td>2,182.63</td><td>₹40</td><td>₹87,305.10</td></tr>
            </tbody>
          </table>
          <div className="minimal-total">Total: ₹91,670.36</div>
        </div>
      );
    }

    return (
      <div className="template-preview-professional">
        <div className="prof-header">
          <div className="prof-company">
            <div className="prof-logo">🏭</div>
            <div>
              <h2>{sampleData.companyName}</h2>
              <div>C-49, SECTOR 38, Noida</div>
            </div>
          </div>
          <h1>TAX INVOICE</h1>
        </div>
        <div className="prof-info">
          <div>Invoice No: {sampleData.invoiceNo}</div>
          <div>Date: {sampleData.invoiceDate}</div>
        </div>
        <div className="prof-client">
          <strong>Bill To:</strong><br/>
          {sampleData.clientName}<br/>
          C-90, HOSIERY COMPLEX PHASE-2, NOIDA
        </div>
        <table className="prof-table">
          <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
          <tbody>
            <tr><td>HT-AB-306</td><td>2,182.63</td><td>₹40</td><td>₹87,305.10</td></tr>
          </tbody>
        </table>
        <div className="prof-total">Total: ₹91,670.36</div>
      </div>
    );
  };

  const templateTypes = ['All', 'Invoice', 'Email', 'Quote', 'Receipt'];

  return (
    <div className="template-list">
      <div className="template-list-header">
        <h2>Template Library</h2>
        <div className="header-actions">
          <select 
            value={filterType} 
            onChange={(e) => setFilterType(e.target.value)}
            className="filter-select"
          >
            {templateTypes.map(type => (
              <option key={type} value={type}>{type} Templates</option>
            ))}
          </select>
        </div>
      </div>

      <div className="templates-grid">
        {filteredTemplates.map(template => (
          <div key={template.id} className="template-card" onClick={() => openPreview(template)}>
            <div className="template-preview">
              <div className="preview-content">
                <div className="template-icon">
                  {template.type === 'Invoice' && '📄'}
                  {template.type === 'Email' && '📧'}
                  {template.type === 'Quote' && '💼'}
                  {template.type === 'Receipt' && '🧾'}
                </div>
                <h3>{template.name}</h3>
              </div>
              <div className="preview-overlay">
                <span>Click to Preview</span>
              </div>
            </div>
            
            <div className="template-info">
              <div className="template-meta">
                <span className={`template-type ${template.type.toLowerCase()}`}>
                  {template.type}
                </span>
                {template.isDefault && (
                  <span className="default-badge">Default</span>
                )}
              </div>
              
              <p className="template-description">{template.description}</p>
              
              <div className="template-date">
                Created: {new Date(template.createdAt).toLocaleDateString()}
              </div>
              
              <div className="template-actions">
                <button 
                  onClick={(e) => { e.stopPropagation(); duplicateTemplate(template); }}
                  className="btn-duplicate"
                >
                  Duplicate
                </button>
                {!template.isDefault && (
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteTemplate(template.id); }}
                    className="btn-delete"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredTemplates.length === 0 && (
        <div className="no-templates">
          <div className="no-templates-icon">📄</div>
          <h3>No {filterType} Templates Found</h3>
          <p>Create your first template using the Template Builder</p>
        </div>
      )}
      
      {showPreview && selectedTemplate && (
        <div className="preview-modal" onClick={closePreview}>
          <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="preview-header">
              <h3>{selectedTemplate.name}</h3>
              <button onClick={closePreview} className="close-btn">×</button>
            </div>
            <div className="preview-body">
              {renderTemplatePreview(selectedTemplate)}
            </div>
            <div className="preview-footer">
              <button onClick={() => selectTemplate(selectedTemplate)} className="btn-use">
                Use This Template
              </button>
              <button onClick={closePreview} className="btn-cancel">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateList;