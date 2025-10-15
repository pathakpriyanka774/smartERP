import React, { useState, useEffect } from 'react';
import './InvoiceGenerator.css';

const InvoiceGenerator = () => {
  const [selectedOrder, setSelectedOrder] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templates, setTemplates] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customQuantity, setCustomQuantity] = useState('');
  const [invoiceData, setInvoiceData] = useState({
    invoiceNumber: '',
    orderNumber: '',
    clientName: '',
    clientAddress: '',
    clientEmail: '',
    clientPhone: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    items: [],
    notes: '',
    paymentTerms: '30 days'
  });
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    // Check for selected template from template list
    const selectedTemplate = localStorage.getItem('selectedInvoiceTemplate');
    if (selectedTemplate) {
      const template = JSON.parse(selectedTemplate);
      setSelectedTemplate(template.id.toString());
      localStorage.removeItem('selectedInvoiceTemplate');
    }
    
    // Load templates
    const savedTemplates = JSON.parse(localStorage.getItem('templates') || '[]');
    const defaultTemplates = [
      { id: 1, name: 'GST Tax Invoice Template', type: 'Invoice', layout: 'gst-invoice' },
      { id: 2, name: 'Professional Invoice Template', type: 'Invoice', layout: 'professional' },
      { id: 3, name: 'Minimal Invoice Template', type: 'Invoice', layout: 'minimal' }
    ];
    setTemplates([...defaultTemplates, ...savedTemplates.filter(t => t.type === 'Invoice')]);
    
    // Load orders from localStorage or use sample data
    const storedOrders = JSON.parse(localStorage.getItem('orders') || '[]');
    const sampleOrders = [
      { 
        id: 1001, 
        clientName: 'ABC Clothing Manufacturing', 
        contactPerson: 'John Smith',
        email: 'john@abcclothing.com',
        phone: '+1-555-0123',
        address: '123 Fashion Ave, New York, NY 10001',
        productType: 'Cotton T-Shirts', 
        quantity: 5000, 
        unitPrice: 12.50,
        totalAmount: 62500,
        deliveryDate: '2024-05-15',
        status: 'Completed', 
        orderDate: '2024-01-15' 
      },
      { 
        id: 1002, 
        clientName: 'Fashion Forward Wholesale', 
        contactPerson: 'Sarah Johnson',
        email: 'sarah@fashionforward.com',
        phone: '+1-555-0456',
        address: '456 Commerce St, Los Angeles, CA 90210',
        productType: 'Denim Jeans', 
        quantity: 2500, 
        unitPrice: 28.00,
        totalAmount: 70000,
        deliveryDate: '2024-05-20',
        status: 'Completed', 
        orderDate: '2024-01-20' 
      }
    ];
    setOrders(storedOrders.length > 0 ? storedOrders : sampleOrders);
    
    // Generate invoice number
    const invoiceNumber = 'INV-' + Date.now().toString().slice(-6);
    setInvoiceData(prev => ({ ...prev, invoiceNumber }));
  }, []);

  const handleOrderSelect = (orderId) => {
    const order = orders.find(o => o.id === parseInt(orderId));
    if (order) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      
      setCustomQuantity(order.quantity.toString());
      
      setInvoiceData({
        ...invoiceData,
        orderNumber: order.id.toString(),
        clientName: order.clientName,
        clientAddress: order.address || `${order.clientName}\nContact: ${order.contactPerson}`,
        clientEmail: order.email,
        clientPhone: order.phone,
        dueDate: dueDate.toISOString().split('T')[0],
        items: [{
          description: order.productType,
          quantity: order.quantity,
          unitPrice: order.unitPrice,
          total: order.totalAmount
        }]
      });
    }
    setSelectedOrder(orderId);
  };

  const handleQuantityChange = (newQuantity) => {
    setCustomQuantity(newQuantity);
    if (selectedOrder && invoiceData.items.length > 0) {
      const order = orders.find(o => o.id === parseInt(selectedOrder));
      const quantity = parseFloat(newQuantity) || 0;
      const unitPrice = order.unitPrice;
      const total = quantity * unitPrice;
      
      setInvoiceData({
        ...invoiceData,
        items: [{
          ...invoiceData.items[0],
          quantity: quantity,
          total: total
        }]
      });
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setInvoiceData({ ...invoiceData, [name]: value });
  };

  const calculateSubtotal = () => {
    return invoiceData.items.reduce((sum, item) => sum + item.total, 0);
  };

  const calculateTax = () => {
    return calculateSubtotal() * 0.08; // 8% tax
  };

  const calculateTotal = () => {
    return calculateSubtotal() + calculateTax();
  };

  const generatePDF = () => {
    window.print();
  };

  const saveInvoice = () => {
    const selectedTemplateData = templates.find(t => t.id === parseInt(selectedTemplate));
    const invoices = JSON.parse(localStorage.getItem('invoices') || '[]');
    const newInvoice = {
      ...invoiceData,
      id: Date.now(),
      createdAt: new Date().toISOString(),
      subtotal: calculateSubtotal(),
      tax: calculateTax(),
      total: calculateTotal(),
      template: selectedTemplateData || { layout: 'professional' }
    };
    invoices.push(newInvoice);
    localStorage.setItem('invoices', JSON.stringify(invoices));
    alert('Invoice saved successfully!');
  };

  const renderInvoiceByTemplate = () => {
    const selectedTemplateData = templates.find(t => t.id === parseInt(selectedTemplate));
    const layout = selectedTemplateData?.layout || 'professional';

    if (layout === 'gst-invoice') {
      return (
        <div className="invoice-document gst-layout" id="invoice-document">
          <div className="gst-invoice-header">
            <div className="gst-company-section">
              <div className="gst-logo">🏭</div>
              <div className="gst-company-info">
                <h2>RADHA KRISHN EXPORT</h2>
                <div className="gst-address">
                  <div>C-49</div>
                  <div>SECTOR 38</div>
                  <div>Noida Uttar Pradesh 201305</div>
                  <div>India</div>
                </div>
                <div className="gst-contact">
                  <div>GSTIN 09CJPG2343K1Z6</div>
                  <div>8057563842</div>
                  <div>radhakrishnexport123@gmail.com</div>
                  <div>www.radhakrishnexport.com</div>
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
                  <tr><td>Invoice No.</td><td>: {invoiceData.invoiceNumber}</td></tr>
                  <tr><td>Invoice Date</td><td>: {new Date(invoiceData.invoiceDate).toLocaleDateString()}</td></tr>
                  <tr><td>Terms</td><td>: {invoiceData.paymentTerms}</td></tr>
                  <tr><td>Due Date</td><td>: {new Date(invoiceData.dueDate).toLocaleDateString()}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="gst-right-details">
              <table>
                <tbody>
                  <tr><td>Place of Supply</td><td>: Uttar Pradesh (09)</td></tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="gst-parties">
            <div className="gst-bill-to">
              <h4>Bill To</h4>
              <div><strong>{invoiceData.clientName}</strong></div>
              {invoiceData.clientAddress.split('\n').map((line, index) => (
                <div key={index}>{line}</div>
              ))}
              <div>GSTIN 09AACCP1238T26</div>
            </div>
            <div className="gst-ship-to">
              <h4>Ship To</h4>
              <div><strong>{invoiceData.clientName}</strong></div>
              {invoiceData.clientAddress.split('\n').map((line, index) => (
                <div key={index}>{line}</div>
              ))}
              <div>GSTIN 09AACCP1238T26</div>
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
              {invoiceData.items.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{item.description}</td>
                  <td>581100</td>
                  <td>{item.quantity.toLocaleString()}</td>
                  <td>2.5%</td>
                  <td>%</td>
                  <td>{(item.quantity * item.unitPrice * 0.025).toFixed(2)}</td>
                  <td>2.5%</td>
                  <td>{(item.quantity * item.unitPrice * 0.025).toFixed(2)}</td>
                  <td>2.5%</td>
                  <td>{(item.quantity * item.unitPrice * 0.025).toFixed(2)}</td>
                  <td>{item.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="gst-totals">
            <div className="gst-words">
              <strong>Total in Words</strong><br/>
              <em>Indian Rupee {Math.floor(calculateTotal()).toLocaleString()} and {Math.round((calculateTotal() % 1) * 100)} Paise Only</em>
            </div>
            <div className="gst-amounts">
              <table>
                <tbody>
                  <tr><td>Sub Total</td><td>{calculateSubtotal().toFixed(2)}</td></tr>
                  <tr><td>CGST 2.5 (2.5%)</td><td>{(calculateSubtotal() * 0.025).toFixed(2)}</td></tr>
                  <tr><td>SGST 2.5 (2.5%)</td><td>{(calculateSubtotal() * 0.025).toFixed(2)}</td></tr>
                  <tr><td><strong>Total</strong></td><td><strong>{calculateTotal().toFixed(2)}</strong></td></tr>
                  <tr><td><strong>Balance Due</strong></td><td><strong>{calculateTotal().toFixed(2)}</strong></td></tr>
                </tbody>
              </table>
            </div>
          </div>
          
          <div className="gst-footer">
            <div className="gst-bank">
              <strong>BANK NAME : CANARA BANK</strong><br/>
              <strong>A/C NO. : 1200356138778</strong><br/>
              <strong>IFSC CODE : CNRB0007820</strong><br/><br/>
              <strong>E-WAY BILL NO. : 491622361563</strong>
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

    if (layout === 'minimal') {
      return (
        <div className="invoice-document minimal-layout" id="invoice-document">
          <div className="minimal-invoice-header">
            <div className="minimal-company-info">
              <h1>StitchPro Optivise</h1>
              <p>Premium Clothing Manufacturing</p>
            </div>
            <div className="minimal-invoice-title">
              <h2>INVOICE</h2>
            </div>
          </div>
          
          <div className="minimal-invoice-info">
            <div className="minimal-info-row">
              <span>Invoice #: {invoiceData.invoiceNumber}</span>
              <span>Date: {new Date(invoiceData.invoiceDate).toLocaleDateString()}</span>
            </div>
            <div className="minimal-info-row">
              <span>Due Date: {new Date(invoiceData.dueDate).toLocaleDateString()}</span>
            </div>
          </div>
          
          <div className="minimal-client-info">
            <h3>Bill To:</h3>
            <p><strong>{invoiceData.clientName}</strong></p>
            {invoiceData.clientAddress.split('\n').map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            <p>{invoiceData.clientEmail}</p>
          </div>
          
          <table className="minimal-items-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Quantity</th>
                <th>Unit Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {invoiceData.items.map((item, index) => (
                <tr key={index}>
                  <td>{item.description}</td>
                  <td>{item.quantity.toLocaleString()}</td>
                  <td>${item.unitPrice.toFixed(2)}</td>
                  <td>${item.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div className="minimal-totals">
            <div className="minimal-total-row">
              <span>Subtotal: ${calculateSubtotal().toLocaleString()}</span>
            </div>
            <div className="minimal-total-row">
              <span>Tax: ${calculateTax().toLocaleString()}</span>
            </div>
            <div className="minimal-total-row final">
              <span>Total: ${calculateTotal().toLocaleString()}</span>
            </div>
          </div>
          
          {invoiceData.notes && (
            <div className="minimal-notes">
              <p>{invoiceData.notes}</p>
            </div>
          )}
        </div>
      );
    }

    // Default professional layout
    return (
      <div className="invoice-document" id="invoice-document">
        <div className="invoice-header-doc">
          <div className="company-info">
            <h1>StitchPro Optivise</h1>
            <p>Premium Clothing Manufacturing</p>
            <p>123 Industrial Blvd, Manufacturing City, MC 12345</p>
            <p>Phone: +1-555-STITCH | Email: billing@stitchpro.com</p>
          </div>
          <div className="invoice-meta">
            <h2>INVOICE</h2>
            <p><strong>Invoice #:</strong> {invoiceData.invoiceNumber}</p>
            <p><strong>Date:</strong> {new Date(invoiceData.invoiceDate).toLocaleDateString()}</p>
            <p><strong>Due Date:</strong> {new Date(invoiceData.dueDate).toLocaleDateString()}</p>
            <p><strong>Terms:</strong> {invoiceData.paymentTerms}</p>
          </div>
        </div>
        
        <div className="invoice-parties">
          <div className="bill-to">
            <h3>Bill To:</h3>
            <p><strong>{invoiceData.clientName}</strong></p>
            {invoiceData.clientAddress.split('\n').map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            <p>{invoiceData.clientEmail}</p>
            <p>{invoiceData.clientPhone}</p>
          </div>
          <div className="order-info">
            <h3>Order Details:</h3>
            <p><strong>Order #:</strong> {invoiceData.orderNumber}</p>
            <p><strong>Order Date:</strong> {orders.find(o => o.id === parseInt(selectedOrder))?.orderDate}</p>
          </div>
        </div>
        
        <table className="invoice-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {invoiceData.items.map((item, index) => (
              <tr key={index}>
                <td>{item.description}</td>
                <td>{item.quantity.toLocaleString()}</td>
                <td>${item.unitPrice.toFixed(2)}</td>
                <td>${item.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div className="invoice-totals">
          <div className="totals-section">
            <div className="total-row">
              <span>Subtotal:</span>
              <span>${calculateSubtotal().toLocaleString()}</span>
            </div>
            <div className="total-row">
              <span>Tax (8%):</span>
              <span>${calculateTax().toLocaleString()}</span>
            </div>
            <div className="total-row final-total">
              <span>Total Amount:</span>
              <span>${calculateTotal().toLocaleString()}</span>
            </div>
          </div>
        </div>
        
        {invoiceData.notes && (
          <div className="invoice-notes">
            <h4>Notes:</h4>
            <p>{invoiceData.notes}</p>
          </div>
        )}
        
        <div className="invoice-footer">
          <p>Payment is due within {invoiceData.paymentTerms}. Thank you for your business!</p>
          <p><strong>Bank Details:</strong> StitchPro Bank | Account: 1234567890 | Routing: 987654321</p>
        </div>
      </div>
    );
  };

  return (
    <div className="invoice-generator">
      {!showPreview ? (
        <>
          <div className="invoice-header">
            <h2>Generate Invoice</h2>
            <div className="header-actions">
              <button onClick={() => setShowPreview(true)} className="btn-preview">
                Preview Invoice
              </button>
            </div>
          </div>
          
          <div className="invoice-form">
            <div className="form-section">
              <h3>Select Order & Template</h3>
              <div className="form-group">
                <label>Order *</label>
                <select 
                  value={selectedOrder} 
                  onChange={(e) => handleOrderSelect(e.target.value)}
                  required
                >
                  <option value="">Select an order to generate invoice</option>
                  {orders.filter(order => order.status === 'Completed').map(order => (
                    <option key={order.id} value={order.id}>
                      #{order.id} - {order.clientName} - ${order.totalAmount.toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>
              
              <div className="form-group">
                <label>Invoice Template</label>
                <select 
                  value={selectedTemplate} 
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                >
                  <option value="">Default Template</option>
                  {templates.map(template => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {selectedOrder && (
                <div className="form-group">
                  <label>Invoice Quantity</label>
                  <input
                    type="number"
                    value={customQuantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    placeholder="Enter quantity for invoice"
                    min="1"
                  />
                  <small className="form-help">Default: {orders.find(o => o.id === parseInt(selectedOrder))?.quantity || 0} (Order Quantity)</small>
                </div>
              )}
            </div>

            {selectedOrder && (
              <>
                <div className="form-section">
                  <h3>Invoice Details</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Invoice Number</label>
                      <input
                        type="text"
                        name="invoiceNumber"
                        value={invoiceData.invoiceNumber}
                        onChange={handleInputChange}
                        disabled
                      />
                    </div>
                    <div className="form-group">
                      <label>Invoice Date</label>
                      <input
                        type="date"
                        name="invoiceDate"
                        value={invoiceData.invoiceDate}
                        onChange={handleInputChange}
                      />
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label>Due Date</label>
                      <input
                        type="date"
                        name="dueDate"
                        value={invoiceData.dueDate}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="form-group">
                      <label>Payment Terms</label>
                      <select name="paymentTerms" value={invoiceData.paymentTerms} onChange={handleInputChange}>
                        <option value="15 days">Net 15</option>
                        <option value="30 days">Net 30</option>
                        <option value="45 days">Net 45</option>
                        <option value="60 days">Net 60</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Client Information</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Client Name</label>
                      <input
                        type="text"
                        name="clientName"
                        value={invoiceData.clientName}
                        onChange={handleInputChange}
                        placeholder="Client company name"
                      />
                    </div>
                    <div className="form-group">
                      <label>Client Email</label>
                      <input
                        type="email"
                        name="clientEmail"
                        value={invoiceData.clientEmail}
                        onChange={handleInputChange}
                        placeholder="client@company.com"
                      />
                    </div>
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label>Client Phone</label>
                      <input
                        type="tel"
                        name="clientPhone"
                        value={invoiceData.clientPhone}
                        onChange={handleInputChange}
                        placeholder="+1-555-0123"
                      />
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label>Client Address</label>
                    <textarea
                      name="clientAddress"
                      value={invoiceData.clientAddress}
                      onChange={handleInputChange}
                      placeholder="Complete billing address"
                      rows="3"
                    />
                    <small className="form-help">Address from order: {orders.find(o => o.id === parseInt(selectedOrder))?.address}</small>
                  </div>
                </div>

                <div className="form-section">
                  <h3>Additional Notes</h3>
                  <div className="form-group">
                    <label>Notes</label>
                    <textarea
                      name="notes"
                      value={invoiceData.notes}
                      onChange={handleInputChange}
                      placeholder="Thank you for your business!"
                      rows="3"
                    />
                  </div>
                </div>

                <div className="invoice-summary">
                  <div className="summary-row">
                    <span>Subtotal:</span>
                    <span>${calculateSubtotal().toLocaleString()}</span>
                  </div>
                  <div className="summary-row">
                    <span>Tax (8%):</span>
                    <span>${calculateTax().toLocaleString()}</span>
                  </div>
                  <div className="summary-row total">
                    <span>Total Amount:</span>
                    <span>${calculateTotal().toLocaleString()}</span>
                  </div>
                </div>

                <div className="form-actions">
                  <button onClick={saveInvoice} className="btn-save">
                    Save Invoice
                  </button>
                  <button onClick={() => setShowPreview(true)} className="btn-preview">
                    Preview & Print
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="invoice-preview">
          <div className="preview-header">
            <button onClick={() => setShowPreview(false)} className="btn-back">
              ← Back to Edit
            </button>
            <div className="preview-actions">
              <button onClick={generatePDF} className="btn-print">
                Print/PDF
              </button>
              <button onClick={saveInvoice} className="btn-save">
                Save Invoice
              </button>
            </div>
          </div>
          
          {renderInvoiceByTemplate()}
        </div>
      )}
    </div>
  );
};

export default InvoiceGenerator;