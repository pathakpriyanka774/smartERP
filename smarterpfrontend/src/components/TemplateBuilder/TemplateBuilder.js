import React, { useState } from 'react';
import './TemplateBuilder.css';

const TemplateBuilder = () => {
  const [invoiceData, setInvoiceData] = useState({
    // Company Information
    companyName: 'RADHA KRISHN EXPORT',
    companyAddress: 'C-49',
    sector: 'SECTOR 38',
    city: 'Noida Uttar Pradesh',
    pincode: '201305',
    country: 'India',
    gstin: 'GSTIN 09CJPG2343K1Z6',
    phone: '8057563842',
    email: 'radhakrishnexport123@gmail.com',
    website: 'www.radhakrishnexport.com',
    
    // Invoice Details
    invoiceNo: 'RK-484',
    invoiceDate: '15/05/2025',
    terms: '',
    dueDate: '15/05/2025',
    placeOfSupply: 'Uttar Pradesh (09)',
    
    // Bill To
    billToName: 'PARAMOUNT PRODUCTS PVT LTD',
    billToAddress: 'C-90',
    billToArea: 'HOSIERY COMPLEX PHASE-2,',
    billToCity: 'NOIDA',
    billToPincode: '201305 Uttar Pradesh',
    billToCountry: 'India',
    billToGstin: 'GSTIN 09AACCP1238T26',
    
    // Ship To
    shipToName: 'C-90',
    shipToAddress: 'HOSIERY COMPLEX PHASE-2,',
    shipToCity: 'NOIDA',
    shipToPincode: '201305 Uttar Pradesh',
    shipToCountry: 'India',
    shipToGstin: 'GSTIN 09AACCP1238T26',
    
    // Items
    items: [{
      sno: 1,
      description: 'HT-AB-306',
      hsn: '581100',
      qty: 2182.63,
      rate: 40,
      per: '%',
      amt: 87305.20,
      cgstPer: 2.5,
      cgstAmt: 2182.63,
      sgstPer: 2.5,
      sgstAmt: 2182.63,
      amount: 91670.46
    }],
    
    // Bank Details
    bankName: 'CANARA BANK',
    accountNo: '1200356138778',
    ifscCode: 'CNRB0007820',
    ewayBillNo: '491622361563',
    
    // Terms & Conditions
    termsConditions: `• Return & After Policy: Returns for alteration are accepted within 2 days of delivery.
• Ownership & Risk: Any loss or damage after delivery is the buyer's responsibility.
• Payment Terms: Payment is due within 15 to 30 days from the invoice date.
• Taxes & Duties: All applicable taxes, including GST, are the responsibility of the buyer unless stated otherwise.
• Shipping & Delivery: Any delivery timelines provided are estimates.`
  });

  const calculateItemTotals = (item) => {
    const amt = item.qty * item.rate;
    const cgstAmt = (amt * item.cgstPer) / 100;
    const sgstAmt = (amt * item.sgstPer) / 100;
    const amount = amt + cgstAmt + sgstAmt;
    
    return { ...item, amt, cgstAmt, sgstAmt, amount };
  };

  const updateItem = (index, field, value) => {
    const newItems = [...invoiceData.items];
    newItems[index][field] = parseFloat(value) || value;
    newItems[index] = calculateItemTotals(newItems[index]);
    setInvoiceData({ ...invoiceData, items: newItems });
  };

  const addItem = () => {
    const newItem = {
      sno: invoiceData.items.length + 1,
      description: '',
      hsn: '',
      qty: 0,
      rate: 0,
      per: '%',
      amt: 0,
      cgstPer: 2.5,
      cgstAmt: 0,
      sgstPer: 2.5,
      sgstAmt: 0,
      amount: 0
    };
    setInvoiceData({ ...invoiceData, items: [...invoiceData.items, newItem] });
  };

  const removeItem = (index) => {
    const newItems = invoiceData.items.filter((_, i) => i !== index);
    setInvoiceData({ ...invoiceData, items: newItems });
  };

  const getTotals = () => {
    const subTotal = invoiceData.items.reduce((sum, item) => sum + item.amt, 0);
    const totalCgst = invoiceData.items.reduce((sum, item) => sum + item.cgstAmt, 0);
    const totalSgst = invoiceData.items.reduce((sum, item) => sum + item.sgstAmt, 0);
    const grandTotal = subTotal + totalCgst + totalSgst;
    
    return { subTotal, totalCgst, totalSgst, grandTotal };
  };

  const numberToWords = (num) => {
    // Simplified number to words conversion
    return `Indian Rupee ${Math.floor(num).toLocaleString()} and ${Math.round((num % 1) * 100)} Paise Only`;
  };

  const handleInputChange = (field, value) => {
    setInvoiceData({ ...invoiceData, [field]: value });
  };

  const saveTemplate = () => {
    const template = {
      name: 'Professional Invoice Template',
      type: 'Invoice',
      id: Date.now(),
      createdAt: new Date().toISOString(),
      data: invoiceData
    };
    
    const templates = JSON.parse(localStorage.getItem('templates') || '[]');
    templates.push(template);
    localStorage.setItem('templates', JSON.stringify(templates));
    alert('Invoice Template saved successfully!');
  };

  const totals = getTotals();

  return (
    <div className="template-builder">
      <div className="builder-header">
        <h2>Professional Invoice Template Builder</h2>
        <div className="template-actions">
          <button onClick={saveTemplate} className="save-btn">Save Template</button>
          <button onClick={() => window.print()} className="print-btn">Print Invoice</button>
        </div>
      </div>

      <div className="invoice-builder">
        <div className="invoice-form-panel">
          <div className="form-sections">
            
            {/* 1. Company Information */}
            <div className="form-section">
              <h3>1. Company Information</h3>
              <div className="form-group">
                <label>Company Name</label>
                <input type="text" value={invoiceData.companyName} onChange={(e) => handleInputChange('companyName', e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Address</label>
                  <input type="text" value={invoiceData.companyAddress} onChange={(e) => handleInputChange('companyAddress', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Sector</label>
                  <input type="text" value={invoiceData.sector} onChange={(e) => handleInputChange('sector', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>City & State</label>
                  <input type="text" value={invoiceData.city} onChange={(e) => handleInputChange('city', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Pincode</label>
                  <input type="text" value={invoiceData.pincode} onChange={(e) => handleInputChange('pincode', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>GSTIN</label>
                  <input type="text" value={invoiceData.gstin} onChange={(e) => handleInputChange('gstin', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Phone</label>
                  <input type="text" value={invoiceData.phone} onChange={(e) => handleInputChange('phone', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={invoiceData.email} onChange={(e) => handleInputChange('email', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Website</label>
                  <input type="text" value={invoiceData.website} onChange={(e) => handleInputChange('website', e.target.value)} />
                </div>
              </div>
            </div>

            {/* 2. Invoice Details */}
            <div className="form-section">
              <h3>2. Invoice Details</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Invoice No.</label>
                  <input type="text" value={invoiceData.invoiceNo} onChange={(e) => handleInputChange('invoiceNo', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Invoice Date</label>
                  <input type="text" value={invoiceData.invoiceDate} onChange={(e) => handleInputChange('invoiceDate', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Due Date</label>
                  <input type="text" value={invoiceData.dueDate} onChange={(e) => handleInputChange('dueDate', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Place of Supply</label>
                  <input type="text" value={invoiceData.placeOfSupply} onChange={(e) => handleInputChange('placeOfSupply', e.target.value)} />
                </div>
              </div>
            </div>

            {/* 3. Bill To */}
            <div className="form-section">
              <h3>3. Bill To</h3>
              <div className="form-group">
                <label>Company Name</label>
                <input type="text" value={invoiceData.billToName} onChange={(e) => handleInputChange('billToName', e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Address</label>
                  <input type="text" value={invoiceData.billToAddress} onChange={(e) => handleInputChange('billToAddress', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Area</label>
                  <input type="text" value={invoiceData.billToArea} onChange={(e) => handleInputChange('billToArea', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>City</label>
                  <input type="text" value={invoiceData.billToCity} onChange={(e) => handleInputChange('billToCity', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Pincode & State</label>
                  <input type="text" value={invoiceData.billToPincode} onChange={(e) => handleInputChange('billToPincode', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>GSTIN</label>
                <input type="text" value={invoiceData.billToGstin} onChange={(e) => handleInputChange('billToGstin', e.target.value)} />
              </div>
            </div>

            {/* 4. Ship To */}
            <div className="form-section">
              <h3>4. Ship To</h3>
              <div className="form-group">
                <label>Shipping Address</label>
                <input type="text" value={invoiceData.shipToName} onChange={(e) => handleInputChange('shipToName', e.target.value)} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Area</label>
                  <input type="text" value={invoiceData.shipToAddress} onChange={(e) => handleInputChange('shipToAddress', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>City</label>
                  <input type="text" value={invoiceData.shipToCity} onChange={(e) => handleInputChange('shipToCity', e.target.value)} />
                </div>
              </div>
              <div className="form-group">
                <label>Pincode & State</label>
                <input type="text" value={invoiceData.shipToPincode} onChange={(e) => handleInputChange('shipToPincode', e.target.value)} />
              </div>
            </div>

            {/* 5. Items */}
            <div className="form-section">
              <h3>5. Items</h3>
              {invoiceData.items.map((item, index) => (
                <div key={index} className="item-form">
                  <div className="item-header">
                    <h4>Item {index + 1}</h4>
                    <button onClick={() => removeItem(index)} className="remove-btn">Remove</button>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Description</label>
                      <input type="text" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>HSN/SAC</label>
                      <input type="text" value={item.hsn} onChange={(e) => updateItem(index, 'hsn', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Quantity</label>
                      <input type="number" value={item.qty} onChange={(e) => updateItem(index, 'qty', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Rate</label>
                      <input type="number" value={item.rate} onChange={(e) => updateItem(index, 'rate', e.target.value)} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>CGST %</label>
                      <input type="number" value={item.cgstPer} onChange={(e) => updateItem(index, 'cgstPer', e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>SGST %</label>
                      <input type="number" value={item.sgstPer} onChange={(e) => updateItem(index, 'sgstPer', e.target.value)} />
                    </div>
                  </div>
                  <div className="calculated-fields">
                    <span>Amount: ₹{item.amt.toFixed(2)}</span>
                    <span>CGST: ₹{item.cgstAmt.toFixed(2)}</span>
                    <span>SGST: ₹{item.sgstAmt.toFixed(2)}</span>
                    <span>Total: ₹{item.amount.toFixed(2)}</span>
                  </div>
                </div>
              ))}
              <button onClick={addItem} className="add-item-btn">+ Add Item</button>
            </div>

            {/* 6. Bank Details */}
            <div className="form-section">
              <h3>6. Bank Details & Signature</h3>
              <div className="form-row">
                <div className="form-group">
                  <label>Bank Name</label>
                  <input type="text" value={invoiceData.bankName} onChange={(e) => handleInputChange('bankName', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Account No.</label>
                  <input type="text" value={invoiceData.accountNo} onChange={(e) => handleInputChange('accountNo', e.target.value)} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>IFSC Code</label>
                  <input type="text" value={invoiceData.ifscCode} onChange={(e) => handleInputChange('ifscCode', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>E-Way Bill No.</label>
                  <input type="text" value={invoiceData.ewayBillNo} onChange={(e) => handleInputChange('ewayBillNo', e.target.value)} />
                </div>
              </div>
            </div>

            {/* 7. Terms & Conditions */}
            <div className="form-section">
              <h3>7. Terms & Conditions</h3>
              <div className="form-group">
                <label>Terms & Conditions</label>
                <textarea 
                  rows="6" 
                  value={invoiceData.termsConditions} 
                  onChange={(e) => handleInputChange('termsConditions', e.target.value)} 
                />
              </div>
            </div>

          </div>
        </div>

        <div className="invoice-preview-panel">
          <div className="professional-invoice" id="invoice-template">
            <div className="invoice-header">
              <div className="company-section">
                <div className="company-logo-section">
                  <div className="logo-emblem">🏭</div>
                  <div className="company-details">
                    <h2>{invoiceData.companyName}</h2>
                    <div className="company-address">
                      <div>{invoiceData.companyAddress}</div>
                      <div>{invoiceData.sector}</div>
                      <div>{invoiceData.city} {invoiceData.pincode}</div>
                      <div>{invoiceData.country}</div>
                    </div>
                    <div className="company-contact">
                      <div>{invoiceData.gstin}</div>
                      <div>{invoiceData.phone}</div>
                      <div>{invoiceData.email}</div>
                      <div>{invoiceData.website}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="invoice-title-section">
                <h1>TAX INVOICE</h1>
              </div>
            </div>

            <div className="invoice-info-row">
              <div className="invoice-details">
                <table className="info-table">
                  <tbody>
                    <tr><td>Invoice No.</td><td>: {invoiceData.invoiceNo}</td></tr>
                    <tr><td>Invoice Date</td><td>: {invoiceData.invoiceDate}</td></tr>
                    <tr><td>Terms</td><td>: {invoiceData.terms}</td></tr>
                    <tr><td>Due Date</td><td>: {invoiceData.dueDate}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="supply-details">
                <table className="info-table">
                  <tbody>
                    <tr><td>Place of Supply</td><td>: {invoiceData.placeOfSupply}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="parties-section">
              <div className="bill-to-section">
                <h4>Bill To</h4>
                <div className="party-details">
                  <strong>{invoiceData.billToName}</strong>
                  <div>{invoiceData.billToAddress}</div>
                  <div>{invoiceData.billToArea}</div>
                  <div>{invoiceData.billToCity}</div>
                  <div>{invoiceData.billToPincode}</div>
                  <div>{invoiceData.billToCountry}</div>
                  <div>{invoiceData.billToGstin}</div>
                </div>
              </div>
              <div className="ship-to-section">
                <h4>Ship To</h4>
                <div className="party-details">
                  <strong>{invoiceData.shipToName}</strong>
                  <div>{invoiceData.shipToAddress}</div>
                  <div>{invoiceData.shipToCity}</div>
                  <div>{invoiceData.shipToPincode}</div>
                  <div>{invoiceData.shipToCountry}</div>
                  <div>{invoiceData.shipToGstin}</div>
                </div>
              </div>
            </div>

            <table className="items-table">
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
                  <th>%</th>
                  <th>Amt</th>
                  <th>%</th>
                  <th>Amt</th>
                </tr>
              </thead>
              <tbody>
                {invoiceData.items.map((item, index) => (
                  <tr key={index}>
                    <td>{item.sno}</td>
                    <td>{item.description}</td>
                    <td>{item.hsn}</td>
                    <td>{item.qty.toLocaleString()}</td>
                    <td>{item.rate}</td>
                    <td>{item.per}</td>
                    <td>{item.amt.toFixed(2)}</td>
                    <td>{item.cgstPer}%</td>
                    <td>{item.cgstAmt.toFixed(2)}</td>
                    <td>{item.sgstPer}%</td>
                    <td>{item.sgstAmt.toFixed(2)}</td>
                    <td>{item.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="totals-section">
              <div className="total-in-words">
                <strong>Total in Words</strong><br/>
                <em>{numberToWords(totals.grandTotal)}</em>
              </div>
              <div className="amount-totals">
                <table className="totals-table">
                  <tbody>
                    <tr><td>Sub Total</td><td>{totals.subTotal.toFixed(2)}</td></tr>
                    <tr><td>CGST 2.5 (2.5%)</td><td>{totals.totalCgst.toFixed(2)}</td></tr>
                    <tr><td>SGST 2.5 (2.5%)</td><td>{totals.totalSgst.toFixed(2)}</td></tr>
                    <tr><td><strong>Total</strong></td><td><strong>{totals.grandTotal.toFixed(2)}</strong></td></tr>
                    <tr><td><strong>Balance Due</strong></td><td><strong>{totals.grandTotal.toFixed(2)}</strong></td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div className="footer-section">
              <div className="bank-details">
                <strong>BANK NAME : {invoiceData.bankName}</strong><br/>
                <strong>A/C NO. : {invoiceData.accountNo}</strong><br/>
                <strong>IFSC CODE : {invoiceData.ifscCode}</strong><br/><br/>
                <strong>E-WAY BILL NO. : {invoiceData.ewayBillNo}</strong>
              </div>
              <div className="signature-section">
                <strong>Authorised Signature</strong>
              </div>
            </div>

            <div className="terms-section">
              <strong>Terms & Conditions:</strong><br/>
              <small>{invoiceData.termsConditions}</small>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateBuilder;