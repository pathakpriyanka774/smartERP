import React, { useState } from 'react';
import './Expenses.css';

const Expenses = () => {
  const [activeTab, setActiveTab] = useState('overview');

  const expenses = [
    { id: 1, date: '2024-05-15', category: 'Raw Materials', description: 'Cotton fabric purchase', amount: 2500, type: 'expense' },
    { id: 2, date: '2024-05-14', category: 'Labor', description: 'Worker wages - May', amount: 4200, type: 'expense' },
    { id: 3, date: '2024-05-13', category: 'Utilities', description: 'Electricity bill', amount: 850, type: 'expense' },
    { id: 4, date: '2024-05-12', category: 'Revenue', description: 'Order #1003 payment', amount: 12500, type: 'income' },
    { id: 5, date: '2024-05-11', category: 'Equipment', description: 'Sewing machine maintenance', amount: 300, type: 'expense' }
  ];

  const budgets = [
    { category: 'Raw Materials', budgeted: 15000, spent: 8500, remaining: 6500 },
    { category: 'Labor', budgeted: 20000, spent: 12600, remaining: 7400 },
    { category: 'Utilities', budgeted: 3000, spent: 1850, remaining: 1150 },
    { category: 'Equipment', budgeted: 5000, spent: 2300, remaining: 2700 }
  ];

  const totalIncome = expenses.filter(e => e.type === 'income').reduce((sum, e) => sum + e.amount, 0);
  const totalExpenses = expenses.filter(e => e.type === 'expense').reduce((sum, e) => sum + e.amount, 0);
  const netProfit = totalIncome - totalExpenses;

  return (
    <div className="expenses">
      <h1>Expenses & Finance</h1>
      
      <div className="finance-tabs">
        <button 
          className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          Transactions
        </button>
        <button 
          className={`tab-btn ${activeTab === 'budget' ? 'active' : ''}`}
          onClick={() => setActiveTab('budget')}
        >
          Budget
        </button>
      </div>

      {activeTab === 'overview' && (
        <>
          <div className="stats-grid">
            <div className="stat-card income">
              <h3>Total Income</h3>
              <div className="stat-value">${totalIncome.toLocaleString()}</div>
            </div>
            <div className="stat-card expense">
              <h3>Total Expenses</h3>
              <div className="stat-value">${totalExpenses.toLocaleString()}</div>
            </div>
            <div className={`stat-card ${netProfit >= 0 ? 'profit' : 'loss'}`}>
              <h3>Net Profit</h3>
              <div className="stat-value">${netProfit.toLocaleString()}</div>
            </div>
            <div className="stat-card">
              <h3>Cash Flow</h3>
              <div className="stat-value">$45,200</div>
            </div>
          </div>

          <div className="recent-transactions">
            <h2>Recent Transactions</h2>
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {expenses.slice(0, 5).map(expense => (
                  <tr key={expense.id}>
                    <td>{expense.date}</td>
                    <td>{expense.description}</td>
                    <td>{expense.category}</td>
                    <td className={expense.type}>
                      {expense.type === 'income' ? '+' : '-'}${expense.amount.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'transactions' && (
        <div className="transactions-section">
          <div className="section-header">
            <h2>All Transactions</h2>
            <button className="add-btn">+ Add Transaction</button>
          </div>
          <table className="transactions-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Category</th>
                <th>Type</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map(expense => (
                <tr key={expense.id}>
                  <td>{expense.date}</td>
                  <td>{expense.description}</td>
                  <td>{expense.category}</td>
                  <td>
                    <span className={`type-badge ${expense.type}`}>
                      {expense.type}
                    </span>
                  </td>
                  <td className={expense.type}>
                    {expense.type === 'income' ? '+' : '-'}${expense.amount.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'budget' && (
        <div className="budget-section">
          <div className="section-header">
            <h2>Budget Overview</h2>
            <button className="add-btn">+ Set Budget</button>
          </div>
          <div className="budget-cards">
            {budgets.map((budget, index) => (
              <div key={index} className="budget-card">
                <h3>{budget.category}</h3>
                <div className="budget-amounts">
                  <div className="budget-item">
                    <span>Budgeted:</span>
                    <span>${budget.budgeted.toLocaleString()}</span>
                  </div>
                  <div className="budget-item">
                    <span>Spent:</span>
                    <span>${budget.spent.toLocaleString()}</span>
                  </div>
                  <div className="budget-item">
                    <span>Remaining:</span>
                    <span className={budget.remaining > 0 ? 'positive' : 'negative'}>
                      ${budget.remaining.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="budget-progress">
                  <div 
                    className="progress-bar"
                    style={{ width: `${(budget.spent / budget.budgeted) * 100}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;